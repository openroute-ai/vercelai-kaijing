/**
 * 导演文本任务：在薄云内调用 OpenRoute chat，或在无密钥时返回开镜内置编排。
 * 不复制火宝提示词，不实现供应商适配。
 */
import {
  buildBreakdownPrompt,
  buildExtractPrompt,
  buildRewritePrompt,
  buildWritePromptsPrompt,
  composeBreakdown,
  composeExtract,
  composePrompts,
  composeRewrite,
} from "@workspace/drama-core"

export const DIRECTOR_TASKS = [
  "rewrite_script",
  "extract_entities",
  "breakdown_storyboard",
  "write_prompts",
] as const

export type DirectorTask = (typeof DIRECTOR_TASKS)[number]

export type DirectorTextResult = {
  source: "openroute" | "builtin"
  text: string
  error?: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function scriptFields(payload: Record<string, unknown>) {
  const source = asRecord(payload.source)
  const script = asRecord(payload.script)
  return {
    title: String(source.title ?? script.title ?? payload.title ?? ""),
    sourceKind: String(source.sourceKind ?? payload.sourceKind ?? "one_liner"),
    sourceText: String(source.sourceText ?? script.sourceText ?? payload.sourceText ?? ""),
    body: String(source.body ?? script.body ?? payload.body ?? ""),
  }
}


export function builtinDirectorText(
  task: DirectorTask,
  payload: Record<string, unknown>,
  options: { aspectRatio?: string; quality?: string } = {},
): string {
  const aspectRatio = options.aspectRatio === "16:9" ? "16:9" : "9:16"
  const quality = options.quality === "fast" ? "fast" : "standard"
  if (task === "rewrite_script") {
    return JSON.stringify(composeRewrite(scriptFields(payload)))
  }
  if (task === "extract_entities") {
    const script = scriptFields(payload)
    return JSON.stringify(composeExtract({ title: script.title, body: script.body }))
  }
  if (task === "breakdown_storyboard") {
    return JSON.stringify(composeBreakdown({ body: scriptFields(payload).body }))
  }
  const shots = Array.isArray(payload.shots) ? payload.shots : []
  return JSON.stringify(
    composePrompts({
      aspectRatio,
      quality,
      shots: shots.map((row, index) => {
        const item = asRecord(row)
        return {
          index: typeof item.index === "number" ? item.index : index,
          description: String(item.description ?? ""),
          dialogue: String(item.dialogue ?? ""),
          characterNames: Array.isArray(item.characterNames)
            ? item.characterNames.map((name) => String(name))
            : [],
          sceneName: String(item.sceneName ?? "主场景"),
        }
      }),
    }),
  )
}

export function buildDirectorPrompt(
  task: DirectorTask,
  payload: Record<string, unknown>,
  options: { aspectRatio?: string; quality?: string } = {},
): string {
  const aspectRatio = options.aspectRatio === "16:9" ? "16:9" : "9:16"
  const quality = options.quality === "fast" ? "fast" : "standard"
  if (task === "rewrite_script") {
    return buildRewritePrompt(scriptFields(payload))
  }
  if (task === "extract_entities") {
    const script = scriptFields(payload)
    return buildExtractPrompt({ title: script.title, body: script.body })
  }
  if (task === "breakdown_storyboard") {
    const script = scriptFields(payload)
    return buildBreakdownPrompt({ title: script.title, body: script.body })
  }
  const shots = Array.isArray(payload.shots) ? payload.shots : []
  return buildWritePromptsPrompt({
    aspectRatio,
    quality,
    shots: shots.map((row, index) => {
      const item = asRecord(row)
      return {
        index: typeof item.index === "number" ? item.index : index,
        description: String(item.description ?? ""),
        dialogue: String(item.dialogue ?? ""),
        characterNames: Array.isArray(item.characterNames)
          ? item.characterNames.map((name) => String(name))
          : [],
        sceneName: String(item.sceneName ?? "主场景"),
      }
    }),
  })
}

export async function runDirectorText(input: {
  task: DirectorTask
  payload: Record<string, unknown>
  quality?: string
  aspectRatio?: string
  generateText?: (prompt: string) => Promise<{ text?: string; error?: string; ok: boolean }>
}): Promise<DirectorTextResult> {
  const builtin = builtinDirectorText(input.task, input.payload, {
    aspectRatio: input.aspectRatio,
    quality: input.quality,
  })
  if (!input.generateText) {
    return { source: "builtin", text: builtin }
  }
  const prompt = buildDirectorPrompt(input.task, input.payload, {
    aspectRatio: input.aspectRatio,
    quality: input.quality,
  })
  const generated = await input.generateText(prompt)
  if (generated.ok && generated.text?.trim()) {
    return { source: "openroute", text: generated.text.trim() }
  }
  return {
    source: "builtin",
    text: builtin,
    error: generated.error || "OpenRoute 未返回可用文本，已改用开镜内置文本编排。",
  }
}
