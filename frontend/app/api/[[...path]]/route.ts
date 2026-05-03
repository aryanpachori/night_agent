import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

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
    const e = err as NodeJS.ErrnoException
    console.error("[api proxy] fetch failed", target.toString(), err)
    return NextResponse.json(
      {
        error: "Upstream unavailable",
        /** e.g. ECONNREFUSED = nothing listening or security group blocks Vercel → EC2 */
        code: e?.code ?? "UNKNOWN",
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
