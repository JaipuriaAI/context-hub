#!/usr/bin/env node
// End-to-end check of the OAuth front door, the way ChatGPT / Gemini CLI use it.
//   npx wrangler dev --var API_KEY:test-owner-secret &
//   BASE=http://localhost:8787 OWNER_SECRET=test-owner-secret node scripts/e2e-oauth.mjs
import { createHash, randomBytes } from "node:crypto";

const BASE = (process.env.BASE ?? "http://localhost:8787").replace(/\/$/, "");
const SECRET = process.env.OWNER_SECRET ?? "test-owner-secret";
const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`);
  if (!ok) failed++;
};
const b64u = (b) => b.toString("base64url");
const noRedirect = { redirect: "manual" };
const cookiesFrom = (res) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

const MCP_HEADERS = (token, session) => ({
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  Authorization: `Bearer ${token}`,
  ...(session ? { "mcp-session-id": session } : {}),
});
const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "chatgpt", version: "1" },
  },
};

// 1. Unauthenticated /mcp -> 401 challenge pointing at resource metadata
let r = await fetch(`${BASE}/mcp`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  },
  body: JSON.stringify(INIT),
});
const challenge = r.headers.get("www-authenticate") ?? "";
check("unauthenticated /mcp -> 401", r.status === 401, r.status);
check(
  "401 carries resource_metadata",
  challenge.includes("resource_metadata="),
  challenge,
);

// 2. Discovery documents
r = await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`);
const prm = await r.json().catch(() => ({}));
check(
  "protected-resource metadata",
  r.status === 200 && prm.resource === `${BASE}/mcp`,
  JSON.stringify(prm),
);
r = await fetch(`${BASE}/.well-known/oauth-authorization-server`);
const as = await r.json().catch(() => ({}));
check(
  "authorization-server metadata",
  r.status === 200 &&
    as.registration_endpoint &&
    as.code_challenge_methods_supported?.includes("S256"),
  JSON.stringify(as),
);

// 3. Dynamic client registration (public client + PKCE, as ChatGPT does)
r = await fetch(as.registration_endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_name: "ChatGPT",
    redirect_uris: [REDIRECT],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }),
});
const client = await r.json();
check(
  "dynamic client registration",
  r.status === 201 && client.client_id,
  `${r.status} ${JSON.stringify(client)}`,
);

// 4. Authorize: login -> consent -> code
const verifier = b64u(randomBytes(32));
const challengeS256 = b64u(createHash("sha256").update(verifier).digest());
const state = b64u(randomBytes(8));
const authUrl = new URL(as.authorization_endpoint);
authUrl.search = new URLSearchParams({
  response_type: "code",
  client_id: client.client_id,
  redirect_uri: REDIRECT,
  code_challenge: challengeS256,
  code_challenge_method: "S256",
  state,
  resource: `${BASE}/mcp`,
}).toString();
const authPath = authUrl.pathname + authUrl.search;

r = await fetch(authUrl, noRedirect);
let page = await r.text();
check(
  "authorize without session shows owner sign-in",
  r.status === 200 && page.includes('name="passphrase"'),
  r.status,
);

r = await fetch(`${BASE}/authorize/login`, {
  method: "POST",
  ...noRedirect,
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ return_to: authPath, passphrase: "wrong" }),
});
check("wrong secret rejected (401)", r.status === 401, r.status);

r = await fetch(`${BASE}/authorize/login`, {
  method: "POST",
  ...noRedirect,
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    return_to: "https://evil.example/steal",
    passphrase: SECRET,
  }),
});
check(
  "login succeeds; off-site return_to neutralised",
  r.status === 303 && r.headers.get("location") === "/authorize",
  `${r.status} ${r.headers.get("location")}`,
);
const owner = cookiesFrom(r);
check(
  "owner session cookie is HttpOnly",
  r.headers.getSetCookie().some((c) => /HttpOnly/i.test(c)),
);

r = await fetch(authUrl, { ...noRedirect, headers: { Cookie: owner } });
page = await r.text();
const handle = /name="handle" value="([^"]+)"/.exec(page)?.[1];
check(
  "consent page rendered with handle",
  r.status === 200 && !!handle && page.includes("ChatGPT"),
  r.status,
);
check(
  "consent page not frameable",
  (r.headers.get("x-frame-options") ?? "").toUpperCase() === "DENY",
);
const consentCookies = [owner, cookiesFrom(r)].filter(Boolean).join("; ");

