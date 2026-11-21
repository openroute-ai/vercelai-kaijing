interface CookieAttributes {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  path?: string
  maxAge?: number
  domain?: string
}

const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' } as const

async function makeSignature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    ALGORITHM,
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(ALGORITHM.name, key, new TextEncoder().encode(value))
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

async function signCookieValue(value: string, secret: string): Promise<string> {
  const signature = await makeSignature(value, secret)
  return encodeURIComponent(`${value}.${signature}`)
}

function serializeCookie(name: string, value: string, attrs: CookieAttributes): string {
  let cookie = `${name}=${value}`
  if (typeof attrs.maxAge === 'number' && attrs.maxAge >= 0) {
    cookie += `; Max-Age=${Math.floor(attrs.maxAge)}`
  }
  if (attrs.path) cookie += `; Path=${attrs.path}`
  if (attrs.domain) cookie += `; Domain=${attrs.domain}`
  if (attrs.httpOnly) cookie += '; HttpOnly'
  if (attrs.secure) cookie += '; Secure'
  if (attrs.sameSite) cookie += `; SameSite=${attrs.sameSite}`
  return cookie
}

export const CLOUD_SESSION_COOKIE = 'cloud.session_token'

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}

/** 校验 `signSessionCookie` 写入的值，失败返回 null。 */
export async function unsignCookieValue(signed: string, secret: string): Promise<string | null> {
  let decoded = signed
  try {
    decoded = decodeURIComponent(signed)
  } catch {
    return null
  }
  const dot = decoded.lastIndexOf('.')
  if (dot <= 0) return null
  const value = decoded.slice(0, dot)
  const signature = decoded.slice(dot + 1)
  const expected = await makeSignature(value, secret)
  if (!safeEqual(signature, expected)) return null
  return value
}

export async function signSessionCookie(
  cookieName: string,
  token: string,
  secret: string,
  attributes: CookieAttributes,
): Promise<string> {
  const signedValue = await signCookieValue(token, secret)
  return serializeCookie(cookieName, signedValue, attributes)
}
