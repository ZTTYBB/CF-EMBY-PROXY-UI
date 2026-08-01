#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from dataclasses import dataclass
from pathlib import Path


DEFAULT_SYMBOL = "UI_HTML"
ADMIN_BOOTSTRAP_PLACEHOLDER = "__ADMIN_BOOTSTRAP_JSON__"
ADMIN_INIT_HEALTH_BANNER_PLACEHOLDER = "__INIT_HEALTH_BANNER__"
ADMIN_APP_ROOT_PLACEHOLDER = "__ADMIN_APP_ROOT__"
ADMIN_BOOTSTRAP_JSON_SCRIPT = (
    '<script id="admin-bootstrap" type="application/json">'
    f"{ADMIN_BOOTSTRAP_PLACEHOLDER}</script>"
)
ADMIN_BOOTSTRAP_LOADER_SCRIPT = (
    '<script id="admin-bootstrap-loader">'
    "try{window.__ADMIN_BOOTSTRAP__=JSON.parse(document.getElementById("
    '"admin-bootstrap")?.textContent||"{}")}catch(_){window.__ADMIN_BOOTSTRAP__='
    'window.__ADMIN_BOOTSTRAP__||{},window.__ADMIN_UI_BOOT_ERROR__='
    'window.__ADMIN_UI_BOOT_ERROR__||"admin bootstrap parse failed: "+'
    '(_?.message||String(_||"unknown_error"))}</script>'
)


class ExtractError(RuntimeError):
    pass


@dataclass(frozen=True)
class ExtractedTemplate:
    source_path: Path
    symbol: str
    assignment_start: int
    literal_start: int
    literal_end: int
    block_end: int
    raw_value: str
    html: str

    def start_line(self, source: str) -> int:
        return source.count("\n", 0, self.assignment_start) + 1

    def end_line(self, source: str) -> int:
        return source.count("\n", 0, self.block_end) + 1


def resolve_path(value: str | Path) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()
    return path


def validate_symbol(symbol: str) -> str:
    normalized = str(symbol or "").strip()
    if not re.fullmatch(r"[A-Za-z_$][0-9A-Za-z_$]*", normalized):
        raise ExtractError(f"invalid JavaScript identifier: {symbol!r}")
    return normalized


def find_template_assignment(source: str, symbol: str) -> tuple[int, int]:
    pattern = re.compile(
        rf"\b(?:export\s+)?(?:const|let|var)\s+{re.escape(symbol)}\s*=\s*"
    )
    for match in pattern.finditer(source):
        cursor = match.end()
        while cursor < len(source) and source[cursor].isspace():
            cursor += 1
        if cursor < len(source) and source[cursor] == "`":
            return match.start(), cursor
    raise ExtractError(f"failed to locate template literal assignment for {symbol}")


def scan_template_literal_end(source: str, literal_start: int) -> int:
    if literal_start >= len(source) or source[literal_start] != "`":
        raise ExtractError("template literal start does not point at a backtick")

    cursor = literal_start + 1
    while cursor < len(source):
        current = source[cursor]
        if current == "\\":
            cursor += 2
            continue
        if current == "`":
            return cursor
        if current == "$" and source[cursor + 1 : cursor + 2] == "{":
            line = source.count("\n", 0, cursor) + 1
            raise ExtractError(
                "unsupported dynamic template interpolation "
                f"inside UI template at line {line}"
            )
        cursor += 1

    raise ExtractError("unterminated JavaScript template literal")


def decode_code_point(value: str) -> str:
    code_point = int(value, 16)
    try:
        return chr(code_point)
    except ValueError as exc:
        raise ExtractError(f"invalid Unicode code point: U+{value}") from exc


