import assert from "node:assert/strict"
import { test } from "node:test"
import {
  createOpenRouteClient,
  normalizeOpenRouteBaseUrl,
  OPENROUTE_MISSING_KEY,
  resolveOpenRouteConfig,
} from "./openroute-gateway"

test("默认基址是 api.openroute.cn/v1，缺斜杠时会补上", () => {
  assert.equal(normalizeOpenRouteBaseUrl("https://api.openroute.cn"), "https://api.openroute.cn/v1")
  assert.equal(normalizeOpenRouteBaseUrl("https://api.openroute.cn/v1/"), "https://api.openroute.cn/v1")
  const config = resolveOpenRouteConfig({ env: {} })
  assert.equal(config.baseUrl, "https://api.openroute.cn/v1")
  assert.equal(config.apiKey, undefined)
})

test("没有密钥时清晰失败，不返回媒体地址", async () => {
  const client = createOpenRouteClient({ env: {} })
  const image = await client.submit({ kind: "image", prompt: "角色正面" })
  assert.equal(image.status, "failed")
  assert.equal(image.outputUrl, undefined)
  assert.equal(image.error, OPENROUTE_MISSING_KEY)
  const video = await client.submit({ kind: "video", prompt: "她转过身" })
  assert.equal(video.status, "failed")
  assert.equal(video.outputUrl, undefined)
})

test("共用一把 sk- 密钥调用公开的 chat / images / videos 路径", async () => {
  const calls: Array<{ url: string; method?: string; body?: unknown }> = []
  const client = createOpenRouteClient({
    env: {
      OPENROUTE_API_URL: "https://api.openroute.cn/v1",
      OPENROUTE_API_KEY: "sk-test-platform",
      KAIJING_VIDEO_MODEL: "demo/video",
    },
    fetch: async (input, init) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, method: init?.method, body })
      const headers = new Headers(init?.headers)
      assert.match(headers.get("authorization") || "", /Bearer sk-test-platform/)
      assert.equal(headers.get("HTTP-Referer") || headers.get("http-referer"), "https://vercelai.cn")
      if (url.endsWith("/chat/completions")) {
        return new Response(JSON.stringify({ id: "chat_1", choices: [{ message: { content: '{"title":"雨夜","body":"开场。"}' } }] }), { status: 200 })
      }
      if (url.endsWith("/images/generations")) {
        return new Response(JSON.stringify({ created: 1, data: [{ url: "https://cdn.example/char.png" }] }), { status: 200 })
      }
      if (url.endsWith("/videos")) {
        return new Response(JSON.stringify({ id: "vid_1", status: "queued" }), { status: 200 })
      }
      if (url.endsWith("/videos/vid_1")) {
        return new Response(JSON.stringify({ id: "vid_1", status: "succeeded", url: "https://cdn.example/shot.mp4" }), { status: 200 })
      }
      return new Response("not found", { status: 404 })
    },
  })

  const text = await client.submit({ kind: "text", prompt: "写一集" })
  assert.equal(text.status, "succeeded")
  assert.match(text.text ?? "", /雨夜/)
  const image = await client.submit({ kind: "image", prompt: "角色", metadata: { aspectRatio: "9:16" } })
  assert.equal(image.status, "succeeded")
  assert.equal(image.outputUrl, "https://cdn.example/char.png")
  const video = await client.submit({ kind: "video", prompt: "行走" })
  assert.equal(video.status, "queued")
  assert.equal(video.outputUrl, undefined)
  const polled = await client.get("vid_1", { kind: "video" })
  assert.equal(polled.status, "succeeded")
  assert.equal(polled.outputUrl, "https://cdn.example/shot.mp4")
  assert.ok(calls.some((item) => item.url === "https://api.openroute.cn/v1/chat/completions"))
  assert.ok(calls.some((item) => item.url === "https://api.openroute.cn/v1/images/generations"))
  assert.equal((calls.find((item) => item.url.endsWith("/images/generations"))?.body as { size?: string }).size, "1024x1792")
  assert.ok(calls.some((item) => item.url === "https://api.openroute.cn/v1/videos"))
  assert.ok(calls.some((item) => item.url === "https://api.openroute.cn/v1/videos/vid_1"))
})

test("KAIJING_API_KEY 可作为共用密钥别名", () => {
  const config = resolveOpenRouteConfig({
    env: { KAIJING_API_BASE: "https://api.openroute.cn", KAIJING_API_KEY: "sk-alias" },
  })
  assert.equal(config.baseUrl, "https://api.openroute.cn/v1")
  assert.equal(config.apiKey, "sk-alias")
})
