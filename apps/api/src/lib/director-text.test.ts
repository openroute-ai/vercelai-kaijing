import assert from "node:assert/strict"
import { test } from "node:test"

import { parseExtractOutput, parseRewriteOutput } from "@workspace/drama-core"

import { builtinDirectorText, runDirectorText } from "./director-text"

test("无密钥时由薄云返回内置改写，不假装调用 OpenRoute", async () => {
  const result = await runDirectorText({
    task: "rewrite_script",
    payload: { title: "雨夜", sourceKind: "one_liner", sourceText: "一只猫在雨里回头", body: "" },
  })
  assert.equal(result.source, "builtin")
  const parsed = parseRewriteOutput(result.text)
  assert.ok(parsed.body.includes("一只猫在雨里回头"))
})

test("OpenRoute 成功时返回网关文本；失败则回退内置编排并标明原因", async () => {
  const ok = await runDirectorText({
    task: "extract_entities",
    payload: { title: "雨夜", body: "小明站在雨里。" },
    generateText: async () => ({
      ok: true,
      text: JSON.stringify({ characters: [{ name: "小明", description: "少年" }], scenes: [], props: [] }),
    }),
  })
  assert.equal(ok.source, "openroute")
  assert.equal(parseExtractOutput(ok.text).characters[0]?.name, "小明")

  const fallback = await runDirectorText({
    task: "extract_entities",
    payload: { title: "雨夜", body: "小明站在雨里。" },
    generateText: async () => ({ ok: false, error: "网关不可用" }),
  })
  assert.equal(fallback.source, "builtin")
  assert.match(fallback.error ?? "", /内置|网关/)
  assert.ok(builtinDirectorText("extract_entities", { title: "雨夜", body: "小明站在雨里。" }).length > 2)
})
