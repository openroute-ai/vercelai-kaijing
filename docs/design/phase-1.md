# 开镜一期架构

可照着实现的正文在 [INDEX.md](INDEX.md)：上游怎么映射、使用路径、领域模型、命令、薄云合同、许可和 M0–M6。

一期给普通用户的产品是 Windows / macOS 安装包，加上一层薄云。用户不需要自己部署，也不需要自己申请各家模型密钥。

```text
桌面客户端
  Electron 壳
  Vite + React 工作台
  本机项目、画布、时间线（画布与创作台已可在本地打开）
        │
        │ 登录 / 积分 / 提交生成
        ▼
薄云
  apps/web   账户与管理控制台
  apps/api   生成网关
  Postgres   账户、积分、任务元数据
        │
        ▼
供应商 API（M0 不调用）
```

## 分层

| 层 | 现在 | 约束 |
| --- | --- | --- |
| `apps/workspace` | 上游画布副本，本机 SQLite | 不写成 Next.js，不持有供应商密钥 |
| `apps/desktop` | 开发时加载工作台 URL | 安装包和自动更新以后再做 |
| `packages/drama-core` | 领域类型和命令内核占位 | UI、导演、MCP 以后共用 |
| `packages/providers` | `GenerationProvider` 占位 | 只部署在云网关 |
| `apps/api` | `POST /api/v1/generations` 落一条 `queued` 任务 | 不转发到厂商 |
| `apps/web` | 平台运营登录（`web` cookie） | 不编辑短剧项目，不和 cloud 会话共用 |
| `packages/db` | auth 表 + `credit_*` + `generation_jobs` | 不成片、不分镜表 |

## 领域对象

本机以后会有：

```text
Project
  ├── Script
  ├── Character / Scene / Prop
  ├── Storyboard
  │     └── Shot
  └── Timeline
```

这些类型在 `packages/drama-core`。云端表只记录谁花了积分、哪一次生成还在排队。

## 命令名

占位内核认识这些名字，但一律返回未实现：

- `drama.rewrite_script`
- `drama.extract_entities`
- `drama.breakdown_storyboard`
- `drama.write_prompts`
- `drama.generate_character_image`
- `drama.generate_shot_video`
- `drama.assemble_episode`

## 明确不做

- 不把 Toonflow 的 Vue 界面或火宝短剧的代码拷进仓库。画布底座已经按 Apache-2.0 放在 `apps/workspace`
- 不在一期做完整的浏览器协作工作台
