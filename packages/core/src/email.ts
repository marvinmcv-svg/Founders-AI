/**
 * Transactional email (DSAR verification, export delivery). Resend when RESEND_API_KEY is set (H3);
 * otherwise nothing is sent and the caller records that, so an operator can follow up by hand.
 */
import { brand } from "@founders/config";

export type EmailResult = { sent: true; id: string | null } | { sent: false; reason: string };

export async function sendEmail(input: { to: string; subject: string; html: string; from?: string }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set (H3)" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: input.from ?? `${brand.name} <privacy@${brand.domain}>`, to: input.to, subject: input.subject, html: input.html }),
    });
    if (!res.ok) return { sent: false, reason: `Resend ${res.status}` };
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: j.id ?? null };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
