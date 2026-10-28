# CapHub Studio

A simpler, self-hosted GoHighLevel-style CRM with an AI studio built in:

- **Agency + sub-accounts** — one agency, many client sub-accounts. Each sub-account has its own contacts, pipelines, Stripe account, email settings, sites, funnels, apps, agents and team. Agency admins see everything; sub-account users only see the accounts they're added to.
- **Contacts** — search, tags, custom fields, notes timeline, tasks, deals, payments, email history, automation runs, do-not-contact, CSV import/export.
- **Pipelines** — drag-and-drop deal boards with editable stages, deal values, won/lost.
- **Payments & products** — one-time and subscription products synced to the sub-account's Stripe; hosted payment links (`/pay/<id>`) and AI-built "Buy now" buttons on sites; orders and revenue; webhook for renewals and refunds.
- **Automations** — trigger (contact created, tag added, form submitted, deal stage/status, payment, inbound webhook, manual) → steps (email incl. AI-written, notify team, tags, create/move deal, task, wait, condition, outbound webhook). Run logs per automation and per contact.
- **Email** — send from the sub-account's own SMTP (Gmail, Microsoft 365, SendGrid, Resend, Mailgun…); every email is logged under Conversations.
- **Funnels** — chain Site Builder pages; form submits move visitors to the next step and create/update the contact.
- **AI Guide** — a chat drawer on every page that explains the app and does setup work for you (contacts, tags, notes, tasks, pipelines, deals, products, automations, sites, funnels). It can't delete anything or send emails, and automations it builds are saved switched off for review.

And the original studio:

- **Site Builder** — describe a website, landing page, funnel step, booking page or form; AI builds it. Keep chatting to change it, edit the code directly, roll back versions, publish to a URL, and collect form submissions.
- **Agent Studio** — create AI chat agents with instructions, guardrails and a knowledge base; test them in a playground; turn on an embeddable chat widget for your CapHub sites or any website; review conversations.
- **App Builder** — describe a full-stack web app; an AI coding agent writes a Next.js + Postgres project (with sign-up/login, user/admin roles and an admin panel built in), runs it in an isolated Docker container, checks its own work, and keeps iterating with you. Live preview, code editor, logs, versions, zip download and push to GitHub.
- **Switchable AI providers** — Anthropic (Claude) or OpenAI. The admin picks the active provider and model in **Settings → AI Providers** and can switch at any time. Individual agents can be pinned to a specific provider/model. (This is agency-wide: **Settings → AI & runtime**.)

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

