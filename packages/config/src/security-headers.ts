/**
 * HTTP security headers for both Next.js apps (plan 14.4: CSP headers, HSTS).
 * Next.js injects inline bootstrap scripts, so script-src keeps 'unsafe-inline' (no nonces on
 * statically rendered pages); everything else is same-origin. Dev adds 'unsafe-eval' for HMR.
 */
export type HeaderPair = { key: string; value: string };

export function securityHeaders(opts: { dev: boolean; connect?: string[]; frameAncestors?: string }): HeaderPair[] {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${opts.dev ? " ws: http://localhost:*" : ""}${opts.connect?.length ? ` ${opts.connect.join(" ")}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${opts.frameAncestors ?? "'self'"}`,
    ...(opts.dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    ...(opts.dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
  ];
}
