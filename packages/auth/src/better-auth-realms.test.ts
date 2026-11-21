import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { createAuth } from "./server"

test("createAuth exposes better-auth email sign-up and sign-in", () => {
  const auth = createAuth({} as never, {
    baseURL: "http://127.0.0.1:8080",
    secret: "cloud-test-secret-cloud-test-secret",
    cookiePrefix: "cloud",
    trustedOrigins: ["http://127.0.0.1:3020"],
  })
  assert.equal(typeof auth.handler, "function")
  assert.equal(typeof auth.api.signUpEmail, "function")
  assert.equal(typeof auth.api.signInEmail, "function")
  assert.equal(typeof auth.api.getSession, "function")
  assert.equal(typeof auth.api.signOut, "function")
})

test("cloud and web product entry points both construct better-auth", () => {
  const cloud = readFileSync(new URL("../../../apps/api/src/lib/auth.ts", import.meta.url), "utf8")
  const cloudRoute = readFileSync(
    new URL("../../../apps/api/src/routes/cloud-auth.ts", import.meta.url),
    "utf8",
  )
  const web = readFileSync(new URL("../../../apps/web/src/lib/auth.ts", import.meta.url), "utf8")

  assert.match(cloud, /createAuth\(/)
  assert.match(cloud, /cookiePrefix:\s*"cloud"/)
  assert.doesNotMatch(cloud, /realmSignUp|signSessionCookie/)

  assert.match(cloudRoute, /callBetterAuth\(/)
  assert.doesNotMatch(cloudRoute, /realmSignUp|realmSignIn|signSessionCookie/)

  assert.match(web, /from "better-auth"|from 'better-auth'/)
  assert.match(web, /betterAuth\(/)
  assert.match(web, /cookiePrefix:\s*'web'/)
  assert.match(web, /emailAndPassword/)
  assert.match(web, /phoneNumber\(/)
  assert.doesNotMatch(web, /realmSignUp|signSessionCookie/)
})
