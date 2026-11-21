import { Hono } from "hono"
import { OpenAPIHono } from "@hono/zod-openapi"
import { logger } from "hono/logger"
import { compress } from "hono/compress"
import { secureHeaders } from "hono/secure-headers"
import { prettyJSON } from "hono/pretty-json"
import { cors } from "hono/cors"
import { timeout } from "hono/timeout"
import { csrf } from "hono/csrf"

import { auth } from "./lib/auth"
import { env } from "./lib/env"
import { AUTH_PATH } from "./lib/auth-path"

import health from "./routes/health"
import hello from "./routes/hello"
import generations from "./routes/generations"
import cloudAuth from "./routes/cloud-auth"

const app = new Hono()
const apiV1 = new OpenAPIHono()
const hasExplicitOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS.length > 0

app.use("*", timeout(5000))

app.use(logger())
app.use(compress())
app.use(secureHeaders())
app.use(prettyJSON())

app.use(
  `${AUTH_PATH}/*`,
  cors({
    origin: hasExplicitOrigins ? env.BETTER_AUTH_TRUSTED_ORIGINS : "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: hasExplicitOrigins,
  })
)

app.use(
  "/api/v1/*",
  cors({
    origin: hasExplicitOrigins ? env.BETTER_AUTH_TRUSTED_ORIGINS : "*",
    credentials: hasExplicitOrigins,
  })
)

apiV1.use(
  "*",
  csrf({
    origin: hasExplicitOrigins ? env.BETTER_AUTH_TRUSTED_ORIGINS : undefined,
  })
)

app.all(`${AUTH_PATH}/*`, (c) => auth.handler(c.req.raw))

apiV1.route("/health", health)
apiV1.route("/hello", hello)
apiV1.route("/generations", generations)
apiV1.route("/cloud", cloudAuth)

apiV1.doc("/open-api", {
  openapi: "3.0.0",
  info: {
    version: "0.1.0",
    title: "开镜 API",
    description: "薄云控制面：cloud 账户、积分和生成任务占位。平台运营登录在 apps/web，不共用这套 cookie。",
  },
})

app.route("/api/v1", apiV1)

export default app
