# apps/api

开镜薄云 OpenAPI。

| 路径 | 说明 |
| --- | --- |
| `GET /api/v1/health` | 健康检查 |
| `GET /api/v1/hello` | 示例 |
| `POST /api/v1/generations` | 写入一条 `queued` 生成任务，不调用供应商 |
| `GET /api/v1/generations/:id` | 读取任务元数据 |
| `GET /api/v1/open-api` | OpenAPI JSON |
| `/api/auth/*` | 仍返回 501 |

```bash
pnpm --filter api dev
```

本地需要 `apps/api/.env` 或进程环境里的 `DATABASE_URL` 与 `BETTER_AUTH_SECRET`。`/api/v1` 有 CSRF，请求要带允许的 `Origin`。
