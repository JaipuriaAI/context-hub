// ── OAUTH 2.1 FRONT DOOR ───────────────────────────────────────
// Makes /mcp connectable from ChatGPT, Gemini CLI, Claude.ai, Cursor and any
// other MCP client that speaks the MCP authorization spec (RFC 9728 discovery,
// RFC 7591 dynamic client registration, PKCE S256).
//
// Single-owner model: the hub belongs to one person. The only secret is
// `API_KEY`. It is (a) the passphrase typed on the /authorize page and
// (b) still accepted directly as `Authorization: Bearer <API_KEY>` so existing
// Claude Code / script setups keep working.
//
// Fails closed: with no API_KEY set, nobody can authorize and /mcp answers 401.

import {
  AuthorizationError,
  CimdFetchError,
  OAuthProvider,
  type ConsentDescription,
} from "@cloudflare/workers-oauth-provider";
import type { Env } from "./index";

const OWNER_USER_ID = "owner";
const SESSION_TTL_SECONDS = 8 * 60 * 60; // owner stays signed in on /authorize for 8h
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_SECONDS = 15 * 60;

type McpHandler = {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
};

// ── helpers ────────────────────────────────────────────────────

const enc = new TextEncoder();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(`context-hub-owner-session:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

function sessionCookieName(request: Request): string {
  return isSecure(request) ? "__Host-ch_owner" : "ch_owner";
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

async function hasOwnerSession(request: Request, env: Env): Promise<boolean> {
  if (!env.API_KEY) return false;
  const raw = readCookie(request, sessionCookieName(request));
  if (!raw) return false;
  const [exp, sig] = raw.split(".");
  const expNum = Number(exp);
  if (!sig || !Number.isFinite(expNum) || expNum < Date.now() / 1000)
    return false;
  return safeEqual(sig, await hmac(env.API_KEY, exp));
}

async function makeSessionCookie(request: Request, env: Env): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS);
  const sig = await hmac(env.API_KEY as string, exp);
  const secure = isSecure(request) ? "; Secure" : "";
  return `${sessionCookieName(request)}=${exp}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

async function loginBlocked(request: Request, env: Env): Promise<boolean> {
  const count = Number(
    (await env.OAUTH_KV.get(`rl:login:${clientIp(request)}`)) ?? 0,
  );
  return count >= LOGIN_MAX_FAILURES;
}

async function recordLoginFailure(request: Request, env: Env): Promise<void> {
  const key = `rl:login:${clientIp(request)}`;
  const count = Number((await env.OAUTH_KV.get(key)) ?? 0) + 1;
  await env.OAUTH_KV.put(key, String(count), {
    expirationTtl: LOGIN_WINDOW_SECONDS,
  });
}

async function clearLoginFailures(request: Request, env: Env): Promise<void> {
  await env.OAUTH_KV.delete(`rl:login:${clientIp(request)}`);
}

// ── pages ──────────────────────────────────────────────────────

const PAGE_STYLE = `
  :root{color-scheme:light dark}
  body{font:16px/1.5 system-ui,sans-serif;max-width:28rem;margin:10vh auto;padding:0 1rem}
  h1{font-size:1.25rem} input[type=password]{width:100%;padding:.6rem;font-size:1rem;box-sizing:border-box}
  button{padding:.6rem 1.1rem;font-size:1rem;cursor:pointer;margin-right:.5rem}
  .err{color:#b00020} .muted{opacity:.7;font-size:.9rem} code{word-break:break-all}
`;

function htmlResponse(body: string, status = 200, extra?: Headers): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  );
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Context Hub</title><style>${PAGE_STYLE}</style>${body}`,
    { status, headers },
  );
}

function loginPage(returnTo: string, error?: string, status = 200): Response {
  return htmlResponse(
    `<h1>Context Hub — owner sign-in</h1>
<p class="muted">Enter your hub secret (the <code>API_KEY</code> you set with <code>wrangler secret put</code>) to let an AI app connect.</p>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ""}
<form method="post" action="/authorize/login">
  <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
  <p><input type="password" name="passphrase" autocomplete="current-password" autofocus required></p>
  <p><button type="submit">Sign in</button></p>
</form>`,
    status,
  );
}

function consentPage(details: ConsentDescription, handle: string): string {
  const name = escapeHtml(details.clientName);
  const origin = details.clientDomain
    ? `Published by <strong>${escapeHtml(details.clientDomain)}</strong>.`
    : "This app registered itself; its name is not verified.";
  return `<h1>Allow ${name} to use your Context Hub?</h1>
<p>${origin} After you approve, access is sent to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? "<p><strong>This sends access to an app on this computer.</strong> Continue only if you just started connecting from it.</p>" : ""}
<p class="muted">It will be able to read and write all your memories, projects, instructions and identity.</p>
<form method="post" action="/authorize">
  <input type="hidden" name="handle" value="${escapeHtml(handle)}">
  <button name="decision" value="approve" type="submit">Allow</button>
  <button name="decision" value="deny" type="submit">Deny</button>
