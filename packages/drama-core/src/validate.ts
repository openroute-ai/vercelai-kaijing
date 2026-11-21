/**
 * 手写剧本和分镜的校验。不调用模型。
 * @see docs/design/domain.md
 * @see docs/design/commands.md
 */

export const SCRIPT_TEXT_MAX = 200_000
export const TITLE_MAX = 200
export const SHOT_MAX = 200
export const SHOT_DESCRIPTION_MAX = 4_000
export const SHOT_DIALOGUE_MAX = 2_000
export const SHOT_DURATION_DEFAULT_MS = 4_000
export const SHOT_DURATION_MIN_MS = 500
export const SHOT_DURATION_MAX_MS = 120_000

export type ScriptSourceKind = "one_liner" | "novel"

export type ScriptDraftInput = {
  title: string
  sourceKind: ScriptSourceKind
  sourceText: string
  body: string
}

export type StoryboardShotInput = {
  description: string
  dialogue: string
  durationMs: number
}

export type StoryboardDraftInput = {
  title: string
  shots: StoryboardShotInput[]
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[] }

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  return input as Record<string, unknown>
}

function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null
  return value.trim()
}

export function parseScriptDraft(input: unknown): ParseResult<ScriptDraftInput> {
  const record = asRecord(input)
  const issues: string[] = []
  if (!record) {
    return { ok: false, issues: ["剧本必须是对象"] }
  }
  const title = asTrimmed(record.title)
  const sourceText = asTrimmed(record.sourceText)
  const body = asTrimmed(record.body)
  const sourceKind = record.sourceKind
  if (title === null) issues.push("剧本标题必须是字符串")
  else if (title.length > TITLE_MAX) issues.push("剧本标题过长")
  if (sourceKind !== "one_liner" && sourceKind !== "novel") {
    issues.push("sourceKind 只能是 one_liner 或 novel")
  }
  if (sourceText === null) issues.push("原始输入必须是字符串")
  else if (sourceText.length > SCRIPT_TEXT_MAX) issues.push("原始输入过长")
  if (body === null) issues.push("剧本正文必须是字符串")
  else if (body.length > SCRIPT_TEXT_MAX) issues.push("剧本正文过长")
  if (issues.length > 0 || title === null || sourceText === null || body === null) {
    return { ok: false, issues }
  }
  if (sourceKind !== "one_liner" && sourceKind !== "novel") {
    return { ok: false, issues }
  }
  return {
    ok: true,
    value: { title, sourceKind, sourceText, body },
  }
}

export function parseScriptDraftJson(text: string): ParseResult<ScriptDraftInput> {
  try {
    return parseScriptDraft(JSON.parse(text) as unknown)
  } catch {
    return { ok: false, issues: ["剧本不是合法的 JSON"] }
  }
}

export function parseStoryboardDraft(input: unknown): ParseResult<StoryboardDraftInput> {
  const record = asRecord(input)
  if (!record) return { ok: false, issues: ["分镜必须是对象"] }
  const issues: string[] = []
  const title = asTrimmed(record.title)
  if (title === null) issues.push("分镜标题必须是字符串")
  else if (title.length > TITLE_MAX) issues.push("分镜标题过长")
  if (!Array.isArray(record.shots)) {
    issues.push("分镜镜头必须是数组")
    return { ok: false, issues }
  }
  if (record.shots.length > SHOT_MAX) issues.push("分镜镜头过多")
  const shots: StoryboardShotInput[] = []
  for (const [index, shot] of record.shots.entries()) {
    const shotRecord = asRecord(shot)
    const label = `第 ${index + 1} 镜`
    if (!shotRecord) {
      issues.push(`${label}必须是对象`)
      continue
    }
    const description = asTrimmed(shotRecord.description)
    const dialogueRaw = shotRecord.dialogue === undefined ? "" : asTrimmed(shotRecord.dialogue)
    if (description === null || description.length === 0) issues.push(`${label}缺少描述`)
    else if (description.length > SHOT_DESCRIPTION_MAX) issues.push(`${label}描述过长`)
    if (dialogueRaw === null) issues.push(`${label}对白必须是字符串`)
    else if (dialogueRaw.length > SHOT_DIALOGUE_MAX) issues.push(`${label}对白过长`)
    let durationMs = SHOT_DURATION_DEFAULT_MS
    if (shotRecord.durationMs !== undefined) {
      if (
        typeof shotRecord.durationMs !== "number" ||
        !Number.isInteger(shotRecord.durationMs) ||
        shotRecord.durationMs < SHOT_DURATION_MIN_MS ||
        shotRecord.durationMs > SHOT_DURATION_MAX_MS
      ) {
        issues.push(`${label}时长无效`)
      } else {
        durationMs = shotRecord.durationMs
      }
    }
    if (description && dialogueRaw !== null) {
      shots.push({ description, dialogue: dialogueRaw, durationMs })
    }
  }
  if (issues.length > 0 || title === null) return { ok: false, issues }
  return { ok: true, value: { title, shots } }
}

export function parseStoryboardDraftJson(text: string): ParseResult<StoryboardDraftInput> {
  try {
    return parseStoryboardDraft(JSON.parse(text) as unknown)
  } catch {
    return { ok: false, issues: ["分镜不是合法的 JSON"] }
  }
}
