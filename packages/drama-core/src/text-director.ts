/**
 * 开镜自己的短剧文本编排与解析。提示词是原创句子，不粘贴外部产品原文。
 */
export type RewriteInput = {
  sourceKind?: string
  sourceText?: string
  title?: string
  instruction?: string
  existingBody?: string
}

export type RewrittenScript = {
  title: string
  body: string
}

export type EntityDraft = {
  name: string
  description: string
  visualNotes: string
}

export type ExtractedEntities = {
  characters: EntityDraft[]
  scenes: EntityDraft[]
  props: EntityDraft[]
}

export type BreakdownShotDraft = {
  description: string
  dialogue: string
  durationMs: number
  characterNames: string[]
  sceneName: string
  propNames: string[]
}

export type ShotPromptDraft = {
  index: number
  imagePrompt: string
  videoPrompt: string
  mentionNames: string[]
}

export function normalizeEntityName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
}

export function buildRewritePrompt(input: RewriteInput): string {
  return [
    "你是开镜的短剧编剧助手。请把用户输入改写成可拍摄的一集剧本。",
    "只输出 JSON，不要 Markdown。字段：title（字符串）、body（字符串，场景段落之间空一行）。",
    "body 至少包含两段：每一段写清地点、人物和发生的事。不要写分镜表。",
    `来源类型：${input.sourceKind === "novel" ? "小说" : "一句话"}`,
    input.title ? `集标题：${input.title}` : "",
    input.instruction ? `修改意见：${input.instruction}` : "",
    input.existingBody ? `当前稿：\n${input.existingBody}` : "",
    `原始输入：\n${input.sourceText ?? ""}`,
  ]
    .filter(Boolean)
    .join("\n")
}

export function buildExtractPrompt(input: { title?: string; body: string }): string {
  return [
    "你是开镜的资产整理助手。请从剧本里提取角色、场景和道具。",
    "只输出 JSON，不要 Markdown。字段：characters、scenes、props，每项含 name、description、visualNotes。",
    "名字要短而稳定，visualNotes 写给人看的外观，不要写供应商接口术语。",
    "如果某类是空的，用空数组。不要编造剧本里完全没有依据的角色。",
    `标题：${input.title ?? ""}`,
    `剧本：\n${input.body}`,
  ].join("\n")
}

export function buildBreakdownPrompt(input: { title?: string; body: string }): string {
  return [
    "你是开镜的分镜助手。请按叙事顺序把剧本草成镜头列表。",
    "只输出 JSON，不要 Markdown。字段：shots，每项含 description、dialogue、durationMs、characterNames、sceneName、propNames。",
    "durationMs 以毫秒计，默认 4000，范围 500 到 120000。dialogue 没有对白时用空字符串。",
    `标题：${input.title ?? ""}`,
    `剧本：\n${input.body}`,
  ].join("\n")
}

export function buildWritePromptsPrompt(input: {
  aspectRatio: string
  quality?: string
  shots: Array<{ index: number; description: string; dialogue: string; characterNames: string[]; sceneName: string }>
}): string {
  return [
    "你是开镜的提示词助手。请为每个镜头写 imagePrompt 和 videoPrompt。",
    "只输出 JSON，不要 Markdown。字段：prompts，每项含 index、imagePrompt、videoPrompt、mentionNames。",
    `画面比例是 ${input.aspectRatio}，创建后不要改比例。画质偏好：${input.quality ?? "standard"}。`,
    "用开镜自己的中文句子描述构图、光线、动作和镜头运动，不要套用其他产品的提示词原文。",
    "mentionNames 列出这一镜应引用的角色或场景名。",
    `镜头：${JSON.stringify(input.shots)}`,
  ].join("\n")
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced?.[1]?.trim() ?? trimmed
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) {
    throw new Error("模型没有返回可解析的 JSON。")
  }
  const parsed: unknown = JSON.parse(raw.slice(start, end + 1))
  const record = asRecord(parsed)
  if (!record) throw new Error("模型返回的 JSON 不是对象。")
  return record
}

