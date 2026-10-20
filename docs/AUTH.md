# Authentication (OAuth 2.1)

Context Hub's `/mcp` endpoint requires a token. Clients get one in either of two ways:

| Client                                                                                      | How it authenticates                                                                                                          |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT (custom MCP server / connector), Gemini CLI, Claude.ai, Cursor, any MCP-spec client | OAuth 2.1 with PKCE. The client discovers everything from `/mcp`, registers itself, and sends you to `/authorize` to approve. |
| Claude Code, scripts                                                                        | `Authorization: Bearer <API_KEY>` (unchanged from before).                                                                    |

## One-time setup

```bash
npx wrangler secret put API_KEY      # your owner secret: pick a long random string
npm run deploy                       # the OAUTH_KV namespace is auto-provisioned on first deploy
```

`API_KEY` is the only secret. It is the passphrase you type on the `/authorize` page **and** the static bearer token.
If it is not set, the hub is locked: `/mcp` answers `401` and `/authorize` refuses.
To rotate it, run `wrangler secret put API_KEY` again: all owner sign-in sessions end, and bearer clients must use the new value.
(Tokens already issued through OAuth keep working until they expire or you revoke them. To cut them off immediately, delete the keys in the `OAUTH_KV` namespace.)

## Connecting ChatGPT

ChatGPT → Settings → Apps / Connectors → create a custom MCP server:

- **Server URL:** `https://<your-worker>.workers.dev/mcp`
- **Authentication:** OAuth (leave Advanced OAuth settings as discovered; client registration is automatic)

ChatGPT opens `/authorize` in a browser. Enter your owner secret, then press **Allow**.

## Connecting Gemini

Gemini CLI supports remote MCP with OAuth discovery: add the server to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "context-hub": { "httpUrl": "https://<your-worker>.workers.dev/mcp" }
  }
}
```

then run `/mcp auth context-hub` in the CLI. The Gemini consumer web app does not currently accept custom MCP servers, so it cannot connect.

## Behaviour and defaults

- Access tokens last 1 hour; refresh tokens 30 days.
- Dynamically registered clients expire after 90 days (the library default); apps simply re-register.
- After you sign in on `/authorize`, that browser stays signed in for 8 hours (HttpOnly cookie signed with your secret).
- 5 wrong secrets from one IP lock sign-in for 15 minutes.
- The consent page shows the app's name and where access will be sent. A dynamically registered app's name is self-asserted, so check the redirect host (for ChatGPT: `chatgpt.com`).
- Set `PUBLIC_URL` (a Worker variable) only if you serve the hub from a custom domain and need to pin the public origin.
- Every approved app can read and write all your memories. Approve only apps you trust.

## Verifying a deployment

```bash
BASE=https://<your-worker>.workers.dev OWNER_SECRET=<your API_KEY> node scripts/e2e-oauth.mjs
```

The script walks the full flow (discovery, registration, sign-in, consent, token, refresh, MCP calls). It ends by deliberately locking its own IP out of sign-in for 15 minutes, so run it against a local `wrangler dev` unless you can wait.
