import { AUTH_PATH } from "./auth-path"

/** Product cloud login actions. Each one is a better-auth route, not a custom session. */
export type CloudAuthAction = "register" | "login" | "session" | "logout"

export type BetterAuthHandler = (request: Request) => Response | Promise<Response>

export function cloudAuthPath(action: CloudAuthAction): string {
  switch (action) {
    case "register":
      return `${AUTH_PATH}/sign-up/email`
    case "login":
      return `${AUTH_PATH}/sign-in/email`
    case "session":
      return `${AUTH_PATH}/get-session`
    case "logout":
      return `${AUTH_PATH}/sign-out`
  }
}

/**
 * Forward a desktop/workspace account call to the cloud better-auth handler.
 * The handler signs `cloud.session_token`. This function does not hash passwords
 * or insert session rows itself.
 */
export async function callBetterAuth(
  handler: BetterAuthHandler,
  action: CloudAuthAction,
  incoming: { headers: Headers; body?: Record<string, unknown> },
): Promise<Response> {
  const url = new URL(cloudAuthPath(action), "http://127.0.0.1:8080")
  const headers = new Headers()
  const origin = incoming.headers.get("origin")
  if (origin) headers.set("origin", origin)
  const cookie = incoming.headers.get("cookie")
  if (cookie) headers.set("cookie", cookie)
  const method = action === "session" ? "GET" : "POST"
  if (method === "POST") headers.set("content-type", "application/json")
  return handler(
    new Request(url, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(incoming.body ?? {}) : undefined,
    }),
  )
}
