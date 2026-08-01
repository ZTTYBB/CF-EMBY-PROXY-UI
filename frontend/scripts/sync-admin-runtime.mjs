import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  ADMIN_RUNTIME_ENHANCEMENT_SCRIPT,
  ADMIN_RUNTIME_ENHANCEMENT_STYLE
} from './admin-runtime-enhancements.mjs';
import { inspectRuntimeAssets } from './check-cdn-paths.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const sourceHtmlPath = path.resolve(repoRoot, 'frontend/admin-runtime.template.html');
const targetHtmlPath = path.resolve(repoRoot, 'frontend/index.html');
const targetMetaPath = path.resolve(repoRoot, 'frontend/.admin-runtime-sync.json');

const ADMIN_BOOTSTRAP_PLACEHOLDER = '__ADMIN_BOOTSTRAP_JSON__';
const ADMIN_INIT_HEALTH_BANNER_PLACEHOLDER = '__INIT_HEALTH_BANNER__';
const ADMIN_APP_ROOT_PLACEHOLDER = '__ADMIN_APP_ROOT__';
const ADMIN_APP_ROOT_HTML = '<div id="app" v-cloak></div>';

const PRIMARY_VIEWS = Object.freeze([
  'dashboard',
  'nodes',
  'logs',
  'dns',
  'settings'
]);

const SETTINGS_VISUAL_SECTIONS = Object.freeze([
  '系统 UI',
  '代理与网络',
  '静态资源策略',
  '安全防护',
  '日志设置',
  '监控告警',
  '账号设置',
  '备份与恢复'
]);

const SETTINGS_SAVE_GROUPS = Object.freeze([
  'ui',
  'proxy',
  'security',
  'logs',
  'account'
]);

