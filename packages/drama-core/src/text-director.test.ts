import assert from "node:assert/strict"
import { test } from "node:test"
import {
  composeBreakdown,
  composeEpisodeTextFromTask,
  composeExtract,
  composePrompts,
  composeRewrite,
  parseBreakdownOutput,
  parseExtractOutput,
  parsePromptsOutput,
  parseRewriteOutput,
} from "./text-director"

test("内置改写能从一句话得到可编辑的多段剧本", () => {
  const rewritten = composeRewrite({
    sourceKind: "one_liner",
    sourceText: "一只猫在雨里回头",
    title: "雨夜",
  })
  assert.equal(rewritten.title, "雨夜")
  assert.ok(rewritten.body.includes("一只猫在雨里回头"))
  assert.ok(rewritten.body.split("\n\n").length >= 2)
})

test("改写、抽取、拆镜、提示词可以往返解析", () => {
  const rewritten = parseRewriteOutput(
    composeEpisodeTextFromTask("rewrite_script", {
      sourceText: "列车进站，她没有下车",
      title: "终点",
    }),
  )
  const extracted = parseExtractOutput(
    composeEpisodeTextFromTask("extract_entities", { title: rewritten.title, body: rewritten.body }),
  )
  assert.ok(extracted.characters.some((item) => item.name === "主角"))
  assert.ok(extracted.scenes.length >= 1)
  const shots = parseBreakdownOutput(
    composeEpisodeTextFromTask("breakdown_storyboard", { body: rewritten.body }),
  )
  assert.ok(shots.length >= 2)
  const prompts = parsePromptsOutput(
    composeEpisodeTextFromTask("write_prompts", {
      aspectRatio: "9:16",
      quality: "standard",
      shots: shots.map((shot, index) => ({ ...shot, index })),
    }),
    shots.length,
  )
  assert.equal(prompts.length, shots.length)
  assert.match(prompts[0]!.imagePrompt, /开镜竖屏 9:16/)
  assert.doesNotMatch(prompts[0]!.imagePrompt, /火宝|Toonflow|BeatAPI/)
})

test("抽取空名单是合法结果", () => {
  const extracted = parseExtractOutput(JSON.stringify({ characters: [], scenes: [], props: [] }))
  assert.deepEqual(extracted, { characters: [], scenes: [], props: [] })
})

test("内置抽取和拆镜保持角色名稳定", () => {
  const body = composeRewrite({ sourceText: "他在桥上等她" }).body
  const extracted = composeExtract({ title: "桥", body })
  const shots = composeBreakdown({ body })
  const prompts = composePrompts({
    aspectRatio: "16:9",
    shots: shots.map((shot) => ({
      description: shot.description,
      dialogue: shot.dialogue,
      characterNames: shot.characterNames,
      sceneName: shot.sceneName,
    })),
  })
  assert.equal(extracted.characters[0]?.name, "主角")
  assert.match(prompts[0]!.imagePrompt, /横屏 16:9/)
})