Open the app: the first visit goes to **/setup**, where you create the agency owner account. The "setup key" is the `ADMIN_PASSWORD` that `npm run setup` printed (it's in `.env.local`). Then open **Settings → AI & runtime**, paste an Anthropic and/or OpenAI API key, choose the active provider, and click **Test connection**.

Upgrading an existing install: the database migrates automatically on start, and all existing sites, agents and apps move into a sub-account called **Main account**. Visit `/setup` once to create the owner login.

Production:

```zsh
npm run build && npm start
```

## App Builder

The App Builder needs **Docker** on the machine running CapHub Studio. On a Mac:

```zsh
brew install colima docker   # or install Docker Desktop / OrbStack instead
colima start --cpu 4 --memory 8
```

Then open **App Builder**, describe an app and click **Build app**. The first build downloads the `node:22-bookworm-slim` and `postgres:16-alpine` images (~300 MB).

How it works:

```
CapHub Studio (Next.js)                         Docker network: caphub-net
 ├─ coding agent ── tools ──► files in data/apps/<id>/workspace  ─┐
 │                 run_command / check_page / logs ──────────────►│ caphub-app-<id>  (node, `next dev`, bind-mounts the workspace)
 ├─ preview proxy 127.0.0.1:<port> ──(strips CapHub cookies)──────►│      │
 └─ GitHub push (REST API)                                        │      ▼
                                                                  └ caphub-postgres  (one database + role per app; not exposed to the host)
```

- **Template:** `templates/nextjs-postgres` — Next.js 16, TypeScript, Tailwind v4, Drizzle ORM, email/password auth (bcrypt + signed JWT cookie), `user`/`admin` roles (first sign-up is admin), admin panel, `/api/health`.
- **Agent tools:** list/read/write/edit/delete files, search, run a command in the container (`npm install`, `npm run typecheck`, `npm run db:push`…), fetch a page from the running app, read dev-server logs, restart the app. It verifies its work (type-check + page checks) before reporting back.
- **Turns run in the background** — you can close the tab; reopening the app resumes the live activity feed. One turn per app at a time; **Stop** cancels it.
- **Versions:** the project files are snapshotted after every AI turn and manual edit (last 30 kept). Restoring doesn't roll back database data.
- **Isolation:** each app container drops Linux capabilities, uses `no-new-privileges`, has memory/CPU/PID limits, runs as the workspace owner (never root on a real Mac/Linux host), and can only reach its own database with its own credentials. Previews go through a proxy inside CapHub that removes CapHub's cookies, so generated code never sees your admin session.
- **GitHub:** add a fine-grained token in **Settings → AI Providers → GitHub** (Contents + Administration read/write). Each push creates the repo if needed and makes its default branch match the project.

App Builder settings (all optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `CAPHUB_APP_IMAGE` | `node:22-bookworm-slim` | Image apps run in (needs node, npm, bash, `setpriv`) |
| `CAPHUB_PG_IMAGE` | `postgres:16-alpine` | Shared Postgres image |
| `CAPHUB_APP_PORTS` | `4100-4999` | Preview ports |
| `CAPHUB_APP_BIND` | `127.0.0.1` | Interface previews listen on |
| `CAPHUB_APP_MEMORY` / `CAPHUB_APP_CPUS` | `2g` / `2` | Per-app container limits |
| `CAPHUB_DOCKER_EXTRA_ARGS` | — | Extra `docker run` args (e.g. corporate proxy / CA settings) |
| `GITHUB_TOKEN` | — | Fallback GitHub token |

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

## CRM setup per sub-account

1. **Stripe** — Settings → Stripe: paste a secret key (start with `sk_test_…`). For subscription renewals and refunds, add a Stripe webhook to the URL shown there (`/api/webhooks/stripe/<sub-account id>`) with `checkout.session.completed`, `invoice.paid`, `charge.refunded`, and paste its `whsec_…` signing secret. One-time payments are recorded even without the webhook (when the buyer returns to the success page), but Stripe can only call the webhook if CapHub Studio is reachable from the internet.
2. **Email** — Settings → Email sending: pick a provider preset, enter SMTP credentials, **Save & verify**, then **Send test email**.
3. **Automations** run in the server process (checked every 15 seconds); waits survive restarts. Set `CAPHUB_DISABLE_WORKER=1` to turn the runner off.

## Security notes

- Per-user accounts (scrypt-hashed passwords); sessions are HMAC-signed, httpOnly, SameSite=Lax cookies (7 days). Login is rate limited. Every record is checked against the user's sub-account access — records in other sub-accounts return 404.
- Stripe keys, webhook secrets and SMTP passwords are encrypted at rest with `APP_SECRET` and never sent back to the browser.
- Public endpoints (`/api/public/*`) are rate limited per IP, and widget chat is also capped per agent per hour to protect your API bill. The widget only works for agents with **Public chat widget** turned on.
- Rate limits are in-memory, so they reset on restart and aren't shared across multiple server instances.

## Deploying

SQLite + in-memory rate limiting means this MVP is designed for **one server instance with a persistent disk** (a VPS, Fly.io/Render with a volume, a Mac mini, Docker with a mounted `data/` volume). It is not suited to serverless platforms with ephemeral filesystems. Set `PUBLIC_BASE_URL`, put it behind HTTPS, and back up `data/caphub.db`.

## Not included yet

- **App Builder:** one-click production deploys and custom domains for generated apps (download the zip or push to GitHub and deploy anywhere that runs Next.js + Postgres), database browser, per-app environment variables, rolling back database data.
- **Vs GoHighLevel:** custom domains for sites, calendars/booking with real availability, SMS/voice, inbound email replies (two-way inbox), social planner, reputation/reviews, memberships/courses, invoices/estimates, agency SaaS rebilling, and agent actions (tool calls such as booking or tagging contacts from the chat widget).
