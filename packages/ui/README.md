# @workspace/ui — 共享 UI 组件库

全仓统一的 **shadcn/ui** 组件库与全局样式：组件、工具函数、自定义 hooks 和 Tailwind v4 主题变量集中在这里，各应用按需 import，不在应用内复制组件。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 提供设计系统：组件、`cn()`、hooks、`globals.css` 主题 token |
| 消费方 | `apps/workspace`、`apps/web`、`apps/docs` |
| 技术栈 | shadcn/ui + Radix UI + `@base-ui/react`、Tailwind CSS v4、`class-variance-authority` |
| 边界 | 不引用 `apps/*` 或其他业务包，保持纯 UI |

## 主要内容

- `src/components/*`：57 个 shadcn/ui 组件（`button`、`dialog`、`table`、`select`、`sidebar`、`chart`…）以及 `icons/` 自定义图标
- `src/lib/utils.ts`：`cn()`（clsx + tailwind-merge），组件 `className` 一律用它合并
- `src/hooks/*`：`use-mobile`、`use-media-query`、`use-scroll`、`use-toast`
- `src/styles/globals.css`：全局样式与 shadcn 设计令牌（`--primary`、`--sidebar-*` 等），并注册 `@custom-variant dark`

## 使用

```ts
// 安装/新增组件
pnpm --filter @workspace/ui dlx shadcn@latest add button

// 组件
import { Button } from "@workspace/ui/components/button"

// 工具
import { cn } from "@workspace/ui/lib/utils"

// 全局样式（在各应用的根 layout 引入）
import "@workspace/ui/globals.css"
```

主题色与明暗模式通过 CSS 变量覆盖，**不要注入 `<style>`**：自定义品牌主题时在根容器上写 `style={{ "--primary": ... }}`。

## 运行

本包无独立服务。开发方式是「在应用中引用 → 回到本包修改组件」：

```bash
pnpm --filter @workspace/ui run lint
pnpm --filter @workspace/ui run typecheck
```

## 部署

**不独立部署**，组件随各应用打包发布；改动本包会影响工作台、控制台和文档站。

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
- shadcn/ui 使用约定：[AGENTS.md](../../AGENTS.md)
