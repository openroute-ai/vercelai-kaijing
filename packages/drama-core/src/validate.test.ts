import assert from "node:assert/strict"
import test from "node:test"
import {
  parseScriptDraft,
  parseScriptDraftJson,
  parseStoryboardDraft,
  parseStoryboardDraftJson,
} from "./validate"

test("parseScriptDraft accepts a hand-written draft", () => {
  const parsed = parseScriptDraft({
    title: " 雨夜 ",
    sourceKind: "one_liner",
    sourceText: "一只猫在雨里回头",
    body: "猫站住。\n\n它回头。",
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.value.title, "雨夜")
  assert.equal(parsed.value.sourceKind, "one_liner")
})

test("parseScriptDraftJson rejects invalid JSON and source kind", () => {
  const invalid = parseScriptDraftJson("{")
  assert.equal(invalid.ok, false)
  const kind = parseScriptDraft({
    title: "雨夜",
    sourceKind: "script",
    sourceText: "",
    body: "",
  })
  assert.equal(kind.ok, false)
  if (kind.ok) return
  assert.ok(kind.issues.some((issue) => issue.includes("sourceKind")))
})

test("parseStoryboardDraft fills duration and rejects an empty shot", () => {
  const parsed = parseStoryboardDraft({
    title: "分镜",
    shots: [{ description: "猫回头", dialogue: "……" }],
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.value.shots[0]?.durationMs, 4000)
  assert.equal(parsed.value.shots[0]?.dialogue, "……")

  const missing = parseStoryboardDraftJson(
    JSON.stringify({ title: "分镜", shots: [{ description: "  " }] }),
  )
  assert.equal(missing.ok, false)
})
