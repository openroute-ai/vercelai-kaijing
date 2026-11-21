# @workspace/shared-next — 共享 Next.js 工具

跨 Next.js 应用复用的通用能力：资源与字体、埋点/分析、联盟营销（返佣链接）与通用工具函数。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 抽出多个 Next.js 应用都会用到、但与具体业务无关的代码 |
| 消费方 | `apps/web`、`apps/docs` 等 Next.js 应用 |
| 边界 | 只依赖 `@workspace/ui` 一类基础包，不引用 `apps/*` |

## 主要内容

| 目录 | 说明 |
| --- | --- |
| `assets` | 共享静态资源（字体等），如 `fontBricolageGrotesque` / `fontNotoSans` / `fontNotoSerif` |
| `analytics` | 埋点与访问分析工具 |
| `affiliate` | 联盟营销 / 返佣链接相关工具 |
| `lib` | 通用工具函数与 Next.js 辅助方法 |
| `index.ts` | 统一导出 |

## 运行

作为库被应用引用，无独立进程：

```bash
pnpm --filter @workspace/shared-next run lint
pnpm --filter @workspace/shared-next run typecheck
```

## 部署

**不独立部署**，随宿主应用构建发布。

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