def decode_js_template_literal(raw: str) -> str:
    result: list[str] = []
    cursor = 0

    while cursor < len(raw):
        current = raw[cursor]
        if current != "\\":
            result.append(current)
            cursor += 1
            continue

        if cursor + 1 >= len(raw):
            result.append("\\")
            cursor += 1
            continue

        escaped = raw[cursor + 1]
        simple_escapes = {
            "\\": "\\",
            "`": "`",
            "$": "$",
            "b": "\b",
            "f": "\f",
            "n": "\n",
            "r": "\r",
            "t": "\t",
            "v": "\v",
        }

        if escaped in simple_escapes:
            result.append(simple_escapes[escaped])
            cursor += 2
            continue

        if escaped == "\r":
            cursor += 3 if raw[cursor + 2 : cursor + 3] == "\n" else 2
            continue
        if escaped in {"\n", "\u2028", "\u2029"}:
            cursor += 2
            continue

        if escaped == "0" and not raw[cursor + 2 : cursor + 3].isdigit():
            result.append("\0")
            cursor += 2
            continue

        if escaped == "x":
            hex_value = raw[cursor + 2 : cursor + 4]
            if re.fullmatch(r"[0-9A-Fa-f]{2}", hex_value):
                result.append(chr(int(hex_value, 16)))
                cursor += 4
                continue
            raise ExtractError(f"invalid hex escape near offset {cursor}")

        if escaped == "u":
            if raw[cursor + 2 : cursor + 3] == "{":
                end = raw.find("}", cursor + 3)
                if end < 0:
                    raise ExtractError(f"unterminated Unicode escape near offset {cursor}")
                hex_value = raw[cursor + 3 : end]
                if not re.fullmatch(r"[0-9A-Fa-f]{1,6}", hex_value):
                    raise ExtractError(f"invalid Unicode escape near offset {cursor}")
                result.append(decode_code_point(hex_value))
                cursor = end + 1
                continue

            hex_value = raw[cursor + 2 : cursor + 6]
            if re.fullmatch(r"[0-9A-Fa-f]{4}", hex_value):
                result.append(decode_code_point(hex_value))
                cursor += 6
                continue
            raise ExtractError(f"invalid Unicode escape near offset {cursor}")

        result.append(escaped)
        cursor += 2

    return "".join(result)


def extract_template(source_path: Path, symbol: str) -> tuple[str, ExtractedTemplate]:
    source = source_path.read_text(encoding="utf-8")
    assignment_start, literal_start = find_template_assignment(source, symbol)
    literal_end = scan_template_literal_end(source, literal_start)
    raw_value = source[literal_start + 1 : literal_end]
    block_end = literal_end + 1
    html = decode_js_template_literal(raw_value)
    template = ExtractedTemplate(
        source_path=source_path,
        symbol=symbol,
        assignment_start=assignment_start,
        literal_start=literal_start,
        literal_end=literal_end,
        block_end=block_end,
        raw_value=raw_value,
        html=html,
    )
    return source, template


def insert_after_head_open(html: str, snippet: str) -> str:
    match = re.search(r"<head\b[^>]*>", html, flags=re.IGNORECASE)
    if not match:
        raise ExtractError("cannot inject admin bootstrap scripts: missing <head>")
    return f"{html[:match.end()]}{snippet}{html[match.end():]}"


def insert_after_body_open(html: str, snippet: str) -> str:
    match = re.search(r"<body\b[^>]*>", html, flags=re.IGNORECASE)
    if not match:
        raise ExtractError("cannot inject admin placeholders: missing <body>")
    return f"{html[:match.end()]}{snippet}{html[match.end():]}"


def to_admin_runtime_template(html: str) -> str:
    output = html
    bootstrap_scripts = ADMIN_BOOTSTRAP_JSON_SCRIPT + ADMIN_BOOTSTRAP_LOADER_SCRIPT

    legacy_bootstrap_pattern = re.compile(
        r"<script>\s*window\.__ADMIN_BOOTSTRAP__\s*=\s*"
        + re.escape(ADMIN_BOOTSTRAP_PLACEHOLDER)
        + r"\s*[,;]?",
        flags=re.IGNORECASE,
    )
    output, replaced = legacy_bootstrap_pattern.subn(
        bootstrap_scripts + "<script>",
        output,
        count=1,
    )
    if replaced == 0 and 'id="admin-bootstrap-loader"' not in output:
        output = insert_after_head_open(output, bootstrap_scripts)

    if ADMIN_APP_ROOT_PLACEHOLDER not in output:
        output, replaced = re.subn(
            r'<div\b(?=[^>]*\bid=(["\'])app\1)[^>]*>\s*</div>',
            ADMIN_APP_ROOT_PLACEHOLDER,
            output,
            count=1,
            flags=re.IGNORECASE,
        )
        if replaced == 0:
            output = insert_after_body_open(output, ADMIN_APP_ROOT_PLACEHOLDER)

    if ADMIN_INIT_HEALTH_BANNER_PLACEHOLDER not in output:
        if ADMIN_APP_ROOT_PLACEHOLDER in output:
            output = output.replace(
                ADMIN_APP_ROOT_PLACEHOLDER,
                ADMIN_INIT_HEALTH_BANNER_PLACEHOLDER + ADMIN_APP_ROOT_PLACEHOLDER,
                1,
            )
        else:
            output = insert_after_body_open(output, ADMIN_INIT_HEALTH_BANNER_PLACEHOLDER)

    return output


