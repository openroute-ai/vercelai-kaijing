# @workspace/email — 邮件服务

平台统一的邮件发送能力：模板、传输配置与开发态预览。运营通知、告警、账单等邮件都从这里发出。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 提供邮件模板与发送入口 |
| 消费方 | `apps/web` |
| 依赖 | SMTP（`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`） |

## 主要内容

| 目录 | 说明 |
| --- | --- |
| `mail` | 传输与发送实现 |
| `components` | 邮件模板组件（React → HTML） |
| `index.ts` | 统一导出 |

## 运行

```bash
# 本地预览邮件模板（开发服务器）
pnpm --filter @workspace/email email:dev

pnpm --filter @workspace/email run lint
pnpm --filter @workspace/email run typecheck
```

前置：根目录 `.env` 配好 `SMTP_*`（可参考 `.env.example`）。

## 部署

**不独立部署**，随宿主应用发布。生产环境必须提供可达的 SMTP 通道，否则通知类功能（账单、告警、供应商结果通知）会静默失败。

## 脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm email:dev` | 邮件模板开发预览 |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
