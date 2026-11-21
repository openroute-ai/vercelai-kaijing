# @workspace/db — 数据模型与迁移

全仓云端数据模型：Drizzle ORM 的表定义与迁移。`apps/web`、`apps/api` 和 `packages/auth` 从这里读 schema。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 定义 PostgreSQL 表结构、关系、枚举与类型导出；产出并管理迁移 |
| 边界 | 只包含 schema 定义与客户端工厂，不含业务逻辑，不引用任何 workspace 包 |
| 消费方 | 各 `apps/*`（经 dataaccess 层）、`packages/auth` |

## Schema 组成

| 文件 | 领域 |
| --- | --- |
| `auth-schema.ts` | better-auth：用户、会话、组织 |
| `web-auth-schema.ts` | 平台管理员身份，独立 schema |
| `kaijing-schema.ts` | 积分账户、积分流水、生成任务 |
| `oauth-schema.ts` / `rbac-schema.ts` | OAuth 与角色 |
| `schema.ts` | 聚合导出 |
| `client.ts` | `createPgClient()` |

约定：

- 主键用 `text`（cuid/UUID）或序列；时间戳统一 `timestamp(..., { withTimezone: true }).defaultNow()`
- 金额统一 `numeric(name, { precision: 15, scale: 4 })`
- 枚举用 `varchar` + TypeScript union，避免数据库 enum 的迁移成本
- 聚合字段不入库，在 dataaccess 层用子查询计算
- 使用 `db.select()` 显式列出字段，避免隐式列泄露

## 导出

| 导出 | 路径 | 说明 |
| --- | --- | --- |
| `.` | `src/index.ts` | schema 与客户端 |
| `./schema` | `src/schema.ts` | 仅 schema（直接 import 用） |

## 脚本

```bash
# schema 变更后生成迁移（生成文件在 drizzle/，禁止手改）
pnpm --filter @workspace/db db:generate

# 应用待执行迁移
pnpm --filter @workspace/db db:migrate

# 不生成迁移文件直接推 schema（仅开发环境）
pnpm --filter @workspace/db db:push

# 校验迁移与 schema 一致性
pnpm --filter @workspace/db db:check

# 图形化查看数据
pnpm --filter @workspace/db db:studio

# 平台管理员种子
pnpm --filter @workspace/db db:seed:admin
```

## 运行前置

根目录 `.env` 中需有可连的 PostgreSQL：

```
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
```

本地库一键启动：`docker compose up -d`。

## 部署

本包**不独立部署**，作为依赖随各应用构建发布。迁移在发布流程中执行：

```bash
pnpm --filter @workspace/db db:migrate
```

生产环境应走迁移文件，不使用 `db:push`。

## 相关文档

- 数据库设计：[docs/design/crossborder-database-design.md](../../docs/design/crossborder-database-design.md)
- 分层与查询规范：[AGENTS.md](../../AGENTS.md)