export function parseRewriteOutput(text: string): RewrittenScript {
  const record = parseJsonObject(text)
  const body = asText(record.body)
  if (!body) throw new Error("改写结果里没有剧本文本。")
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (paragraphs.length < 1) throw new Error("改写结果太空，没有可用的场景段落。")
  return {
    title: asText(record.title, "未命名一集"),
    body: paragraphs.join("\n\n"),
  }
}

function parseEntityList(value: unknown): EntityDraft[] {
  if (!Array.isArray(value)) return []
  const result: EntityDraft[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const record = asRecord(item)
    if (!record) continue
    const name = asText(record.name)
    const key = normalizeEntityName(name)
    if (!name || !key || seen.has(key)) continue
    seen.add(key)
    result.push({
      name,
      description: asText(record.description),
      visualNotes: asText(record.visualNotes),
    })
  }
  return result
}

export function parseExtractOutput(text: string): ExtractedEntities {
  const record = parseJsonObject(text)
  return {
    characters: parseEntityList(record.characters),
    scenes: parseEntityList(record.scenes),
    props: parseEntityList(record.props),
  }
}

export function parseBreakdownOutput(text: string): BreakdownShotDraft[] {
  const record = parseJsonObject(text)
  const shots = Array.isArray(record.shots) ? record.shots : []
  const result: BreakdownShotDraft[] = []
  for (const item of shots) {
    const row = asRecord(item)
    if (!row) continue
    const description = asText(row.description)
    if (!description) continue
    const duration = Number(row.durationMs)
    result.push({
      description,
      dialogue: asText(row.dialogue),
      durationMs:
        Number.isFinite(duration) && duration >= 500 && duration <= 120_000
          ? Math.round(duration)
          : 4000,
      characterNames: Array.isArray(row.characterNames)
        ? row.characterNames.map((name) => asText(name)).filter(Boolean)
        : [],
      sceneName: asText(row.sceneName),
      propNames: Array.isArray(row.propNames)
        ? row.propNames.map((name) => asText(name)).filter(Boolean)
        : [],
    })
  }
  if (result.length === 0) throw new Error("拆镜结果里没有可用镜头。")
  return result
}

export function parsePromptsOutput(text: string, shotCount: number): ShotPromptDraft[] {
  const record = parseJsonObject(text)
  const prompts = Array.isArray(record.prompts) ? record.prompts : []
  const byIndex = new Map<number, ShotPromptDraft>()
  for (const item of prompts) {
    const row = asRecord(item)
    if (!row) continue
    const index = Number(row.index)
    if (!Number.isInteger(index) || index < 0 || index >= shotCount) continue
    const imagePrompt = asText(row.imagePrompt)
    const videoPrompt = asText(row.videoPrompt)
    if (!imagePrompt || !videoPrompt) continue
    byIndex.set(index, {
      index,
      imagePrompt,
      videoPrompt,
      mentionNames: Array.isArray(row.mentionNames)
        ? row.mentionNames.map((name) => asText(name)).filter(Boolean)
        : [],
    })
  }
  if (byIndex.size !== shotCount) {
    throw new Error("提示词数量和镜头数量不一致。")
  }
  return Array.from({ length: shotCount }, (_, index) => byIndex.get(index)!)
}

function firstSentence(text: string, fallback: string): string {
  const trimmed = text.trim()
  if (!trimmed) return fallback
  const sentence = trimmed.split(/[。！？\n]/)[0]?.trim() || trimmed
  return sentence.slice(0, 40) || fallback
}

function paragraphsFromSource(sourceText: string, existingBody?: string): string[] {
  if (existingBody?.trim()) {
    const parts = existingBody
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length > 0) return parts
  }
  const raw = sourceText.trim()
  if (!raw) return []
  const novelParts = raw
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (novelParts.length >= 2) return novelParts.slice(0, 8)
  return [
    `开场。镜头慢慢靠近，带出这句话里的情境：${raw}`,
    `发展。人物因此行动，情绪被推进一步：${raw}`,
    `收束。这一集停在一个还能继续拍下去的瞬间：${raw}`,
  ]
}

