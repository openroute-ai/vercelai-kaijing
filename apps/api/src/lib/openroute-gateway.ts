/**
 * 开镜薄云访问现有 OpenRoute 生产网关的 HTTP 客户端。
 * 基址：https://api.openroute.cn/v1
 * 不复制 openroute-website/apps/ontoroute 的供应商适配、MediaOrderService 或 LiteLLM 管理代码。
 */
export const DEFAULT_OPENROUTE_API_URL = "https://api.openroute.cn/v1"

export const OPENROUTE_MISSING_KEY =
  "尚未配置 OpenRoute 平台密钥（OPENROUTE_API_KEY 或 KAIJING_API_KEY）。普通路径默认走平台网关，请运营配置一把 sk- 密钥；你也可以在高级设置里填写自己的 OpenRoute sk- 密钥。不会伪造图片或视频。"

export type OpenRouteGenerationKind = "text" | "image" | "video" | "audio"

export type OpenRouteGenerationResult = {
  jobId: string
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
  text?: string
  outputUrl?: string
  mimeType?: string
  error?: string
}

export type OpenRouteClientOptions = {
  baseUrl?: string
  apiKey?: string
  textModel?: string
  imageModel?: string
  videoModel?: string
  audioModel?: string
  referer?: string
  title?: string
  fetch?: typeof fetch
  env?: NodeJS.ProcessEnv
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

export function normalizeOpenRouteBaseUrl(url: string): string {
  const trimmed = trimSlash(url.trim() || DEFAULT_OPENROUTE_API_URL)
  if (trimmed.endsWith("/v1")) return trimmed
  return `${trimmed}/v1`
}

export function resolveOpenRouteConfig(options: OpenRouteClientOptions = {}) {
  const env = options.env ?? process.env
  const baseUrl = normalizeOpenRouteBaseUrl(
    firstDefined(
      options.baseUrl,
      env.OPENROUTE_API_URL,
      env.KAIJING_API_BASE,
      env.KAIJING_TEXT_API_BASE,
    ) || DEFAULT_OPENROUTE_API_URL,
  )
  const apiKey = firstDefined(
    options.apiKey,
    env.OPENROUTE_API_KEY,
    env.KAIJING_API_KEY,
    env.KAIJING_TEXT_API_KEY,
    env.KAIJING_IMAGE_API_KEY,
    env.KAIJING_VIDEO_API_KEY,
  )
  return {
    baseUrl,
    apiKey,
    textModel: firstDefined(options.textModel, env.OPENROUTE_TEXT_MODEL, env.KAIJING_TEXT_MODEL) || "openai/gpt-4o-mini",
    imageModel:
      firstDefined(options.imageModel, env.OPENROUTE_IMAGE_MODEL, env.KAIJING_IMAGE_MODEL) ||
      "qwen/qwen-image-plus",
    videoModel: firstDefined(options.videoModel, env.OPENROUTE_VIDEO_MODEL, env.KAIJING_VIDEO_MODEL),
    audioModel: firstDefined(options.audioModel, env.OPENROUTE_AUDIO_MODEL, env.KAIJING_AUDIO_MODEL) || "openai/tts-1",
    referer: options.referer || "https://vercelai.cn",
    title: options.title || "Kaijing",
  }
}

function imageSize(aspectRatio: unknown): string {
  return aspectRatio === "16:9" ? "1792x1024" : "1024x1792"
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "")
  if (!text) return `OpenRoute 返回 HTTP ${response.status}`
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
    if (typeof parsed.error === "string") return parsed.error
    return parsed.error?.message || parsed.message || text.slice(0, 400)
  } catch {
    return text.slice(0, 400)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function videoStatus(value: unknown): OpenRouteGenerationResult["status"] {
  const status = typeof value === "string" ? value.toLowerCase() : ""
  if (status === "succeeded" || status === "success" || status === "completed" || status === "complete") {
    return "succeeded"
  }
  if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") {
    return status.startsWith("cancel") ? "cancelled" : "failed"
  }
  if (status === "running" || status === "processing" || status === "in_progress") return "running"
  return "queued"
}

