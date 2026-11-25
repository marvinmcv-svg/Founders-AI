import type { NextConfig } from "next";
import { config } from "dotenv";
config({ path: "../../.env" });

const nextConfig: NextConfig = {
  transpilePackages: ["@founders/ui", "@founders/core", "@founders/config", "@founders/db"],
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
