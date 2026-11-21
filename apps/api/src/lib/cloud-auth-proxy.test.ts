import assert from "node:assert/strict"
import test from "node:test"
import { callBetterAuth, cloudAuthPath } from "./cloud-auth-proxy"

test("cloud register and login are better-auth email routes", async () => {
  assert.equal(cloudAuthPath("register"), "/api/auth/sign-up/email")
  assert.equal(cloudAuthPath("login"), "/api/auth/sign-in/email")
  assert.equal(cloudAuthPath("session"), "/api/auth/get-session")
  assert.equal(cloudAuthPath("logout"), "/api/auth/sign-out")

  const seen: string[] = []
  const response = await callBetterAuth(
    (request) => {
      seen.push(`${request.method} ${new URL(request.url).pathname}`)
      return new Response(JSON.stringify({ user: { id: "user-1" } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "cloud.session_token=issued-by-better-auth; Path=/; HttpOnly",
        },
      })
    },
    "register",
    {
      headers: new Headers({ origin: "http://127.0.0.1:3020" }),
      body: { email: "a@example.com", password: "Secret1!", name: "A" },
    },
  )
  assert.deepEqual(seen, ["POST /api/auth/sign-up/email"])
  assert.equal(response.headers.get("set-cookie")?.includes("cloud.session_token"), true)
})

test("cloud session read is a better-auth GET", async () => {
  let method = ""
  await callBetterAuth(
    (request) => {
      method = request.method
      return new Response("null", { status: 200 })
    },
    "session",
    { headers: new Headers({ cookie: "cloud.session_token=abc" }) },
  )
  assert.equal(method, "GET")
})
