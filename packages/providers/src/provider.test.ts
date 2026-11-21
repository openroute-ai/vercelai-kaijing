import assert from "node:assert/strict"
import { test } from "node:test"
import { createStubProvider } from "./provider"

test("占位供应商不产生真实任务号以外的状态", async () => {
  const provider = createStubProvider()
  const submitted = await provider.submit({ kind: "image", prompt: "角色正面" })
  assert.equal(provider.id, "stub")
  assert.equal(submitted.status, "queued")
  const loaded = await provider.get(submitted.jobId)
  assert.equal(loaded.jobId, submitted.jobId)
  assert.equal(loaded.status, "queued")
})