def validate_html(html: str, *, require_admin_template: bool = False) -> None:
    source = str(html or "")
    lower = source.lower()
    if not re.search(r"<!doctype\s+html\b|<html\b", source, flags=re.IGNORECASE):
        raise ExtractError("extracted content does not look like an HTML document")
    if "</html>" not in lower:
        raise ExtractError("extracted HTML is missing </html>")
    if require_admin_template:
        missing = [
            ADMIN_BOOTSTRAP_PLACEHOLDER,
            ADMIN_INIT_HEALTH_BANNER_PLACEHOLDER,
            ADMIN_APP_ROOT_PLACEHOLDER,
        ]
        missing = [token for token in missing if token not in source]
        if missing:
            raise ExtractError(
                "admin-template mode is missing placeholders: " + ", ".join(missing)
            )
        if not re.search(
            r"<script(?=[^>]*\bid=(['\"])admin-bootstrap-loader\1)[^>]*>",
            source,
            flags=re.IGNORECASE,
        ):
            raise ExtractError("admin-template mode is missing admin-bootstrap-loader")


def write_output(output_path: Path, content: str, *, force: bool) -> None:
    if output_path.exists() and not force:
        raise ExtractError(f"output already exists, pass --force to overwrite: {output_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = content if content.endswith("\n") else f"{content}\n"
    output_path.write_text(payload, encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Extract an embedded UI template literal from a JavaScript file."
    )
    parser.add_argument(
        "source",
        nargs="?",
        default="(1).js",
        help="JavaScript source file. Default: (1).js",
    )
    parser.add_argument(
        "output",
        nargs="?",
        help="Output HTML file. Omit to print HTML to stdout.",
    )
    parser.add_argument(
        "--symbol",
        default=DEFAULT_SYMBOL,
        help=f"Template literal variable to extract. Default: {DEFAULT_SYMBOL}",
    )
    parser.add_argument(
        "--mode",
        choices=("raw", "admin-template"),
        default="raw",
        help="raw keeps the extracted HTML; admin-template adds current sync placeholders.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate extraction without writing output unless --output is supplied.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite output file if it already exists.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        symbol = validate_symbol(args.symbol)
        source_path = resolve_path(args.source)
        if not source_path.exists():
            raise ExtractError(f"source file does not exist: {source_path}")

        source, template = extract_template(source_path, symbol)
        html = template.html
        if args.mode == "admin-template":
            html = to_admin_runtime_template(html)

        validate_html(html, require_admin_template=args.mode == "admin-template")
        digest = hashlib.sha256(html.encode("utf-8")).hexdigest()
        summary = (
            f"[extract-ui] {source_path} {symbol} "
            f"lines {template.start_line(source)}-{template.end_line(source)} "
            f"mode={args.mode} bytes={len(html.encode('utf-8'))} sha256={digest}"
        )

        output = getattr(args, "output", None)
        if output:
            output_path = resolve_path(output)
            write_output(output_path, html, force=bool(args.force))
            print(f"{summary} -> {output_path}", file=sys.stderr)
        elif not args.check:
            print(summary, file=sys.stderr)
            sys.stdout.write(html)
            if not html.endswith("\n"):
                sys.stdout.write("\n")
        else:
            print(summary, file=sys.stderr)

        return 0
    except ExtractError as exc:
        print(f"[extract-ui] error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
