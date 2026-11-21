# 开镜文档

开镜（Kaijing）是开源 AI 短剧 / 漫剧制作工具。仓库 `openroute-ai/vercelai-kaijing`，平台域名 vercelai.cn。

一期是桌面客户端加薄云，不是跨境电商，也不是把画布放进 Next.js。

## 目录

```text
docs/
├── README.md
├── design/
│   ├── INDEX.md
│   ├── phase-1.md
│   ├── sources.md
│   ├── journeys.md
│   ├── domain.md
│   ├── commands.md
│   ├── cloud.md
│   ├── collaboration.md
│   └── license-and-backlog.md
└── ued/
    ├── INDEX.md
    ├── shell.md
    ├── cloud-account.md
    ├── projects.md
    ├── workspace.md
    ├── drama.md
    ├── export-and-failures.md
    └── admin.md
apps/docs/content/docs/   # 会发布的文档站
```

| 想找什么 | 去哪里 |
| --- | --- |
| 功能设计 | [design/INDEX.md](design/INDEX.md) |
| 交互与界面 | [ued/INDEX.md](ued/INDEX.md) |
| 协作三档 | [design/collaboration.md](design/collaboration.md) |
| 一期架构简图 | [design/phase-1.md](design/phase-1.md) |
| 发布站 | `apps/docs`，`pnpm --filter doc dev` |
| 开发约定 | [AGENTS.md](../AGENTS.md) |

流程图用 mermaid。
