# 薄云 API 与供应商合同

薄云是 `apps/api`。桌面和工作台只通过 HTTP 访问它。`apps/web` 读同一份 Postgres，但使用另一套会话。生成供应商的代码只允许出现在 `packages/providers`，并且只被 API 进程引用。

开发期工作台把浏览器里的 `/cloud-api` 代理到 `http://127.0.0.1:8080`，这样 `cloud.session_token` 落在工作台源站上。安装包里的 Electron 同样只访问配置好的薄云地址，不把供应商域名写进渲染进程。

## 1. 身份

| 入口 | realm / 库 | cookie | 谁用 |
| --- | --- | --- | --- |
| `POST /api/v1/cloud/register`、`/login`、`/logout`，`GET /api/v1/cloud/session` | `cloud`，public schema，凭证 `cloud-email` / `cloud-phoneNumber` | `cloud.session_token` | 桌面和工作台 |
| `apps/web` 的 better-auth | `web_auth` schema | 前缀 `web` | 平台运营 |

两边不接受对方的 cookie。`merchant` 和 `supplier` 不再作为登录入口；历史列可以留在认证表里。

注册成功时已经会创建 `credit_accounts` 行，余额为 0。M4 之前可以由运营在后台 `grant`。密码规则沿用 `validatePassword`：至少 8 位，含大小写、数字和符号。

封禁使用 `users.banned`。被封禁的用户调用生成接口时返回 403，本机数据不动。

`/api/v1` 继续做 CSRF 来源检查。工作台和 Electron 的来源必须在 `BETTER_AUTH_TRUSTED_ORIGINS` 里。

## 2. 积分

已有流水原因：`grant`、`hold`、`capture`、`release`、`adjust`。

M4 的扣费顺序：

1. 按 `kind` 和 `quality` 查出本次价格（配置在 API 环境或一张很小的价格表，不放进客户端）。
2. 在一个 Postgres 事务里：锁住该用户的 `credit_accounts`，若余额小于价格则返回 402，不插任务。
3. 插入 `generation_jobs`，状态 `queued`，`credit_cost` 为价格。
4. 插入 `hold`，`delta` 为负的价格，`generation_job_id` 指向该任务，同时把余额减去价格。
5. 调用 `GenerationProvider.submit`。
6. 成功：插入 `capture`，`delta` 为 0（预扣已经从余额划走），任务改为 `succeeded`，写入 `result_json` 和 `finished_at`。
7. 失败或用户取消：插入 `release`，`delta` 为价格，余额加回，任务改为 `failed` 或 `cancelled`。

`hold` 之后、`capture` 或 `release` 之前，余额已经暂时减少。禁止出现两次 `capture`。幂等键相同的重复请求返回原任务，不再 `hold`。

运营加积分使用 `grant` 或 `adjust`，`generation_job_id` 为空，只能从 `apps/web` 的受保护过程调用，不能从桌面调用。

查询：

- `GET /api/v1/cloud/credits`：当前余额。会话从 cookie 取用户，忽略 body 里自报的 `userId`。
- 任务列表给运营的接口继续走 `apps/web` 的 tRPC，不给桌面一个跨用户的列表。

## 3. 生成接口

现有 `POST /api/v1/generations` 和 `GET /api/v1/generations/{id}` 保留，M4 收紧为必须登录。

请求体在现有 `kind`、`prompt` 上增加：

| 字段 | 说明 |
| --- | --- |
| quality | `fast` 或 `standard`，默认 `standard` |
| references | 可选。图片的 base64 或 multipart 文件，仅用于这一次任务。API 不把这些文件当成用户的项目库 |
| idempotencyKey | 可选，最长 128。缺省则每次都是新任务 |

响应继续返回任务 id、状态、provider、kind、prompt、errorMessage。成功后再加 `result`：短期可下载的地址或内联的小文本。视频结果用短期地址，桌面必须马上下载到本地媒体目录。地址过期不是本机失败，本机以自己的文件为准。

`kind=text` 的结果放在 `result_json.text`，供改写和拆镜解析。文本任务同样计价，价格可以低于视频。

匿名 `userId` 只存在于当前占位实现。M4 删除「不带会话也能建任务」的路径。

状态机：`queued` → `running` → `succeeded` | `failed` | `cancelled`。桌面轮询 `GET`，间隔从 1 秒退避到 5 秒，视频最长等待由 API 的任务超时决定（建议 15 分钟，超时则 `failed` 并 `release`）。

## 4. GenerationProvider

`packages/providers` 里的接口已经是：

```ts
interface GenerationProvider {
  readonly id: string
  submit(request: GenerationRequest): Promise<GenerationResult>
  get(jobId: string): Promise<GenerationResult>
}
```

`GenerationRequest` 现有 `kind`、`prompt`、`references`、`metadata`。M4 约定：

- `references` 是这次请求可用的图片字节或供应商接受的临时 URL，由 API 在调用前准备好。适配器不再回读桌面磁盘。
- `metadata.quality` 是 `fast` 或 `standard`。
- `submit` 返回的 `jobId` 是供应商侧 id。API 自己的主键仍是 `generation_jobs.id`，两者都写入 `result_json`，桌面只认 API 的 id。
- `get` 用来查询供应商。状态值只用 `queued`、`running`、`succeeded`、`failed`、`cancelled`。
- `createStubProvider()` 留到测试里。生产进程按环境变量选择一到两个真实适配器。

一期交付一个图像适配器和一个视频适配器，都是国内常用供应商的原创客户端。文本可以复用图像供应商的对话接口，或单独一个文本适配器，仍实现同一接口的 `kind=text`。

适配器必须自己写：HTTP 路径、签名、轮询和错误映射。禁止把火宝或其他 CC BY-NC-SA 项目的客户端、提示词和技能文件拷进来。Toonflow 的 Vue 界面也不许出现。若参考了某份 MIT 代码的算法，保留该文件的版权头；默认不整文件搬迁。

供应商密钥的环境变量只列在 API 的 `.env.example` 里，值为空，不提交真实密钥。

桌面在普通模式下没有这些变量。工作台设置里可以保留上游已有的「自带供应商」入口，但「做一集」不走那条路。自带 Key 做成可关闭的高级项，不是 M6 的完成条件。

## 5. 本机代理

`apps/workspace` 增加一个只负责出站的模块（M4），职责：

1. 带上 `cloud.session_token` 调用生成接口。
2. 把本机参考图读成请求里的 `references`，不把绝对路径告诉云端。
3. 轮询任务。
4. 成功后把图片或视频写入本地媒体目录，再交给现有素材命令。
5. 文本结果不落成素材，交给 `packages/drama-core` 的解析器。

这个模块不实现 `GenerationProvider`。它如果开始保存供应商密钥，就是越界。

## 6. 运营在网上能做和不能做的

能做：登录、看用户、封禁、邀请、给积分、看任务状态和错误。

不能做：打开画布、改剧本、读取用户电脑上的 MP4、用运营会话调用 `/api/v1/cloud/*`。

下载页和安装包清单放在对外站点（可以是 `apps/web` 的公开页，或文档站）。该页不要求运营权限。客户端更新清单只包含版本号和安装包地址，不包含项目数据。
