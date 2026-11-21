export type GenerationKind = "text" | "image" | "video"

export type GenerationJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

export type GenerationRequest = {
  kind: GenerationKind
  prompt: string
  references?: string[]
  metadata?: Record<string, unknown>
}

export type GenerationResult = {
  jobId: string
  status: GenerationJobStatus
  outputUrl?: string
  error?: string
}

/**
 * 云网关调用供应商的统一接口。
 * 密钥只放在网关进程里。桌面端不实现这个接口，只向网关提交任务。
 */
export interface GenerationProvider {
  readonly id: string
  submit(request: GenerationRequest): Promise<GenerationResult>
  get(jobId: string): Promise<GenerationResult>
}

/** 不访问外网。提交后永远停在 queued，供 M0 把调用点接上。 */
export function createStubProvider(id = "stub"): GenerationProvider {
  return {
    id,
    async submit() {
      return { jobId: "stub", status: "queued" }
    },
    async get(jobId) {
      return { jobId, status: "queued" }
    },
  }
}
