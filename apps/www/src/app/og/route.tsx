import { ImageResponse } from "next/og";

export const runtime = "edge";

/** Branded Open Graph image: /og?title=…&kicker=… (plan 17 launch kit, 1200×630). */
export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") ?? "Founders AI").slice(0, 110);
  const kicker = (searchParams.get("kicker") ?? "Founders AI").slice(0, 60);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0a0a0a", padding: "72px 80px", color: "#f5f5f5", position: "relative" }}>
        <div style={{ position: "absolute", top: -260, left: 220, width: 900, height: 600, borderRadius: 9999, background: "radial-gradient(circle, rgba(216,255,74,0.26) 0%, rgba(216,255,74,0.08) 45%, rgba(10,10,10,0) 70%)", display: "flex" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "#121212", border: "1px solid rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "#d8ff4a", fontSize: 34, fontWeight: 700 }}>F.</div>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 8, textTransform: "uppercase" }}>
            Founders<span style={{ color: "#d8ff4a", marginLeft: 14, letterSpacing: 2 }}>AI</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", color: "#d8ff4a", fontSize: 24, letterSpacing: 5, textTransform: "uppercase" }}>{kicker}</div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2, maxWidth: 1000 }}>{title}</div>
        </div>
        <div style={{ display: "flex", color: "#a3a3a3", fontSize: 24 }}>Built in Santa Cruz, Bolivia</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
