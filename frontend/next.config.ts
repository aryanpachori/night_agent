import type { NextConfig } from "next";

const backend =
  process.env.BACKEND_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "http://127.0.0.1:4000"

if (process.env.VERCEL) {
  const u = process.env.NEXT_PUBLIC_API_URL?.trim()
  const b = process.env.BACKEND_URL?.trim()
  console.log(
    `[vercel build] client API base: ${u ? `NEXT_PUBLIC_API_URL → ${u}` : "unset → same-origin /api/* (use BACKEND_URL for rewrites)"}`,
  )
  console.log(
    `[vercel build] rewrite /api/* → ${backend.replace(/\/$/, "")}/api/*`,
  )
  if (!u && !b) {
    console.warn(
      "[vercel build] Set BACKEND_URL (recommended) or NEXT_PUBLIC_API_URL so /api rewrites can reach your Express server.",
    )
  }
}

const nextConfig: NextConfig = {
  // `VERCEL` is not inlined into client bundles; this is, so `lib/api.ts` can use
  // same-origin `/api/*` on Vercel while rewrites proxy to BACKEND_URL.
  env: {
    NEXT_PUBLIC_VERCEL_DEPLOY: process.env.VERCEL ? "1" : "",
  },
  async rewrites() {
    const base = backend.replace(/\/$/, "")
    return [{ source: "/api/:path*", destination: `${base}/api/:path*` }]
  },
}

export default nextConfig
