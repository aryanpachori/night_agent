import type { NextConfig } from "next";

if (process.env.VERCEL) {
  const u = process.env.NEXT_PUBLIC_API_URL?.trim()
  console.log(
    `[vercel build] NEXT_PUBLIC_API_URL ${u ? `→ ${u}` : "MISSING — client bundle will use http://localhost:4000"}`,
  );
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
