/**
 * Secrets at rest (integration webhooks, later CRM tokens): AES-256-GCM.
 * Key = INTEGRATIONS_ENCRYPTION_KEY (32-byte base64) or, if unset, HKDF(BETTER_AUTH_SECRET).
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function key(): Buffer {
  const explicit = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (explicit) {
    const k = Buffer.from(explicit, "base64");
    if (k.length !== 32) throw new Error("INTEGRATIONS_ENCRYPTION_KEY must be 32 bytes (base64)");
    return k;
  }
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Set INTEGRATIONS_ENCRYPTION_KEY or BETTER_AUTH_SECRET to store integration secrets");
  return Buffer.from(hkdfSync("sha256", secret, "founders-ai", "integrations-v1", 32));
}

/** Returns `v1.<iv>.<tag>.<ciphertext>` (base64url parts). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(token: string): string {
  const [v, iv, tag, ct] = token.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

/** For display: keep scheme + host, mask the path (webhook URLs are bearer secrets). */
export function maskUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}/…${u.pathname.slice(-4)}`;
  } catch {
    return "…";
  }
}
