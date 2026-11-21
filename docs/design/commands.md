# 命令、节点与导演

界面、内置导演和 MCP 调用同一组短剧命令。短剧命令的实现放在 `apps/workspace` 的本机运行时，入参和出参的类型放在 `packages/drama-core`。命令内部需要改画布或时间线时，再调用已经存在的命令内核，而不是自己写 SQL 改卡片。

现有内核继续负责这些类型（名称保持不变）：`project.update`、`canvas.apply`、`upsert_card`、`place_card`、`set_references`、`editor.apply`、`add_clip`、`trim_clip`、`move_clip`、`upsert_caption`、`import_srt`、`set_render`。短剧层不替换它们。

M0 的 `createStubCommandKernel()` 对下列名字一律返回未实现。M2 起逐个换成真实现。失败形态与现有内核对齐：调用方能区分「输入不合法」「找不到」「修订冲突」「执行失败」。

## 1. 命令一览

公共入参：`projectId`。需要幂等的写操作接受 `idempotencyKey`。导演运行把 `drama_runs.id` 放进该键的前缀里。

### drama.rewrite_script

| | |
| --- | --- |
| 何时 | 用户提交一句话或小说，或要求按意见重写当前稿 |
| 入参 | `sourceKind`：`one_liner` 或 `novel`。`sourceText`。可选 `title`、`instruction`（用户的修改意见） |
| 行为 | 经本机代理调用云端 `kind=text`。用返回的正文新建一稿，`revision` 加一，并把它设为当前稿。保留 `source_text` |
| 出参 | `scriptId`、`revision`、`body` |
| 不做 | 不抽取角色，不画节点 |

正文至少包含场景段落。模型失败时不写入半截稿，`drama_runs` 记失败原因。

### drama.extract_entities

| | |
| --- | --- |
| 入参 | `scriptId` |
| 行为 | 从当前剧本文本识别角色、场景、道具。按 [domain.md](domain.md) 的名字规则合并。新卡没有 `asset_id` |
| 出参 | 三类 id 和名字的列表 |
| 不做 | 不生图 |

空名单是合法结果，但要在面板上说明「没有识别到角色」，而不是假装成功继续生视频。

### drama.breakdown_storyboard

| | |
| --- | --- |
| 入参 | `scriptId` |
| 行为 | 新建分镜版，按叙事顺序写入 `drama_shots`。每镜有 `description`、可选 `dialogue`、`duration_ms`，以及角色、场景、道具的 id。状态为 `draft`。设为当前分镜 |
| 出参 | `storyboardId`、镜头 id 列表 |
| 不做 | 不写最终提示词，不生成媒体 |

重跑这一命令会新建一版分镜，不改旧版镜头，以免毁掉已经生成的视频。面板默认显示当前版。

### drama.write_prompts

| | |
| --- | --- |
| 入参 | `storyboardId`，可选 `shotIds` |
| 行为 | 为每镜写入 `image_prompt` 和 `video_prompt`，并把 `@名字` 解析后的素材 id 放进 `reference_asset_ids`。状态改为 `prompted`。提示词模板写在 `packages/drama-core`，用开镜自己的句子，不粘贴外部产品的提示词原文 |
| 出参 | 更新后的镜头 id |
| 不做 | 不调用图像或视频供应商 |

角色还没有形象图时，`reference_asset_ids` 可以只有场景图，并在警告里列出缺图的角色。不因此失败。

### drama.generate_character_image

| | |
| --- | --- |
| 入参 | `characterId`，可选 `quality` |
| 行为 | 用角色的 `visual_notes` 和名字向云端提交 `kind=image`。成功后把文件写入本机媒体目录，用现有素材命令登记 Asset，再把 `asset_id` 指过去 |
| 出参 | `assetId`、`cloudJobId` |
| 失败 | 不改掉旧的 `asset_id`。错误写在返回值和运行记录里 |

### drama.generate_shot_video

| | |
| --- | --- |
| 入参 | `shotId`，可选 `quality` |
| 行为 | 镜头状态先改为 `generating`。提交 `kind=video`，`references` 来自 `reference_asset_ids` 以及相关角色的 `asset_id`。成功后登记视频素材，写入 `video_asset_id`，状态改为 `ready` |
| 失败 | 状态改为 `failed`，保留提示词，便于只重试这一镜 |

同一镜头已有 `cloud_job_id` 且云端任务仍是 `queued` 或 `running` 时，不提交第二次。

### drama.assemble_episode

