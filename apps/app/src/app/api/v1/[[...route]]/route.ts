import { app } from "@founders/api";

/** Public REST API (Hono) mounted at /api/v1 — plan 0A. */
export const runtime = "nodejs";
const handler = (req: Request) => app.fetch(req);
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE, handler as OPTIONS };
