# 仓库 Agent 文档

这些文档是给 Agent 的导航，不替代代码、测试和 Cloudflare 配置。先读根目录 [`AGENTS.md`](../AGENTS.md)，再按任务读取下面的文档。

## 文档索引

| 文档 | 内容 | 适合什么时候读 |
| --- | --- | --- |
| [`architecture.md`](architecture.md) | 当前目录分层、Worker 请求流、管理端投递链、KV/D1 边界、前端功能域 | 需要理解“改哪里”或追踪一次请求 |
| [`development.md`](development.md) | 源码/生成物关系、常用命令、测试门禁、环境变量和变更流程 | 需要编辑、构建、测试或发布 |

## 仓库分区速览

```text
.
├─ worker/                 Worker ESM 源码（唯一生产源）
├─ worker.js               Worker 单文件生成物，供 wrangler 使用
├─ frontend/               管理端模板、增强脚本、Vue 源码和构建配置
│  ├─ admin-runtime.template.html  当前生产 UI 模板源
│  ├─ scripts/             同步、增强、开发服务器、CDN 检查
│  ├─ src/                 Vue 功能源码，当前也由语法/行为检查覆盖
│  └─ dist/                Vite 生成物
├─ scripts/                Worker 构建、架构检查、项目总检查
├─ tests/                  Node 内置 test runner 测试与架构负例
├─ wrangler.toml           Cloudflare Worker、KV、D1、Cron 配置
└─ package.json            根 workspace 与统一检查入口
```

`.worker-dist/`、`node_modules/`、`.wrangler/` 和本地密钥文件属于构建/本地运行产物，不作为源码阅读入口。
