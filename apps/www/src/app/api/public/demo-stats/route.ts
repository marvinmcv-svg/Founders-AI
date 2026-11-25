import { NextResponse } from "next/server";

export const revalidate = 60;

/**
 * Demo-pill counter (plan 5.4). Reads the booking provider when configured (Cal.com, H3).
 * Returns null — and the pill hides the line — rather than a made-up number.
 */
export async function GET() {
  const key = process.env.CALCOM_API_KEY;
  if (!key) return NextResponse.json({ bookedToday: null });
  try {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const r = await fetch(`https://api.cal.com/v2/bookings?afterStart=${start.toISOString()}&status=upcoming`, {
      headers: { Authorization: `Bearer ${key}`, "cal-api-version": "2024-08-13" },
      next: { revalidate: 60 },
    });
    if (!r.ok) return NextResponse.json({ bookedToday: null });
    const d = (await r.json()) as { data?: unknown[] };
    return NextResponse.json({ bookedToday: Array.isArray(d.data) && d.data.length > 0 ? d.data.length : null });
  } catch {
    return NextResponse.json({ bookedToday: null });
  }
}
