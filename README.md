# CapHub Studio

A standalone, self-hosted take on GoHighLevel's AI Studio and Agent Studio:

- **Site Builder** — describe a website, landing page, funnel step, booking page or form; AI builds it. Keep chatting to change it, edit the code directly, roll back versions, publish to a URL, and collect form submissions.
- **Agent Studio** — create AI chat agents with instructions, guardrails and a knowledge base; test them in a playground; turn on an embeddable chat widget for your CapHub sites or any website; review conversations.
- **Switchable AI providers** — Anthropic (Claude) or OpenAI. The admin picks the active provider and model in **Settings → AI Providers** and can switch at any time. Individual agents can be pinned to a specific provider/model.

## Quick start (macOS)

```zsh
# Node 20+ (Homebrew)
brew install node

git clone https://github.com/jimmycarrasco-stack/CapHub-Studio.git
cd CapHub-Studio
npm install
npm run setup        # creates .env.local with a generated APP_SECRET and admin password (prints it once)
npm run dev          # http://localhost:3000
```

Sign in with the password `npm run setup` printed, open **AI Providers**, paste an Anthropic and/or OpenAI API key, choose the active provider, and click **Test connection**.

Production:

```zsh
npm run build && npm start
```

## Configuration

All settings live in `.env.local` (see `.env.example`). Never commit it — it's in `.gitignore`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `ADMIN_PASSWORD` | yes | Admin login password |
| `APP_SECRET` | yes | 32+ chars. Signs sessions and encrypts API keys saved in Settings. Changing it logs you out and makes stored keys unreadable (re-enter them). |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | no | Fallback keys. Keys saved in Settings take priority. |
| `PUBLIC_BASE_URL` | recommended in prod | Public URL used in published pages and widget embed snippets, e.g. `https://studio.example.com` |
| `DATABASE_PATH` | no | SQLite file (default `./data/caphub.db`) |

### Switching providers

- **Settings → AI Providers**: pick the active provider (used by the Site Builder and by any agent set to "Use active provider"), set the model ID per provider, save/replace/remove keys, and test each connection.
- Keys entered in the UI are encrypted with AES-256-GCM (key derived from `APP_SECRET`) before being written to SQLite, and only the last 4 characters are ever sent back to the browser.
- **Agent → Configure → Model** overrides the provider, model and temperature for one agent.

Default models: `claude-sonnet-5-5` and `gpt-5.5`. Any model ID your account can access works.

## How it works

```
src/
  proxy.ts                 Auth gate for all admin pages/APIs (Next 16 "proxy", formerly middleware)
  lib/llm/                 Provider layer: one interface, Anthropic Messages API + OpenAI Responses API, streaming
  lib/settings.ts          Active provider, models, encrypted keys (env fallback)
  lib/site-builder.ts      Generation prompt, response parsing, runtime injection
  lib/knowledge.ts         Chunking + BM25 retrieval (provider-independent, no embeddings needed)
  lib/agent-chat.ts        One agent turn: retrieve → prompt → provider → persist
  lib/db.ts, lib/repo.ts   SQLite schema/migrations and queries
  app/(studio)/            Admin UI: dashboard, sites, site editor, agents, agent editor, settings
  app/api/                 Admin JSON APIs (session required)
  app/api/public/          Form capture + widget chat (CORS, rate limited)
  app/p/[slug]/            Published pages
public/
  caphub-runtime.js        Injected into published pages: captures <form> submissions
  widget.js                Embeddable chat widget (Shadow DOM, text-only rendering)
```

**Site generation** streams the model's output to the editor (NDJSON), extracts the complete HTML document, and saves every generation, manual code edit and restore as a version (last 50 kept).

**Published pages** are served at `/p/<slug>` with a `Content-Security-Policy: sandbox` header, so scripts in generated pages run in an isolated origin and can't make authenticated calls to the admin app. The editor preview uses a sandboxed iframe for the same reason.

**Forms** need no setup: the runtime intercepts any `<form>` on a published page, posts it to `/api/public/forms/<siteId>`, and shows a thank-you message. Submissions appear in the site's **Submissions** tab with CSV export (formula-injection safe). A hidden honeypot field filters simple bots.

**Agents** get their knowledge base included in full when it's small (≤12k characters) and via BM25 retrieval when it's larger. Knowledge is framed as reference data, not instructions.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (providers with fake clients, settings/repo on in-memory SQLite, parsing, retrieval, security) |

## Security notes

- Single admin account; session is an HMAC-signed, httpOnly, SameSite=Lax cookie (7 days). Login is rate limited.
- Public endpoints (`/api/public/*`) are rate limited per IP, and widget chat is also capped per agent per hour to protect your API bill. The widget only works for agents with **Public chat widget** turned on.
- Rate limits are in-memory, so they reset on restart and aren't shared across multiple server instances.

## Deploying

SQLite + in-memory rate limiting means this MVP is designed for **one server instance with a persistent disk** (a VPS, Fly.io/Render with a volume, a Mac mini, Docker with a mounted `data/` volume). It is not suited to serverless platforms with ephemeral filesystems. Set `PUBLIC_BASE_URL`, put it behind HTTPS, and back up `data/caphub.db`.

## Not included yet (vs GoHighLevel)

Custom domains, multi-page sites, multi-user/sub-accounts, CRM contacts/pipelines, calendars with real availability, SMS/email/voice channels, workflow automations, and agent actions (tool calls such as booking or tagging contacts). The provider layer and data model are set up so these can be added incrementally.