export function composeRewrite(input: RewriteInput): RewrittenScript {
  const source = (input.sourceText ?? "").trim() || (input.existingBody ?? "").trim()
  if (!source) throw new Error("请先写下一句话或一段小说，再做一集。")
  const parts = paragraphsFromSource(source, input.existingBody)
  return {
    title: (input.title ?? "").trim() || firstSentence(source, "未命名一集"),
    body: parts.join("\n\n"),
  }
}

export function composeExtract(input: { title?: string; body: string }): ExtractedEntities {
  const body = input.body.trim()
  const title = (input.title ?? "").trim() || firstSentence(body, "主角")
  const lead = firstSentence(body, title)
  return {
    characters: [
      {
        name: "主角",
        description: `这一集围绕「${lead}」行动的主要人物。`,
        visualNotes: "年龄和外貌以剧本情境为准，服装干净、便于连续出镜，表情随剧情变化。",
      },
    ],
    scenes: [
      {
        name: "主场景",
        description: "剧本主要发生的空间。",
        visualNotes: "空间层次清楚，光线稳定，便于竖屏或横屏构图。",
      },
    ],
    props: [],
  }
}

export function composeBreakdown(input: { body: string }): BreakdownShotDraft[] {
  const parts = paragraphsFromSource(input.body, input.body)
  return parts.map((part, index) => ({
    description: part.replace(/\s+/g, " ").slice(0, 400),
    dialogue: index === 1 ? "就在这里。" : "",
    durationMs: 4000,
    characterNames: ["主角"],
    sceneName: "主场景",
    propNames: [],
  }))
}

export function composePrompts(input: {
  aspectRatio: string
  quality?: string
  shots: Array<{ description: string; dialogue: string; characterNames: string[]; sceneName: string }>
}): ShotPromptDraft[] {
  const ratio = input.aspectRatio === "16:9" ? "横屏 16:9" : "竖屏 9:16"
  const quality = input.quality === "fast" ? "快速预览，细节适中" : "标准画质，光线层次清楚"
  return input.shots.map((shot, index) => {
    const people = shot.characterNames.join("、") || "主角"
    const scene = shot.sceneName || "主场景"
    const action = shot.description
    const talk = shot.dialogue ? `对白：「${shot.dialogue}」。` : "这一镜没有对白。"
    const imagePrompt = `开镜${ratio}，${quality}。场景是${scene}，人物是${people}。画面要能一眼看懂这一镜：${action} ${talk}保持人物外形连续，不要改变既定画面比例。`
    const videoPrompt = `开镜${ratio}，${quality}。从建立环境开始，再跟随${people}完成动作：${action} ${talk}镜头运动平稳，时长与分镜一致，不要跳切到无关空间。`
    return {
      index,
      imagePrompt,
      videoPrompt,
      mentionNames: [...new Set([...shot.characterNames, shot.sceneName].filter(Boolean))],
    }
  })
}

export type DirectorTextTask =
  | "rewrite_script"
  | "extract_entities"
  | "breakdown_storyboard"
  | "write_prompts"

export function composeEpisodeTextFromTask(
  task: DirectorTextTask,
  payload: Record<string, unknown>,
): string {
  if (task === "rewrite_script") {
    return JSON.stringify(composeRewrite(payload as RewriteInput))
  }
  if (task === "extract_entities") {
    return JSON.stringify(composeExtract({ title: asText(payload.title), body: asText(payload.body) }))
  }
  if (task === "breakdown_storyboard") {
    return JSON.stringify({ shots: composeBreakdown({ body: asText(payload.body) }) })
  }
  const shots = Array.isArray(payload.shots) ? payload.shots : []
  return JSON.stringify({
    prompts: composePrompts({
      aspectRatio: asText(payload.aspectRatio, "9:16") || "9:16",
      quality: asText(payload.quality) || undefined,
      shots: shots.map((item) => {
        const row = asRecord(item) ?? {}
        return {
          description: asText(row.description),
          dialogue: asText(row.dialogue),
          characterNames: Array.isArray(row.characterNames)
            ? row.characterNames.map((name) => asText(name)).filter(Boolean)
            : [],
          sceneName: asText(row.sceneName),
        }
      }),
    }),
  })
}