r = await fetch(`${BASE}/authorize`, {
  method: "POST",
  ...noRedirect,
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: consentCookies,
  },
  body: new URLSearchParams({ handle, decision: "approve" }),
});
const loc = new URL(r.headers.get("location") ?? "http://none");
const code = loc.searchParams.get("code");
check(
  "approve redirects to client with code + state",
  r.status === 302 &&
    loc.origin + loc.pathname === REDIRECT &&
    !!code &&
    loc.searchParams.get("state") === state,
  `${r.status} ${loc}`,
);

// 5. Token exchange (+ PKCE)
r = await fetch(as.token_endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code: code ?? "",
    redirect_uri: REDIRECT,
    client_id: client.client_id,
    code_verifier: verifier,
    resource: `${BASE}/mcp`,
  }),
});
const tok = await r.json();
check(
  "token exchange",
  r.status === 200 && tok.access_token && tok.refresh_token,
  `${r.status} ${JSON.stringify(tok)}`,
);

// 6. MCP with the OAuth token
r = await fetch(`${BASE}/mcp`, {
  method: "POST",
  headers: MCP_HEADERS(tok.access_token),
  body: JSON.stringify(INIT),
});
const initBody = await r.text();
const session = r.headers.get("mcp-session-id");
check(
  "MCP initialize with OAuth token",
  r.status === 200 && initBody.includes("serverInfo"),
  `${r.status} ${initBody.slice(0, 200)}`,
);
await fetch(`${BASE}/mcp`, {
  method: "POST",
  headers: MCP_HEADERS(tok.access_token, session),
  body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
});
r = await fetch(`${BASE}/mcp`, {
  method: "POST",
  headers: MCP_HEADERS(tok.access_token, session),
  body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
});
const toolsBody = await r.text();
check(
  "MCP tools/list returns tools",
  r.status === 200 && toolsBody.includes("save_memory"),
  `${r.status} ${toolsBody.slice(0, 200)}`,
);

// 7. Refresh
r = await fetch(as.token_endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tok.refresh_token,
    client_id: client.client_id,
  }),
});
const tok2 = await r.json();
check(
  "refresh_token grant",
  r.status === 200 && !!tok2.access_token,
  `${r.status} ${JSON.stringify(tok2)}`,
);

// 8. Static bearer (Claude Code / scripts) still works; garbage rejected
r = await fetch(`${BASE}/mcp`, {
  method: "POST",
  headers: MCP_HEADERS(SECRET),
  body: JSON.stringify(INIT),
});
check("static API_KEY bearer accepted", r.status === 200, r.status);
r = await fetch(`${BASE}/mcp`, {
  method: "POST",
  headers: MCP_HEADERS("not-a-token"),
  body: JSON.stringify(INIT),
});
check("invalid token -> 401", r.status === 401, r.status);

// 9. Deny path
const state2 = b64u(randomBytes(8));
const denyUrl = new URL(authUrl);
denyUrl.searchParams.set("state", state2);
r = await fetch(denyUrl, { ...noRedirect, headers: { Cookie: owner } });
const handle2 = /name="handle" value="([^"]+)"/.exec(await r.text())?.[1];
r = await fetch(`${BASE}/authorize`, {
  method: "POST",
  ...noRedirect,
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: [owner, cookiesFrom(r)].join("; "),
  },
  body: new URLSearchParams({ handle: handle2 ?? "", decision: "deny" }),
});
check(
  "deny redirects with access_denied",
  r.status === 302 &&
    (r.headers.get("location") ?? "").includes("error=access_denied"),
  `${r.status} ${r.headers.get("location")}`,
);

// 10. Brute-force limiter (run last: it locks this IP for 15 minutes)
let blocked = false;
for (let i = 0; i < 8 && !blocked; i++) {
  r = await fetch(`${BASE}/authorize/login`, {
    method: "POST",
    ...noRedirect,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      return_to: authPath,
      passphrase: `guess-${i}`,
    }),
  });
  blocked = r.status === 429;
}
check("repeated wrong secrets -> 429 lockout", blocked, r.status);

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