| | |
| --- | --- |
| 入参 | `storyboardId`，以及用户选的导出路径 |
| 行为 | 按 `index` 取出状态为 `ready` 且有 `video_asset_id` 的镜头。通过现有时间线命令依次 `add_clip`，用 `dialogue` 写 `upsert_caption`，再 `set_render` 导出 MP4 |
| 出参 | 本机文件路径 |
| 拒绝 | 有镜头仍是 `draft`、`prompted`、`generating` 或 `failed` 时，默认不跳过。面板可以让用户明确选择「只导出已完成的镜头」，这时入参带 `allowPartial: true` |

### drama.sync_canvas

| | |
| --- | --- |
| 入参 | `projectId` |
| 行为 | 把当前剧本、角色、场景、道具、分镜镜头投影成画布卡片。已有卡片只更新文案和引用，不改用户拖过的坐标。新卡片用 `place_card` 放在空白处。连线用 `set_references` |
| 不做 | 不因为画布上少了一张卡就删除领域行 |

这是导演在抽取、拆镜和生成之后调用的投影，不是用户拖动画布时的反向同步。

## 2. 画布节点

节点是卡片视图。`data.dramaId` 指向领域行，`data.kind` 取下表。布局字段沿用现有卡片。

| kind | 显示 | 连到 |
| --- | --- | --- |
| `drama.script` | 当前稿标题和摘要 | 抽出的角色、场景、道具 |
| `drama.character` | 名字和形象图 | 出现该角色的镜头 |
| `drama.scene` | 名字和场景图 | 使用该场景的镜头 |
| `drama.prop` | 名字 | 使用该道具的镜头 |
| `drama.shot` | 镜号、状态、视频封面 | 它引用的角色、场景、道具；下一条镜头可以不连，顺序以 `index` 为准 |

用户在画布上断开一条线，只影响卡片上的引用展示。下一次 `drama.sync_canvas` 会按领域表把引用画回去。若要改「这一镜有哪些角色」，到短剧面板或调用 `drama.breakdown_storyboard` 的后续编辑命令。M3 增加一个窄命令 `drama.update_shot`，只改 `description`、`dialogue`、`duration_ms` 和实体 id 列表，避免为了改一句对白就重拆整集。

## 3. `@` 引用

短剧面板和提示词预览里，`@` 后接当前项目的角色、场景或道具名。规则：

1. 候选列表来自三张实体表，不来自画布上随便起的标题。
2. 重名不存在，因为表上已经按规范化名字唯一。
3. 解析结果是实体 id。若该实体已有 `asset_id`，把这个素材 id 放进 `reference_asset_ids`。
4. 发给云端的提示词可以保留可读的名字，但 `references` 必须是素材内容或网关认可的引用，不能只送一个显示名。
5. 名字匹配不到时，这一镜的 `drama.write_prompts` 返回警告，不把未知的 `@` 当成成功引用。

这是 Toonflow「生成时点名资产」的语义，用 React 工作台自己的输入框实现，不移植 Vue 组件。

## 4. 内置导演

「做一集」是本机编排，不是云端工作流引擎。顺序固定：

1. `drama.rewrite_script`
2. `drama.extract_entities`
3. `drama.breakdown_storyboard`
4. `drama.write_prompts`
5. 对每个还没有 `asset_id` 的角色调用 `drama.generate_character_image`
6. 对当前分镜的每镜调用 `drama.generate_shot_video`
7. `drama.sync_canvas`
8. 用户确认后才 `drama.assemble_episode`。自动流程停在视频就绪，导出单独按钮，避免没看过就写出文件

每步成功后把 `drama_runs.cursor` 推到下一步。用户改完再点「从这里继续」，从 `cursor` 执行，不从第一步重写，除非用户明确选择重写剧本。

积分不足或单镜失败时编排停住，已完成的步骤保留。

## 5. MCP 与导演技能

MCP 工具与上面的命令一一对应，名字就用 `drama.rewrite_script` 到 `drama.assemble_episode`，外加 `drama.sync_canvas` 和 `drama.update_shot`。工具描述写清楚入参，并说明项目在本机、生成走薄云。

导演技能是仓库里一份开镜撰写的说明（M2 放到 `apps/workspace/skills/`，不要放外部产品的技能原文）。它只规定：

- 先读当前 `drama_runs.cursor` 和剧本 revision
- 按第 4 节的顺序调用工具
- 每步把返回的 id 告诉用户
- 遇到 `failed` 或积分不足就停
- 不绕过命令直接改 SQLite

`origin` 为 `mcp` 的调用和按钮走同一执行函数。

## 6. 文本生成也走网关

改写、抽取、拆镜、写提示词都是 `kind=text` 的云端任务，这样密钥和积分只有一处。本机把模型输出解析成领域结构；解析失败则命令失败，不把原始模型文本直接塞进分镜表。解析器写在 `packages/drama-core`，并带单元测试：给定一段约定好的结构文本，得到角色列表和镜头列表。结构用 JSON，字段就是第 1 节的出参，不采用外部产品的私有格式。
