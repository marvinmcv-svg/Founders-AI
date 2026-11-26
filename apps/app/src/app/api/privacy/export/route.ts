import * as repo from "@founders/core/repo";
import { getCtx } from "@/lib/session";

/** Settings → Data & privacy → Export my data (plan 7.13). Portable JSON of the signed-in user's own data. */
export async function GET() {
  const ctx = await getCtx();
  const data = await repo.exportMyData(ctx);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="my-founders-data-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}