</form>`;
}

function textError(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// ── /authorize handler (the provider's defaultHandler) ─────────

function safeReturnTo(raw: string, request: Request): string {
  try {
    const u = new URL(raw, request.url);
    if (
      u.origin === new URL(request.url).origin &&
      u.pathname === "/authorize"
    ) {
      return u.pathname + u.search;
    }
  } catch {
    /* fall through */
  }
  return "/authorize";
}

async function handleAuthorizeRoutes(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const oauth = env.OAUTH_PROVIDER;

  if (!env.API_KEY) {
    return textError(
      "Context Hub has no owner secret configured, so no app can be authorized. Run `npx wrangler secret put API_KEY`, then try again.",
      503,
    );
  }

  try {
    if (url.pathname === "/authorize/login" && request.method === "POST") {
      const form = await request.formData();
      const returnTo = safeReturnTo(
        String(form.get("return_to") ?? ""),
        request,
      );
      if (await loginBlocked(request, env)) {
        return new Response(
          "Too many failed attempts. Try again in 15 minutes.",
          {
            status: 429,
            headers: {
              "Retry-After": String(LOGIN_WINDOW_SECONDS),
              "Content-Type": "text/plain",
            },
          },
        );
      }
      if (
        !(await safeEqual(String(form.get("passphrase") ?? ""), env.API_KEY))
      ) {
        await recordLoginFailure(request, env);
        return loginPage(returnTo, "Wrong secret.", 401);
      }
      await clearLoginFailures(request, env);
      return new Response(null, {
        status: 303,
        headers: {
          Location: returnTo,
          "Set-Cookie": await makeSessionCookie(request, env),
        },
      });
    }

    if (url.pathname === "/authorize" && request.method === "GET") {
      const authRequest = await oauth.parseAuthRequest(request); // validates client + redirect_uri + PKCE
      if (!(await hasOwnerSession(request, env))) {
        return loginPage(url.pathname + url.search);
      }
      const details = await oauth.describeConsent(authRequest);
      const consent = await oauth.beginConsent(authRequest);
      return htmlResponse(
        consentPage(details, consent.handle),
        200,
        consent.headers,
      );
    }

    if (url.pathname === "/authorize" && request.method === "POST") {
      if (!(await hasOwnerSession(request, env))) {
        return textError(
          "Owner session expired. Start the connection again from your AI app.",
          401,
        );
      }
      const form = await request.formData();
      const handle = String(form.get("handle") ?? "");
      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(request, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await oauth.approveConsent(request, handle);
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: OWNER_USER_ID,
        metadata: { approvedAt: new Date().toISOString() },
        scope: approved.request.scope,
        props: { userId: OWNER_USER_ID, via: "oauth" },
      });
      approved.headers.set("Location", redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }
  } catch (error) {
    // Redirect back to the client only when the library has validated its redirect URI.
    if (error instanceof AuthorizationError && error.redirectTo) {
      return Response.redirect(error.redirectTo, 302);
    }
    if (error instanceof AuthorizationError) {
      return textError(`Authorization failed: ${error.description}`, 400);
    }
    if (error instanceof CimdFetchError) {
      return textError("This app could not be verified.", 400);
    }
    throw error;
  }

  return textError("Not found", 404);
}

// ── provider factory ───────────────────────────────────────────
// The OAuth issuer/resource URLs must be absolute and match where the Worker is
// reached (workers.dev subdomain, custom domain, or localhost in dev). They are
// derived from the incoming request once per origin, so the template needs no
// per-deployment URL configuration. Set PUBLIC_URL to pin a custom domain.

const providers = new Map<string, OAuthProvider<Env>>();

function canonicalOrigin(request: Request, env: Env): string {
  const base = env.PUBLIC_URL ? new URL(env.PUBLIC_URL) : new URL(request.url);
  return base.origin.toLowerCase();
}

export function getAuthedHandler(
  request: Request,
  env: Env,
  mcp: McpHandler,
): OAuthProvider<Env> {
  const origin = canonicalOrigin(request, env);
  let provider = providers.get(origin);
  if (!provider) {
    const resource = `${origin}/mcp`;
    provider = new OAuthProvider<Env>({
      apiHandlers: { "/mcp": mcp },
      defaultHandler: { fetch: (req, e) => handleAuthorizeRoutes(req, e) },
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
      resourceMetadata: {
        resource,
        authorization_servers: [origin],
        resource_name: "Context Hub",
      },
      accessTokenTTL: 60 * 60,
      refreshTokenTTL: 30 * 24 * 60 * 60,
      allowPrivateUseRedirectUris: true, // native apps such as Cursor (cursor://…)
      // Static bearer: `Authorization: Bearer <API_KEY>` keeps Claude Code & scripts working.
      resolveExternalToken: async ({ token, env: e }) => {
        if (e.API_KEY && (await safeEqual(token, e.API_KEY))) {
          return {
            props: { userId: OWNER_USER_ID, via: "api-key" },
            audience: resource,
          };
        }
        return null;
      },
    });
    providers.set(origin, provider);
  }
  return provider;
}
