/**
 * 工作台只把生成请求交给开镜薄云，再由薄云作为 HTTP 客户端调用 api.openroute.cn。
 * 这里不实现供应商适配，也不保存平台密钥。
 */
export type GatewayJob = {
  id: string
  status: string
  kind?: string
  errorMessage?: string | null
  creditCost?: string | null
  result?: { text?: string; outputUrl?: string; mimeType?: string } | null
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: 'needs_login' | 'needs_credits' | 'unavailable'
  ) {
    super(message)
    this.name = 'GatewayError'
  }
}

export type DramaGateway = {
  getSession(): Promise<{ loggedIn: boolean; balance: number | null; offline: boolean }>
  submit(input: {
    kind: 'text' | 'image' | 'video'
    prompt: string
    quality?: string
    references?: string[]
    metadata?: Record<string, unknown>
    idempotencyKey?: string
  }): Promise<GatewayJob>
  get(jobId: string): Promise<GatewayJob>
}

function apiBase() {
  return (process.env.KAIJING_API_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '')
}

export function createDramaGateway({
  request,
  userApiKey,
  fetchImpl = fetch,
}: {
  request?: Request
  userApiKey?: string
  fetchImpl?: typeof fetch
} = {}): DramaGateway {
  const cookie = request?.headers.get('cookie') || ''
  const origin = request?.headers.get('origin') || 'http://127.0.0.1:3020'

  function headers(init?: HeadersInit): Headers {
    const headers = new Headers(init)
    if (cookie) headers.set('cookie', cookie)
    if (origin) headers.set('origin', origin)
    if (userApiKey) headers.set('x-openroute-api-key', userApiKey)
    return headers
  }

  async function read(response: Response): Promise<Record<string, unknown>> {
    return ((await response.json().catch(() => null)) as Record<string, unknown> | null) ?? {}
  }

  function jobFrom(payload: Record<string, unknown>, fallbackId: string): GatewayJob {
    const result = (payload.result as GatewayJob['result']) ?? null
    return {
      id: typeof payload.id === 'string' ? payload.id : fallbackId,
      status: typeof payload.status === 'string' ? payload.status : 'failed',
      kind: typeof payload.kind === 'string' ? payload.kind : undefined,
      errorMessage:
        (typeof payload.errorMessage === 'string' && payload.errorMessage) ||
        (typeof payload.message === 'string' ? payload.message : null),
      creditCost: typeof payload.creditCost === 'string' ? payload.creditCost : null,
      result,
    }
  }

  return {
    async getSession() {
      try {
        const response = await fetchImpl(`${apiBase()}/api/v1/cloud/session`, {
          headers: headers(),
        })
        const payload = await read(response)
        const session = payload.session as { balance?: string } | null
        if (!response.ok || !session) return { loggedIn: false, balance: null, offline: false }
        const balance = session.balance != null ? Number(session.balance) : null
        return {
          loggedIn: true,
          balance: Number.isFinite(balance) ? balance : null,
          offline: false,
        }
      } catch {
        return { loggedIn: false, balance: null, offline: true }
      }
    },
    async submit(input) {
      let response: Response
      try {
        response = await fetchImpl(`${apiBase()}/api/v1/generations`, {
          method: 'POST',
          headers: headers({ 'content-type': 'application/json' }),
          body: JSON.stringify(input),
        })
      } catch {
        throw new GatewayError('无法连接开镜薄云，请确认 API 已启动。', 503, 'unavailable')
      }
      const payload = await read(response)
      const message =
        (typeof payload.message === 'string' && payload.message) ||
        (typeof payload.errorMessage === 'string' && payload.errorMessage) ||
        `生成请求失败（${response.status}）`
      if (response.status === 401) throw new GatewayError(message, 401, 'needs_login')
      if (response.status === 402) throw new GatewayError(message, 402, 'needs_credits')
      if (response.status === 503) throw new GatewayError(message, 503, 'unavailable')
      if (!response.ok && !payload.id) throw new GatewayError(message, response.status, 'unavailable')
      return jobFrom(payload, 'unknown')
    },
    async get(jobId) {
      const response = await fetchImpl(`${apiBase()}/api/v1/generations/${encodeURIComponent(jobId)}`, {
        headers: headers(),
      })
      const payload = await read(response)
      if (!response.ok) {
        throw new GatewayError(
          (typeof payload.message === 'string' && payload.message) || '查询生成任务失败',
          response.status
        )
      }
      return jobFrom(payload, jobId)
    },
  }
}