function videoUrl(payload: Record<string, unknown>): string | undefined {
  const direct = [payload.outputUrl, payload.output_url, payload.url, payload.video_url, payload.content_url]
  for (const item of direct) {
    if (typeof item === "string" && item.trim()) return item.trim()
  }
  const data = asRecord(payload.data)
  if (data) {
    const nested = [data.outputUrl, data.output_url, data.url, data.video_url]
    for (const item of nested) {
      if (typeof item === "string" && item.trim()) return item.trim()
    }
  }
  return undefined
}

export function createOpenRouteClient(options: OpenRouteClientOptions = {}) {
  const fetchImpl = options.fetch ?? fetch

  function configWith(apiKey?: string) {
    return resolveOpenRouteConfig({ ...options, apiKey: apiKey || options.apiKey })
  }

  function headers(apiKey: string, config = configWith(apiKey)): HeadersInit {
    return {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "HTTP-Referer": config.referer,
      "X-Title": config.title,
    }
  }

  async function submit(input: {
    kind: OpenRouteGenerationKind
    prompt: string
    quality?: string
    references?: string[]
    metadata?: Record<string, unknown>
    apiKey?: string
  }): Promise<OpenRouteGenerationResult> {
    const config = configWith(input.apiKey)
    if (!config.apiKey) {
      return { jobId: "openroute-missing-key", status: "failed", error: OPENROUTE_MISSING_KEY }
    }

    try {
      if (input.kind === "text") {
        const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: headers(config.apiKey, config),
          body: JSON.stringify({
            model: config.textModel,
            temperature: 0.4,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: "你是开镜的短剧文本助手。只输出 JSON 对象，不要 Markdown 代码块。",
              },
              { role: "user", content: input.prompt },
            ],
          }),
        })
        if (!response.ok) {
          return { jobId: "openroute-text", status: "failed", error: `文本生成失败：${await readError(response)}` }
        }
        const payload = (await response.json()) as {
          id?: string
          choices?: Array<{ message?: { content?: string } }>
        }
        const text = payload.choices?.[0]?.message?.content?.trim()
        if (!text) return { jobId: payload.id || "openroute-text", status: "failed", error: "OpenRoute 没有返回文本结果。" }
        return { jobId: payload.id || "openroute-text", status: "succeeded", text }
      }

      if (input.kind === "image") {
        const response = await fetchImpl(`${config.baseUrl}/images/generations`, {
          method: "POST",
          headers: headers(config.apiKey, config),
          body: JSON.stringify({
            model: config.imageModel,
            prompt: input.prompt,
            n: 1,
            size: imageSize(input.metadata?.aspectRatio),
            quality: input.quality === "fast" ? "standard" : "hd",
            response_format: "url",
          }),
        })
        if (!response.ok) {
          return { jobId: "openroute-image", status: "failed", error: `图像生成失败：${await readError(response)}` }
        }
        const payload = (await response.json()) as {
          created?: number
          data?: Array<{ url?: string; b64_json?: string }>
        }
        const item = payload.data?.[0]
        const outputUrl = item?.url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : undefined)
        if (!outputUrl) {
          return { jobId: "openroute-image", status: "failed", error: "OpenRoute 没有返回图片地址。" }
        }
        return {
          jobId: payload.created ? `openroute-image-${payload.created}` : "openroute-image",
          status: "succeeded",
          outputUrl,
          mimeType: "image/png",
        }
      }

      if (input.kind === "audio") {
        const voice = typeof input.metadata?.voice === "string" && input.metadata.voice.trim()
          ? input.metadata.voice.trim()
          : "alloy"
        const response = await fetchImpl(`${config.baseUrl}/audio/speech`, {
          method: "POST",
          headers: headers(config.apiKey, config),
          body: JSON.stringify({
            model: config.audioModel,
            input: input.prompt,
            voice,
            response_format: "mp3",
          }),
        })
        if (!response.ok) {
          return { jobId: "openroute-audio", status: "failed", error: `对白配音失败：${await readError(response)}` }
        }
        const mimeType = response.headers.get("content-type") || "audio/mpeg"
        if (mimeType.includes("json")) {
          return { jobId: "openroute-audio", status: "failed", error: `对白配音失败：${await readError(response)}` }
        }
        const bytes = Buffer.from(await response.arrayBuffer())
        if (!bytes.length) {
          return { jobId: "openroute-audio", status: "failed", error: "OpenRoute 没有返回音频数据。" }
        }
        return {
          jobId: "openroute-audio",
          status: "succeeded",
          outputUrl: `data:${mimeType.split(";")[0] || "audio/mpeg"};base64,${bytes.toString("base64")}`,
          mimeType: mimeType.split(";")[0] || "audio/mpeg",
        }
      }

      if (!config.videoModel) {
        return {
          jobId: "openroute-video",
          status: "failed",
          error: "尚未配置视频模型（KAIJING_VIDEO_MODEL 或 OPENROUTE_VIDEO_MODEL）。不会伪造视频文件。",
        }
      }
      const response = await fetchImpl(`${config.baseUrl}/videos`, {
        method: "POST",
        headers: headers(config.apiKey, config),
        body: JSON.stringify({
          model: config.videoModel,
          prompt: input.prompt,
          aspect_ratio: input.metadata?.aspectRatio === "16:9" ? "16:9" : "9:16",
          quality: input.quality ?? "standard",
          references: input.references ?? [],
        }),
      })
      if (!response.ok) {
        return { jobId: "openroute-video", status: "failed", error: `视频生成失败：${await readError(response)}` }
      }
      const payload = asRecord(await response.json()) ?? {}
      const jobId = String(payload.id || payload.job_id || payload.jobId || "")
      const url = videoUrl(payload)
      const status = url ? "succeeded" : videoStatus(payload.status)
      if (!jobId && !url) {
        return { jobId: "openroute-video", status: "failed", error: "OpenRoute 没有返回视频任务编号。" }
      }
      return {
        jobId: jobId || "openroute-video",
        status,
        outputUrl: url,
        mimeType: url ? "video/mp4" : undefined,
        error: typeof payload.error === "string" ? payload.error : undefined,
      }
    } catch (error) {
      return {
        jobId: "openroute-error",
        status: "failed",
        error: error instanceof Error ? `无法连接 OpenRoute：${error.message}` : "无法连接 OpenRoute。",
      }
    }
  }

  async function get(jobId: string, input: { kind?: OpenRouteGenerationKind; apiKey?: string } = {}): Promise<OpenRouteGenerationResult> {
    const config = configWith(input.apiKey)
    if (!config.apiKey) {
      return { jobId, status: "failed", error: OPENROUTE_MISSING_KEY }
    }
    if (input.kind && input.kind !== "video") {
      return { jobId, status: "failed", error: "该任务在提交时已经结束，不能再查询。" }
    }
    try {
      const response = await fetchImpl(`${config.baseUrl}/videos/${encodeURIComponent(jobId)}`, {
        headers: headers(config.apiKey, config),
      })
      if (!response.ok) {
        return { jobId, status: "failed", error: `查询视频任务失败：${await readError(response)}` }
      }
      const payload = asRecord(await response.json()) ?? {}
      const url = videoUrl(payload) || `${config.baseUrl}/videos/${encodeURIComponent(jobId)}/content`
      const status = videoStatus(payload.status)
      if (status === "succeeded") {
        return { jobId, status, outputUrl: videoUrl(payload) || url, mimeType: "video/mp4" }
      }
      if (status === "failed" || status === "cancelled") {
        return {
          jobId,
          status,
          error: typeof payload.error === "string" ? payload.error : "视频生成失败。",
        }
      }
      return { jobId, status }
    } catch (error) {
      return {
        jobId,
        status: "failed",
        error: error instanceof Error ? `无法查询 OpenRoute 任务：${error.message}` : "无法查询 OpenRoute 任务。",
      }
    }
  }

  return { submit, get, config: () => configWith() }
}

const defaultClient = createOpenRouteClient()

export async function submitOpenRouteGeneration(input: {
  kind: OpenRouteGenerationKind
  prompt: string
  quality?: string
  references?: string[]
  metadata?: Record<string, unknown>
  apiKey?: string
}): Promise<OpenRouteGenerationResult> {
  return defaultClient.submit(input)
}

export async function getOpenRouteGeneration(
  jobId: string,
  input: { kind?: OpenRouteGenerationKind; apiKey?: string } = {},
): Promise<OpenRouteGenerationResult> {
  return defaultClient.get(jobId, input)
}
