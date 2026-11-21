import assert from "node:assert/strict"
import { test } from "node:test"
import { createStubCommandKernel } from "./command-kernel"

test("M0 命令内核拒绝执行并带回命令名", async () => {
  const kernel = createStubCommandKernel()
  const result = await kernel.dispatch({
    name: "drama.rewrite_script",
    input: { sourceText: "一句话" },
  })
  assert.equal(result.ok, false)
  assert.equal(result.command, "drama.rewrite_script")
  assert.match(result.error ?? "", /M0/)
})
