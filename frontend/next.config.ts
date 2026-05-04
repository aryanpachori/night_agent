import type { NextConfig } from "next";

const rawBackendApiUrl = process.env.BACKEND_API_URL?.trim();
const backendApiUrl = rawBackendApiUrl
  ?.replace(/\/+$/, "")
  .replace(/\/api$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    if (!backendApiUrl) return [];

    return [
      {
        source: "/api/:path*",
        destination: `${backendApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
