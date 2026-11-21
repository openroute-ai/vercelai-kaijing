import assert from "node:assert/strict"
import { test } from "node:test"
import { DEFAULT_WORKSPACE_URL, resolveWorkspaceUrl } from "./workspace-url"

test("缺省指向本机工作台", () => {
  assert.equal(resolveWorkspaceUrl({}), DEFAULT_WORKSPACE_URL)
})

test("环境变量可以改工作台地址", () => {
  assert.equal(
    resolveWorkspaceUrl({ KAIJING_WORKSPACE_URL: "http://127.0.0.1:4173" }),
    "http://127.0.0.1:4173",
  )
})
