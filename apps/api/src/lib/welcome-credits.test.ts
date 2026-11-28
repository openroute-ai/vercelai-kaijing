import assert from "node:assert/strict"
import test from "node:test"

import {
  PLACEHOLDER_CREDIT_COSTS,
  PLACEHOLDER_CREDIT_PLANS,
  WELCOME_CREDIT_AMOUNT,
} from "@workspace/db"

test("welcome grant is enough for a first shot or first-episode text steps", () => {
  const welcome = Number(WELCOME_CREDIT_AMOUNT)
  assert.ok(welcome > 0)
  assert.ok(welcome >= Number(PLACEHOLDER_CREDIT_COSTS.shotVideo))
  assert.ok(welcome >= Number(PLACEHOLDER_CREDIT_COSTS.episodeText))
  assert.ok(PLACEHOLDER_CREDIT_PLANS.some((plan) => plan.id === "starter"))
})
