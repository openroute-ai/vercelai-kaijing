# 领域模型与存储

短剧对象挂在现有本地项目上。一个 `projectId` 同时拥有画布、素材、时间线和至多一套当前短剧数据。不要新建「短剧项目」表来代替现有项目。

`packages/drama-core` 现在已有 `DramaProject`、`ScriptDraft`、`Character`、`Scene`、`Prop`、`Storyboard`、`Shot`。实现时以这些类型为契约，并按下面的字段补全，而不是另起一套名字。

## 1. 谁是权威

| 数据 | 权威存储 | 说明 |
| --- | --- | --- |
| 项目、画布卡片坐标、素材文件、生成谱系、时间线剪辑 | 本机 SQLite + 媒体目录 | 沿用已接入的工作台 |
| 剧本、角色、场景、道具、分镜、镜头状态、导演运行 | 同一份本机 SQLite 里的新表 | M1 增加。类型放在 `packages/drama-core` |
| 账户、会话、积分、生成任务元数据 | Postgres，`packages/db` | 已有 `users`、`credit_accounts`、`credit_ledger`、`generation_jobs` |
| 成片 MP4 | 用户选择的本机目录 | 不进 Postgres，也不进对象存储作为默认归宿 |
| 供应商密钥 | 只在 `apps/api` 的环境变量 | 不进 SQLite，不进桌面安装包 |

画布上的边表示「这一镜用了哪个角色」。真正的「这张图是哪次生成出来的」仍走现有生成谱系。镜头行只保存 `imageAssetId` 和 `videoAssetId`。

## 2. 本机表

表名使用 `drama_` 前缀，避免和现有项目表冲突。标识用文本 UUID。时间用带时区的时间戳。下面是 M1 要落地的列，实现时用工作台自己的 Drizzle SQLite 配置生成迁移，不要写进 `packages/db` 的 Postgres 迁移。

### drama_scripts

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text pk | |
| project_id | text | 现有项目，删除项目时级联删除 |
| title | text | 集标题 |
| source_kind | text | `one_liner` 或 `novel` |
| source_text | text | 用户原始输入，改写后仍保留 |
| body | text | 剧本文本。一期用分段纯文本，段落之间空行。不引入单独的剧本 DSL |
| revision | integer | 从 1 递增。每次 `drama.rewrite_script` 成功加一 |
| created_at / updated_at | timestamp | |

一个项目可以有多稿。导演默认使用 `updated_at` 最新的一稿。用户在面板里可以把某一稿标成当前稿：用 `drama_projects.current_script_id` 指向它。

### drama_projects

每个本地项目一行，没有短剧内容时可以不存在。

| 列 | 说明 |
| --- | --- |
| project_id | 主键，等于现有项目 id |
| current_script_id | 可空 |
| current_storyboard_id | 可空 |
| quality | `fast` 或 `standard`，默认 `standard` |

### drama_characters / drama_scenes / drama_props

三张表同形：

| 列 | 说明 |
| --- | --- |
| id | |
| project_id | |
| name | 项目内按去掉首尾空白、英文大小写不敏感后唯一 |
| description | 给人读的说明 |
| visual_notes | 写给后续提示词用的外观说明，不是供应商原文模板 |
| asset_id | 可空，指向现有素材。形象生成成功后写入 |
| created_at / updated_at | |

抽取时按规范化名字合并：已存在则更新 `description`，不新建重名卡，也不覆盖已经绑定的 `asset_id`。

### drama_storyboards 与 drama_shots

`drama_storyboards`：`id`、`project_id`、`script_id`、`title`、时间戳。同一剧本可以有多版分镜，当前版记在 `drama_projects.current_storyboard_id`。

`drama_shots`：

| 列 | 说明 |
| --- | --- |
| id | |
| storyboard_id | |
| index | 从 0 递增，同一分镜内唯一 |
| description | 这一镜发生什么 |
| dialogue | 可空。导出字幕时使用 |
| duration_ms | 建议时长，默认 4000 |
| image_prompt | 可空，由 `drama.write_prompts` 写入 |
| video_prompt | 可空 |
| reference_asset_ids | json 文本数组。解析 `@` 之后的素材 id |
| status | `draft`、`prompted`、`generating`、`ready`、`failed` |
| image_asset_id / video_asset_id | 可空 |
| error_message | 可空 |

状态只表达短剧镜头，不代替云端 `generation_jobs.status`。两边用任务 id 关联，见下一节。

### drama_runs

一次「做一集」或一次从中间步骤继续，记一行，便于面板显示进度。

| 列 | 说明 |
| --- | --- |
| id | |
| project_id | |
| status | `running`、`paused`、`succeeded`、`failed` |
| cursor | 下一条要执行的命令名，例如 `drama.breakdown_storyboard` |
| error_message | 可空 |

导演是编排器，不是另一份领域数据。它不保存剧本正文。

## 3. 云端表（已有，一期不扩成短剧库）

Postgres 继续只用这些业务表：

- `users` / `account` / `session`：桌面用户在 public schema，密码凭证的 `provider_id` 是 `cloud-email` 或 `cloud-phoneNumber`
- `web_auth.*`：平台运营，cookie 前缀 `web`
- `credit_accounts.balance`：`numeric(15,4)`，一个用户一行
- `credit_ledger`：`delta`、`reason`（`grant`、`hold`、`capture`、`release`、`adjust`）、可选 `generation_job_id`
- `generation_jobs`：`provider`、`kind`（`text`、`image`、`video`）、`status`、`prompt`、`request_json`、`result_json`、`credit_cost`

`request_json` 允许携带：

```json
{
  "quality": "standard",
  "referenceAssetIds": ["本地不上传的占位不会出现在这里"],
  "idempotencyKey": "client-generated"
}
```

参考图要以字节或网关能拉取的方式提交，见 [cloud.md](cloud.md)。云端不建 `shots` 表。`generation_jobs.id` 返回给本机后，写进镜头行的运行记录（M4 可在 `drama_shots` 加 `cloud_job_id` 文本列，无外键）。

余额用账本重算作为核对：`balance` 是缓存，任何扣减都必须插入 `credit_ledger`。禁止只改余额。

## 4. 对象关系

```text
本地 Project
  ├── drama_projects
  ├── drama_scripts（多稿）
  ├── drama_characters / scenes / props → asset_id → 现有 Asset
  ├── drama_storyboards
  │     └── drama_shots → image_asset_id / video_asset_id
  ├── Canvas（坐标和连线）
  └── Timeline（clip 钉死某个 Asset 版本）

云端 User
  ├── credit_accounts + credit_ledger
  └── generation_jobs
```

删除本地项目时删除 `drama_*` 和媒体文件。不调用云端删除任务历史。云端任务记录保留，供运营对账。

## 5. 标识与修订

- 领域 id 在本机生成，不向云端申请
- 画布和时间线继续用现有命令的 `expectedRevision`
- 短剧表自己的 `drama_scripts.revision` 只保护剧本正文。用户保存剧本时如果 revision 不匹配，面板提示重新加载，不静默覆盖
- 云端生成使用 `Idempotency-Key`。同一键重复提交返回原来的 `generation_jobs.id`，不第二次预扣
