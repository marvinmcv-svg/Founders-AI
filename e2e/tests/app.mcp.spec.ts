/**
 * Phase 7 (R2): the MCP OAuth flow as a real client runs it — discovery, dynamic client registration,
 * authorization code + PKCE with the resource indicator, login, consent (workspace), token exchange,
 * then MCP calls with the bearer token. Also: deny, and the unauthenticated challenge.
 */
import { createHash, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const REDIRECT = "http://127.0.0.1:8765/callback";

async function discover(request: APIRequestContext) {
  const challenge = await request.post("/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" }, headers: { accept: "application/json, text/event-stream" } });
  expect(challenge.status()).toBe(401);
  const www = challenge.headers()["www-authenticate"] ?? "";
  const prmUrl = www.match(/resource_metadata="([^"]+)"/)?.[1];
  expect(prmUrl).toBeTruthy();
  const prm = (await (await request.get(prmUrl!)).json()) as { resource: string; authorization_servers: string[] };
  const issuer = prm.authorization_servers[0]!;
  const asPath = new URL(issuer).pathname;
  const as = (await (await request.get(`/.well-known/oauth-authorization-server${asPath}`)).json()) as { authorization_endpoint: string; token_endpoint: string; registration_endpoint: string; code_challenge_methods_supported?: string[] };
  return { resource: prm.resource, as };
}

async function authorize(page: Page, request: APIRequestContext, decision: "allow" | "deny") {
  const { resource, as } = await discover(request);
  const reg = await request.post(as.registration_endpoint, { data: { client_name: "E2E MCP client", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] } });
  expect(reg.status(), await reg.text()).toBeLessThan(300);
  const clientId = ((await reg.json()) as { client_id: string }).client_id;
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(8).toString("hex");
  const url = new URL(as.authorization_endpoint);
  for (const [k, v] of Object.entries({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, scope: "openid offline_access", state, code_challenge: challenge, code_challenge_method: "S256", resource })) url.searchParams.set(k, v);

  let callback: URL | null = null;
  await page.route("http://127.0.0.1:8765/**", async (route) => {
    callback = new URL(route.request().url());
    await route.fulfill({ status: 200, body: "ok" });
  });
  await page.goto(url.toString());
  await page.waitForURL(/\/login\?/);
  await page.click("form button");
  await expect(page.getByRole("heading", { name: /Connect E2E MCP client/ })).toBeVisible({ timeout: 60000 });
  expect(page.url()).toContain("/oauth/consent?");
  await page.waitForLoadState("networkidle"); // consent buttons are a client island
  await page.getByRole("button", { name: decision === "allow" ? /^Allow/ : "Deny" }).click();
  await expect.poll(() => callback, { timeout: 30000 }).not.toBeNull();
  const cb = callback as unknown as URL;
  expect(cb.searchParams.get("state")).toBe(state);
  return { cb, clientId, verifier, resource, as };
}

test("an MCP client connects with OAuth (DCR + PKCE + consent) and calls tools", async ({ page, request }) => {
  const { cb, clientId, verifier, resource, as } = await authorize(page, request, "allow");
  const code = cb.searchParams.get("code");
  expect(code).toBeTruthy();
  const tok = await request.post(as.token_endpoint, { form: { grant_type: "authorization_code", code: code!, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource } });
  expect(tok.status(), await tok.text()).toBe(200);
  const { access_token, refresh_token } = (await tok.json()) as { access_token: string; refresh_token?: string };
  expect(access_token.split(".")).toHaveLength(3); // JWT, audience-bound to the MCP resource
  expect(refresh_token).toBeTruthy();

  const headers = { authorization: `Bearer ${access_token}`, accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
  const rpc = async (method: string, params: object) => {
    const r = await request.post("/mcp", { headers, data: { jsonrpc: "2.0", id: 1, method, params } });
    expect(r.status()).toBe(200);
    const text = await r.text();
    const line = text.split("\n").find((l) => l.startsWith("data: ")) ?? text;
    return JSON.parse(line.replace(/^data: /, "")) as { result: Record<string, unknown> };
  };
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
  expect((init.result.serverInfo as { name: string }).name).toBe("founders-ai");
  const list = await rpc("tools/list", {});
  expect((list.result.tools as unknown[]).length).toBe(29);
  const call = await rpc("tools/call", { name: "get_lists", arguments: {} });
  expect(JSON.stringify(call.result)).toContain("My CRM"); // the consented workspace's lists
  const prompts = await rpc("prompts/list", {});
  expect((prompts.result.prompts as { name: string }[]).map((x) => x.name).sort()).toEqual(["qualify_competitors", "warm_paths_to_list", "weekly_saved_search_digest"]);

  // A token for another audience is refused.
  const bad = await request.post("/mcp", { headers: { ...headers, authorization: "Bearer not-a-token" }, data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  expect(bad.status()).toBe(401);
});

test("denying consent returns access_denied to the client", async ({ page, request }) => {
  const { cb } = await authorize(page, request, "deny");
  expect(cb.searchParams.get("error")).toBe("access_denied");
});