function sha256(text = '') {
  return createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function serializeInlineJson(payload) {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

function buildFallbackBootstrap(adminPath = '/admin') {
  return {
    adminPath,
    loginPath: `${adminPath.replace(/\/+$/, '') || '/admin'}/login`,
    contract: {
      truthSources: {
        primaryUi: 'frontend/',
        templateHtml: 'frontend/admin-runtime.template.html',
        runtimeEnhancements: 'frontend/scripts/admin-runtime-enhancements.mjs',
        contractDoc: 'worker.md'
      },
      bootstrapActions: {
        default: 'getAdminBootstrap',
        settings: 'getSettingsBootstrap'
      },
      primaryViews: [...PRIMARY_VIEWS],
      settings: {
        visualSections: [...SETTINGS_VISUAL_SECTIONS],
        saveGroups: [...SETTINGS_SAVE_GROUPS]
      }
    }
  };
}

function validateSourceTemplate(templateHtml = '') {
  const source = String(templateHtml || '');
  const missing = [
    ADMIN_BOOTSTRAP_PLACEHOLDER,
    ADMIN_INIT_HEALTH_BANNER_PLACEHOLDER,
    ADMIN_APP_ROOT_PLACEHOLDER
  ].filter((token) => !source.includes(token));

  if (missing.length) {
    throw new Error(`admin runtime template 缺少占位符：${missing.join(', ')}`);
  }

  if (!/<script(?=[^>]*\bid="admin-bootstrap-loader")[^>]*>/i.test(source)) {
    throw new Error('admin runtime template 缺少 admin-bootstrap-loader 脚本');
  }

  if (/(?:dnsAutoUpload|DNS_AUTO_UPLOAD)[A-Za-z_]*/.test(source)) {
    throw new Error('admin runtime template 仍包含未受 Worker 支持的 dnsAutoUpload 配置');
  }

  const runtimeInspection = inspectRuntimeAssets(source);
  if (runtimeInspection.inlineDynamicImports.length) {
    throw new Error('admin runtime template 不得包含任何 inline 动态 import');
  }
}

function materializeFrontendIndex(templateHtml = '') {
  validateSourceTemplate(templateHtml);

  const output = String(templateHtml || '')
    .replace(ADMIN_BOOTSTRAP_PLACEHOLDER, serializeInlineJson(buildFallbackBootstrap()))
    .replace(ADMIN_INIT_HEALTH_BANNER_PLACEHOLDER, '')
    .replace(ADMIN_APP_ROOT_PLACEHOLDER, ADMIN_APP_ROOT_HTML);

  const unresolvedTokens = [
    ADMIN_BOOTSTRAP_PLACEHOLDER,
    ADMIN_INIT_HEALTH_BANNER_PLACEHOLDER,
    ADMIN_APP_ROOT_PLACEHOLDER
  ].filter((token) => output.includes(token));

  if (unresolvedTokens.length) {
    throw new Error(`frontend/index.html 仍残留占位符：${unresolvedTokens.join(', ')}`);
  }

  if (!/<script(?=[^>]*\bid="admin-bootstrap")(?=[^>]*\btype="application\/json")[^>]*>\s*\{[\s\S]*?\}\s*<\/script>/i.test(output)) {
    throw new Error('frontend/index.html 缺少可解析的 admin-bootstrap JSON 脚本');
  }

  if (!output.includes(ADMIN_APP_ROOT_HTML)) {
    throw new Error('frontend/index.html 缺少 #app 根节点');
  }

  return composeAdminRuntimeEnhancements(output);
}

function composeAdminRuntimeEnhancements(outputHtml = '') {
  const output = String(outputHtml || '')
    .replace(
    '},syncSettingsFormFromRuntimeConfig',
    "},syncReleaseSourcePreviewInSettingsForm(){const r=this.settingsForm&&typeof this.settingsForm==='object'?this.settingsForm:{};const o=String(r.githubRepo||r.releaseRepo||r.repo||'').trim();if(o&&r.githubRepo!==o)r.githubRepo=o;return o},syncSettingsFormFromRuntimeConfig"
  )
    .replace(
      'this.apiCall("saveConfig",{config:p,meta:{section:o,source:"ui"}})',
      'this.apiCall("saveConfig",{config:p,expectedConfigRevision:String(this.adminRevisions?.configRevision||""),meta:{section:o,source:"ui"}})'
    );
  if (!output.includes('</head>')) {
    throw new Error('frontend/index.html 缺少 </head>，无法组合 runtime enhancements');
  }
  if (output.includes('data-admin-runtime-enhancements="1"')) {
    throw new Error('admin runtime template 不得内嵌重复的 runtime enhancements');
  }

  const composed = output.replace(
    '</head>',
    `${ADMIN_RUNTIME_ENHANCEMENT_STYLE}${ADMIN_RUNTIME_ENHANCEMENT_SCRIPT}</head>`
  );
  const enhancementMarkerCount = composed.match(/data-admin-runtime-enhancements="1"/g)?.length || 0;
  if (enhancementMarkerCount !== 2) {
    throw new Error(`frontend/index.html runtime enhancements 数量异常：${enhancementMarkerCount}`);
  }
  return composed;
}

async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

async function main() {
  const sourceHtml = await readText(sourceHtmlPath);
  const nextIndexHtml = materializeFrontendIndex(sourceHtml);
  const metadata = {
    source: 'frontend/admin-runtime.template.html',
    enhancements: 'frontend/scripts/admin-runtime-enhancements.mjs',
    target: 'frontend/index.html',
    sourceSha256: sha256(sourceHtml),
    enhancementsSha256: sha256(`${ADMIN_RUNTIME_ENHANCEMENT_STYLE}${ADMIN_RUNTIME_ENHANCEMENT_SCRIPT}`),
    targetSha256: sha256(nextIndexHtml),
    generatedAt: new Date().toISOString()
  };

  if (process.argv.includes('--check')) {
    const currentHtml = await readText(targetHtmlPath).catch(() => '');
    if (currentHtml !== nextIndexHtml) {
      console.error('[sync:admin-runtime] frontend/index.html 与模板及 runtime enhancements 不同步。');
      process.exit(1);
    }
    console.log(`[sync:admin-runtime] 已确认 frontend/index.html 同步完成 (${metadata.targetSha256})`);
    return;
  }

  await writeFile(targetHtmlPath, nextIndexHtml, 'utf8');
  await writeFile(targetMetaPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  console.log(`[sync:admin-runtime] 已组合 frontend/index.html <- admin runtime template + enhancements (${metadata.targetSha256})`);
}

await main();
