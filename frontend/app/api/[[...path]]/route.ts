import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

/**
 * Same-origin BFF: `POST https://<vercel>/api/auth/wallet` →
 * `POST ${BACKEND_URL}/api/auth/wallet` (e.g. `http://52.66.114.179:4000/api/auth/wallet`).
 * Set `BACKEND_URL` on Vercel (no trailing slash). Laptop→EC2 working does not imply
 * Vercel→EC2 works until the EC2 security group allows public inbound on the API port.
 */

/** Node fetch needs this when forwarding a streamed request body. */
type FetchWithDuplex = RequestInit & { duplex?: "half" }

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
])

function backendBase(): string {
  const u =
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://127.0.0.1:4000"
  return u.replace(/\/$/, "")
}

function targetUrl(req: NextRequest, segments: string[]): URL {
  const sub = segments.length ? segments.join("/") : ""
  const path = sub ? `/api/${sub}` : "/api"
  return new URL(`${backendBase()}${path}${req.nextUrl.search}`)
}

/** Undici/wrapped errors often omit `.code` on the top object — walk `cause` / AggregateError. */
function describeUpstreamFailure(err: unknown): {
  code: string
  message: string
  errno?: number
} {
  const pickCode = (x: unknown): string | undefined => {
    if (x == null || typeof x !== "object") return undefined
    const o = x as NodeJS.ErrnoException & {
      cause?: unknown
      errors?: unknown[]
    }
    if (typeof o.code === "string" && o.code.length > 0) return o.code
    if (o.cause !== undefined) return pickCode(o.cause)
    if (Array.isArray(o.errors)) {
      for (const e of o.errors) {
        const c = pickCode(e)
        if (c) return c
      }
    }
    return undefined
  }

  let code = pickCode(err) ?? "UNKNOWN"
  let message = ""
  let errno: number | undefined

  if (err instanceof Error) {
    message = err.message
    if (code === "UNKNOWN" && err.name) code = err.name
  } else {
    message = String(err)
  }

  if (err && typeof err === "object" && "errno" in err) {
    const n = Number((err as NodeJS.ErrnoException).errno)
    if (!Number.isNaN(n)) errno = n
  }

  return { code, message: message.slice(0, 500), ...(errno !== undefined ? { errno } : {}) }
}

async function proxy(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const target = targetUrl(req, segments)
  const headers = new Headers()
  req.headers.forEach((value, key) => {
    const k = key.toLowerCase()
    if (HOP_BY_HOP.has(k) || k === "host") return
    headers.set(key, value)
  })

  const init: FetchWithDuplex = {
    method: req.method,
    headers,
    redirect: "manual",
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body
    init.duplex = "half"
  }

  let upstream: Response
  try {
    upstream = await fetch(target, init)
  } catch (err) {
    const diag = describeUpstreamFailure(err)
    console.error("[api proxy] fetch failed", target.toString(), diag, err)
    return NextResponse.json(
      {
        error: "Upstream unavailable",
        ...diag,
        /** Confirms which host `BACKEND_URL` / fallback resolved to at runtime */
        origin: target.origin,
        path: `${target.pathname}${target.search}`,
      },
      { status: 502 },
    )
  }

  const out = new Headers(upstream.headers)
  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  })
}

type RouteCtx = { params: Promise<{ path?: string[] }> }

async function handle(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const { path } = await ctx.params
  return proxy(req, path ?? [])
}

export const GET = (req: NextRequest, ctx: RouteCtx) => handle(req, ctx)
export const HEAD = (req: NextRequest, ctx: RouteCtx) => handle(req, ctx)
export const POST = (req: NextRequest, ctx: RouteCtx) => handle(req, ctx)
export const PUT = (req: NextRequest, ctx: RouteCtx) => handle(req, ctx)
export const PATCH = (req: NextRequest, ctx: RouteCtx) => handle(req, ctx)
export const DELETE = (req: NextRequest, ctx: RouteCtx) => handle(req, ctx)
export const OPTIONS = (req: NextRequest, ctx: RouteCtx) => handle(req, ctx)
