import type { NextConfig } from "next";
import { securityHeaders } from "@founders/config/security-headers";
import { config } from "dotenv";
config({ path: "../../.env" });

const nextConfig: NextConfig = {
  transpilePackages: ["@founders/ui", "@founders/core", "@founders/config", "@founders/db", "@founders/seed", "@founders/api", "@founders/pipelines", "@founders/agent", "@founders/mcp", "@founders/integrations"],
  env: {
    BRAND_NAME: process.env.BRAND_NAME ?? "Founders AI",
    BRAND_DOMAIN: process.env.BRAND_DOMAIN ?? "foundersscz.com",
    BRAND_LEGAL_ENTITY: process.env.BRAND_LEGAL_ENTITY ?? "Founders SCZ",
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
    NEXT_PUBLIC_WWW_URL: process.env.NEXT_PUBLIC_WWW_URL ?? "http://localhost:3000",
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({ dev: process.env.NODE_ENV !== "production" }),
      },
    ];
  },
};
export default nextConfig;
