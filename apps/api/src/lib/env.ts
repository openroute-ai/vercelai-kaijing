import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const commaSeparatedList = z
  .string()
  .optional()
  .transform((val) =>
    val
      ? val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  )

export const env = createEnv({
  clientPrefix: "",
  client: {},
  server: {
    PORT: z
      .string()
      .optional()
      .default("8080")
      .transform(Number)
      .pipe(z.number().int().positive()),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.url().optional(),
    CLOUD_AUTH_URL: z.url().optional(),
    BETTER_AUTH_TRUSTED_ORIGINS: commaSeparatedList,
    // 现有 OpenRoute 生产网关。只做 HTTP 客户端，不在本仓库实现供应商适配。
    OPENROUTE_API_URL: z.string().optional(),
    OPENROUTE_API_KEY: z.string().optional(),
    KAIJING_API_BASE: z.string().optional(),
    KAIJING_API_KEY: z.string().optional(),
    KAIJING_TEXT_API_BASE: z.string().optional(),
    KAIJING_TEXT_API_KEY: z.string().optional(),
    KAIJING_IMAGE_API_KEY: z.string().optional(),
    KAIJING_VIDEO_API_KEY: z.string().optional(),
    KAIJING_TEXT_MODEL: z.string().optional(),
    KAIJING_IMAGE_MODEL: z.string().optional(),
    KAIJING_VIDEO_MODEL: z.string().optional(),
    OPENROUTE_TEXT_MODEL: z.string().optional(),
    OPENROUTE_IMAGE_MODEL: z.string().optional(),
    OPENROUTE_VIDEO_MODEL: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
