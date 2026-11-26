import type { NextConfig } from "next";
import { config } from "dotenv";
config({ path: "../../.env" });

const nextConfig: NextConfig = {
  transpilePackages: ["@founders/ui", "@founders/mocks", "@founders/core", "@founders/config", "@founders/db"],
  env: {
    BRAND_NAME: process.env.BRAND_NAME ?? "Founders AI",
    BRAND_DOMAIN: process.env.BRAND_DOMAIN ?? "foundersscz.com",
    BRAND_LEGAL_ENTITY: process.env.BRAND_LEGAL_ENTITY ?? "Founders SCZ",
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
    NEXT_PUBLIC_WWW_URL: process.env.NEXT_PUBLIC_WWW_URL ?? "http://localhost:3000",
  },
  poweredByHeader: false,
  // Blog Markdown is read with fs at build and on ISR revalidation; ship it with the functions.
  outputFileTracingIncludes: { "/*": ["../../content/blog/**/*", "../../content/comparisons/**/*"] },
  async redirects() {
    return [
      { source: "/soon/talent-signals", destination: "/signals/talent", permanent: true },
      { source: "/soon/news", destination: "/news", permanent: true },
      { source: "/soon/revenue-valuation", destination: "/revenue-valuation", permanent: true },
      { source: "/soon/agents", destination: "/agents", permanent: true },
      { source: "/soon/mcp", destination: "/mcp", permanent: true },
      { source: "/soon/blog", destination: "/blog", permanent: true },
      { source: "/soon/insights", destination: "/insights", permanent: true },
      { source: "/soon/careers", destination: "/careers", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
export default nextConfig;
