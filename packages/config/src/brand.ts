/**
 * Brand and environment values (plan 0D). Never inline these elsewhere.
 * Next.js apps inline BRAND_* at build time via `env` in next.config.
 */
const domain = process.env.BRAND_DOMAIN ?? "foundersscz.com";

export const brand = {
  name: process.env.BRAND_NAME ?? "Founders AI",
  shortName: "Founders",
  legalEntity: process.env.BRAND_LEGAL_ENTITY ?? "Founders SCZ",
  domain,
  urls: {
    www: process.env.NEXT_PUBLIC_WWW_URL ?? `https://www.${domain}`,
    app: process.env.NEXT_PUBLIC_APP_URL ?? `https://app.${domain}`,
    api: `https://api.${domain}`,
    mcp: `https://mcp.${domain}/mcp`,
    academy: "https://academy.foundersscz.com",
  },
  social: {
    instagram: "https://www.instagram.com/founders.scz/",
    linkedin: "",
    x: "",
  },
  /** Real people with written consent only (plan Rule 3). Empty until H1/H4. */
  salesReps: [] as { name: string; avatarUrl: string }[],
} as const;

export type Brand = typeof brand;
