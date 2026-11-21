# 开镜开发约定

开镜（Kaijing）是开源 AI 短剧 / 漫剧制作工具。仓库 `openroute-ai/vercelai-kaijing`，平台域名 vercelai.cn。

一期是桌面客户端加薄云：登录、积分、统一生成网关。工作台用 Vite，不要改写成 Next.js。不要把 BeatDesign、Toonflow 或火宝短剧的源码拷进这个仓库。火宝短剧是 CC BY-NC-SA 4.0，不能复制其代码。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 工作台 | Vite + React 19 + Tailwind CSS v4 + `@workspace/ui` |
| 桌面壳 | Electron |
| 薄云控制台 | Next.js 16 App Router（`apps/web`） |
| OpenAPI | Hono 4 + `@hono/zod-openapi`（`apps/api`） |
| 文档站 | Fumadocs（`apps/docs`） |
| ORM | Drizzle + PostgreSQL |
| 认证 | better-auth |
| 构建 | Turborepo + pnpm |

## 模块

```text
apps/desktop        Electron 壳
apps/workspace      本机工作台 UI
apps/web            账户 / 管理 / 薄云控制台
apps/api            生成网关
apps/docs           文档站
packages/drama-core 领域类型与命令内核
packages/providers  供应商接口，只给云网关用
packages/db         账户、积分、生成任务元数据
packages/auth ui email sms-captcha redis storage shared-next
```

依赖方向：`apps/*` 和 `packages/auth` 可以依赖 `packages/db`。`packages/db` 不依赖其他 workspace 包。`packages/providers` 不依赖 `packages/db`。工作台可以依赖 `packages/drama-core` 和 `packages/ui`，不要在工作台里放供应商密钥。

## 数据

- 云端业务表继续用 `text` 主键、带时区的 `timestamp`、金额和积分用 `numeric(15, 4)`。
- 枚举用 `varchar` + TypeScript union。
- 列表在数据库分页：`count()` + `limit/offset`。tRPC 输入接受 `page` / `pageSize`（默认 1 / 20，最大 100）。
- 事务用 `db.transaction(async (tx) => { ... })`。
- 迁移由 `pnpm --filter @workspace/db db:generate` 生成，不要手改 `packages/db/drizzle/`。
- 短剧项目、分镜和成片默认不进云端 Postgres。

## 前端

- 共享组件在 `@workspace/ui`。用 Tailwind，避免内联 style。
- `apps/web` 禁止新增 `'use server'`。服务端逻辑放 `src/lib/server/` 或 tRPC。
- 工作台是 Vite SPA，路由不要搬到 App Router。
- `apps/docs` 只发布 `content/docs/`，不要改 `source.config.ts` 的 `dir`。

## 验证

- 改动的包跑 `pnpm --filter <name> lint` 和 `typecheck`。
- 用户能看见的 `apps/web` 流程要在浏览器里走一遍。工作台改动要打开 Vite 页面确认。
- 不提交 `.env`、密钥或令牌。改环境变量时同步 `.env.example`。

## 命令

```bash
pnpm install
pnpm --filter workspace dev
pnpm --filter desktop dev
pnpm --filter web dev
pnpm --filter api dev
pnpm --filter doc dev
pnpm lint
pnpm typecheck
```
