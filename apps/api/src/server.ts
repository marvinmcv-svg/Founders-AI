/** Standalone Node server for the API (Docker image for Railway/Fly — plan 0A). */
import "@founders/db/env";
import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.API_PORT ?? 4000);
serve({ fetch: app.fetch, port });
console.log(`API listening on http://localhost:${port}/api/v1`);
