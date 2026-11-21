# 设计文档

开镜（Kaijing）一期是 Windows / macOS 桌面客户端加薄云。下面这组文档是可以照着实现的功能设计，不是薄大纲。产品名只用开镜，不用上游项目名做界面商标。

| 文档 | 说明 |
| --- | --- |
| [phase-1.md](phase-1.md) | 一期架构简图：桌面 + 薄云，以及现在仓库里已经有什么 |
| [sources.md](sources.md) | 三份上游怎么落到现有模块：保留、改名、只移植语义、只对照能力 |
| [journeys.md](journeys.md) | 普通用户和平台运营的路径，含失败分支 |
| [domain.md](domain.md) | 领域对象，以及本机 SQLite 和薄云 Postgres 的边界 |
| [commands.md](commands.md) | 短剧命令、画布节点、`@` 引用、导演技能和 MCP |
| [cloud.md](cloud.md) | 薄云 API、积分和 `GenerationProvider` 合同 |
| [collaboration.md](collaboration.md) | 导出互传、只读分享、同时编辑，以及相对现在的改动大小 |
| [license-and-backlog.md](license-and-backlog.md) | 许可、归属、M0–M6 和明确不做的事 |
| [../ued/INDEX.md](../ued/INDEX.md) | 交互与界面：屏幕、操作和状态。功能边界以本目录为准 |

阅读顺序：先 `sources.md` 和 `journeys.md`，再按 `domain.md` → `commands.md` → `cloud.md` 实现。协作三档见 `collaboration.md`，一期不实现。界面按 [../ued/INDEX.md](../ued/INDEX.md) 画，不在界面里使用上游产品名。`license-and-backlog.md` 用来判断某一段代码能不能进仓库、该落在哪一阶段。

文档站导航里的「功能设计」指向同一组结论，正文以本目录为准。
