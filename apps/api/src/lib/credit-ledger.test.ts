import assert from "node:assert/strict"
import { test } from "node:test"
import {
  captureHold,
  createMemoryCreditStore,
  CreditError,
  creditCostFor,
  holdCredits,
  releaseHold,
} from "./credit-ledger"

function store() {
  return createMemoryCreditStore([{ id: "acc_1", userId: "user_1", balance: "80.0000" }])
}

test("文本、图像、视频价格足够覆盖第一集的起步额度拆分", () => {
  const total =
    Number(creditCostFor("text")) * 4 + Number(creditCostFor("image")) + Number(creditCostFor("video"))
  assert.ok(total <= 80)
  assert.equal(creditCostFor("video"), "40.0000")
})

test("积分不足时预扣失败且不记账", async () => {
  const credits = createMemoryCreditStore([{ id: "acc_1", userId: "user_1", balance: "3.0000" }])
  await assert.rejects(
    () => holdCredits(credits, { userId: "user_1", generationJobId: "job_1", amount: "10.0000" }),
    (error: unknown) => error instanceof CreditError && error.status === 402,
  )
  assert.equal((await credits.getAccount("user_1"))?.balance, "3.0000")
  assert.equal((await credits.listLedgerForJob("job_1")).length, 0)
})

test("预扣后失败回退，余额恢复；成功则实扣且不能再回退", async () => {
  const credits = store()
  const held = await holdCredits(credits, { userId: "user_1", generationJobId: "job_ok", amount: "10.0000" })
  assert.equal(held.account.balance, "70.0000")
  const captured = await captureHold(credits, { userId: "user_1", generationJobId: "job_ok" })
  assert.equal(captured.captured, true)
  assert.equal((await credits.getAccount("user_1"))?.balance, "70.0000")
  const again = await captureHold(credits, { userId: "user_1", generationJobId: "job_ok" })
  assert.equal(again.captured, false)
  await assert.rejects(
    () => releaseHold(credits, { userId: "user_1", generationJobId: "job_ok" }),
    (error: unknown) => error instanceof CreditError && error.status === 409,
  )

  const failed = store()
  await holdCredits(failed, { userId: "user_1", generationJobId: "job_fail", amount: "40.0000" })
  const released = await releaseHold(failed, { userId: "user_1", generationJobId: "job_fail" })
  assert.equal(released.released, true)
  assert.equal((await failed.getAccount("user_1"))?.balance, "80.0000")
  const second = await releaseHold(failed, { userId: "user_1", generationJobId: "job_fail" })
  assert.equal(second.released, false)
  assert.equal((await failed.getAccount("user_1"))?.balance, "80.0000")
})

test("同一任务重复预扣不会扣第二次", async () => {
  const credits = store()
  await holdCredits(credits, { userId: "user_1", generationJobId: "job_1", amount: "5.0000" })
  await holdCredits(credits, { userId: "user_1", generationJobId: "job_1", amount: "5.0000" })
  assert.equal((await credits.getAccount("user_1"))?.balance, "75.0000")
  assert.equal((await credits.listLedgerForJob("job_1")).filter((entry) => entry.reason === "hold").length, 1)
})
