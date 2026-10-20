# Autovance AI

A Next.js (Pages Router) application that combines four practical automation
features with a research prototype for **explainable workflow proposals**.

- **Four primary features:** Email Automation, Webhook Automation, Cron Jobs,
  Form Actions.
- **Research tool:** the Workflow Builder at `/workflows` generates a structured
  proposal (goal, steps with rationale, assumptions, risks, missing information,
  one alternative), validates it deterministically, contrasts it against an
  optional user-supplied alternative, and previews a zero-side-effect dry run.
  See [RESEARCH.md](RESEARCH.md) for methodology, limitations, and the
  evaluation plan.
- **Change record:** [CHANGES.md](CHANGES.md) documents every change in the
  contributor handoff — full file inventory, verification results, and known
  limitations.

Everything is honest about what is and is not working: when a provider is not
configured, when the AI model is rate limited, or when scheduling cannot run in
the current environment, the app says so instead of showing a fake success.

## Tech stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 13.5 (Pages Router) |
| UI | React 18, styled-jsx |
| Plan preview canvas | React Flow 11 (`/workflows` only) |
| Runtime | Node.js 18+ (built-in `fetch`, `crypto.scrypt`, `node --test`) |
| Persistence | Postgres (Neon) on Vercel via `POSTGRES_URL`; JSON files under `data/` locally (git-ignored) |
| Dependencies | Next.js, React, React Flow, and `pg` (Postgres driver) — no other runtime libraries |

## Features

### Primary automation features (navbar: Dashboard, Email, Webhook, Cron Jobs, Form Actions)

1. **Email Automation** (`/email`)
   - AI draft generation with an explicit language selection: **English**,
     **Urdu (اردو)**, and **Roman Urdu**; the requested language is stated in
     the prompt and Urdu drafts get an advisory script check plus RTL rendering
     (`dir="rtl"` in the editor, preview, and the HTML part sent to the
     provider).
   - Editable subject/recipient/body with preview, client and server
     validation, and duplicate-send guards.
   - Real delivery through **Resend** or **SendGrid** (`lib/emailSender.js`).
     Success is reported only when the provider API accepts the message;
     otherwise the exact failure (not configured, rate limited, rejected) is
     shown. Delivery is asynchronous, so acceptance is never claimed as
     confirmed delivery.
   - No provider is configured out of the box; the UI reports that honestly.

2. **Webhook Automation** (`/webhook`)
   - GET/POST/PUT/PATCH/DELETE with editable JSON headers and body.
   - Server-side validation plus SSRF protections in `lib/safeFetch.js`:
     http/https only, no URL credentials, private/loopback/link-local/metadata
     addresses blocked (IPv4, IPv6 including hex-encoded v4 forms), every
     redirect hop re-validated (max 3), caller headers dropped on
     cross-origin redirects, timeout covering headers **and** body, response
     size cap. Documented residual limitation: the classic DNS-rebinding race
     (cannot be closed cleanly without extra dependencies).

3. **Cron Jobs** (`/cron`)
   - Create, **edit**, enable/disable, delete (two-step confirm), run now, next
     run calculation, and execution history. Times are displayed in **UTC** to
     match how schedules are parsed.
   - Validation rejects impossible expressions (e.g. 30 February) with an
     actionable error instead of silently never running; day-of-week `7`
     normalizes to Sunday like standard cron.
   - Ownership: jobs belong to the account that created them (legacy ownerless
     jobs stay shared so existing data keeps working).
   - **Where jobs execute:** on a long-lived Node server (`npm run dev` /
     `npm start`) an in-process tick runs enabled jobs automatically; the
     runner starts the first time the Cron Jobs page or its API is accessed
     after a restart. On Vercel, `vercel.json` schedules an hourly invocation
     of `GET /api/cron` authenticated with `Authorization: Bearer
     ${CRON_SECRET}`, and that invocation runs every due job. On other
     serverless hosts without either, jobs are stored but not auto-executed —
     use "Run now" or an external scheduler. The UI states the real status.

4. **Form Actions** (`/form`)
   - Schema editor (label/key/type/required, select options), server-side
     submission validation against the stored schema, persistence with a
     bounded history, and a submissions panel that reads stored responses back
     from the server (with UTC timestamps).
   - Optional follow-up webhook (`FORM_FOLLOWUP_WEBHOOK_URL`); when unset, the
     UI and API say "not configured" rather than inventing an action.

### Dashboard and shared UI

- Dashboard (`/dashboard`) shows the four feature cards and a quick AI text
  generator.
- Shared Navbar (five primary links) and Footer (Workflow Builder is linked
  from the dashboard tools and the footer as the secondary research tool),
  light/dark themes with a pre-paint boot script (no flash, no OS override),
  responsive layout, accessible focus states and labels.

### Research prototype

- `/workflows` (Workflow Builder): proposal generation via `/api/propose`,
  structural validation, deterministic plan comparison, deterministic dry-run
  preview, contrastive question support, limitations disclosure, and an
  **explainability scoresheet** presented as a developer self-assessment
  against the structure of Winikoff, Thangarajah & Rodriguez, *A Scoresheet for
  Explainable AI* (AAMAS 2025). It is not a certification or an independent
  evaluation. Details in [RESEARCH.md](RESEARCH.md).

## Getting started

```bash
git clone https://github.com/MaryamAmjad-Dev/Autovance-AI.git
cd Autovance-AI
npm install
cp .env.example .env.local   # then edit .env.local
npm run dev
```

Open <http://localhost:3000>.

> The app runs without any environment variables: you can sign up, create
> cron jobs (log-only), build forms, and use webhooks to public endpoints. The
> AI features and email sending additionally require the variables below.

## Environment variables

All variables are read on the server only. `.env.example` documents them with
placeholder values; `.env*` files are git-ignored.

| Variable | Required for | Notes |
|----------|--------------|-------|
| `OPENROUTER_API_KEY` | All AI generation | Server-side only; never sent to the client. Free-tier models can return HTTP 429 (reported honestly). |
| `AI_MODEL` | All AI generation | Model slug; falls back to `openrouter/free` if unset. |
| `BREVO_API_KEY` (preferred), else `RESEND_API_KEY` or `SENDGRID_API_KEY` | Real email sending | Precedence: Brevo > Resend > SendGrid. Without a key, sending reports "not configured". |
| `EMAIL_FROM` | Real email sending | Verified sender identity for the chosen provider. |
| `FORM_FOLLOWUP_WEBHOOK_URL` | Form follow-up webhook | Optional; unset means storage-only (reported as such). |
| `APP_BASE_URL` | Password-reset emails in production | Public base URL used to build reset links; without it, production reset requests fail with an explicit configuration error instead of trusting request headers. |
| `POSTGRES_URL` | Persistence on Vercel/serverless | Postgres connection string (set automatically by the Neon integration). When present, `lib/store.js` uses Postgres; when absent, JSON files under `data/` are used (local dev and tests). |
| `CRON_SECRET` | Vercel cron | Random secret; Vercel sends it as `Authorization: Bearer …` to the hourly `/api/cron` invocation. Unset means that path is disabled. |

## Commands

```bash
npm test          # unit/integration tests (node --test, mocked providers, offline)
npm run build     # production build
npm start         # production server (long-running; required for cron auto-execution)
npm run dev       # development server
```

### Testing notes (what is real vs. mocked)

- `npm test` is fully offline: AI provider calls, email provider calls, webhook
  transports, DNS lookups, and storage are mocked or injected in tests. Passing
  tests do **not** prove real delivery.
- Real integrations that require credentials: AI proposal generation (needs a
  working `OPENROUTER_API_KEY` and available provider capacity) and email
  sending (needs a provider key plus verified `EMAIL_FROM`). These must be
  verified live in a configured environment; the code reports failures with
  exact status codes rather than faking success.

## Architecture

```text
pages/
  _document.js         theme boot script (no flicker)
  index|dashboard|email|webhook|cron|form|workflows|about|team|login|signup|reset-*
  api/
    ai.js              legacy free-text generation (rate-limited)
    propose.js         research proposal endpoint (rate-limited)
    email.js           real provider send (session + rate limit)
    webhook.js         SSRF-safe proxied HTTP call (session)
    cron.js            job CRUD + run now (session, per-user ownership)
    form.js            schema get/put, submissions, optional follow-up (session)
    auth/              login, signup, logout, me, reset (session cookie)
lib/
  auth.js              scrypt hashing, httpOnly sessions, reset tokens,
                       APP_BASE_URL link building, same-origin guard
  validate.js          shared input validation
  safeFetch.js         SSRF-safe HTTP with injectable test seams
  scheduler.js         5-field cron parser, persistence, in-process runner
  forms.js             schema + submission validation
  emailSender.js       Resend/SendGrid delivery with honest error mapping
  emailLanguage.js     language prompts, RTL/HTML wrapping, advisory checks
  rateLimit.js         per-process in-memory rate limiter (429 + Retry-After)
  workflowProposal.js  deterministic validation / diff / dry run (research core)
  explainabilityScoresheet.js  self-assessment data (research)
components/            Navbar, Footer, ParticleBackground, theme, auth, cards
tests/                 node --test suites (offline)
data/                  local JSON store: users, sessions, jobs, submissions
                       (git-ignored; only used when POSTGRES_URL is unset)
```

- **Auth:** passwords hashed with scrypt (salted), sessions are server-side
  records addressed by a random token in an `HttpOnly; SameSite=Lax` cookie
  (Secure outside local dev), logout revokes server-side, reset tokens are
  hashed, single-use, 30-minute expiry, login timing equalized against
  enumeration, origin checks and per-IP rate limits on auth endpoints.
- **Rate limiting:** in-memory per process on auth, AI, propose, and email-send
  endpoints (documented limitation: not global across processes).
- **No claims beyond what exists:** there are no microservices, no
  Kubernetes, and no formal BDI implementation — the research prototype uses a
  BDI-*inspired* proposal structure, as stated in the UI and RESEARCH.md.

## Known limitations

- **Storage backend is environment-selected:** with `POSTGRES_URL` set
  (Vercel + Neon) all state lives in one Postgres table (`store_entries`);
  without it, `lib/store.js` keeps JSON files under `data/`, which do **not**
  survive serverless read-only filesystems — that combination is local-dev
  only. `npm run migrate:pg` copies an existing `data/` directory into
  Postgres. The store interface is async; `update()` locks a key so concurrent
  signups, single-use reset tokens, and cron edits stay correct across
  serverless instances.
- Cron auto-execution requires a long-running process (see Cron Jobs above);
  the in-process rate limiter is per process; multiple processes could each
  tick (run one process for cron workloads).
- AI generation depends on upstream availability; free-tier capacity is finite
  and 429s are surfaced verbatim.
- Email "accepted" means the provider accepted the request, not that the
  message landed in an inbox.
- The explainability scoresheet is a developer self-assessment, not an
  independent evaluation. Generated rationales are plausible text, not verified
  accounts of any computation.
- DNS-rebinding race in `safeFetch` (documented in that module).

## Research

- Winikoff, Thangarajah, Rodriguez. *A Scoresheet for Explainable AI*. AAMAS
  2025. <https://arxiv.org/abs/2502.09861>
- *Contrastive explanations of BDI agents*. <https://arxiv.org/abs/2602.13323>
- Publications page: <https://winikoff.github.io/publications.html>

Methodology, veracity split (model-generated vs. computed), limitations, and a
reproducible evaluation plan with measurable metrics: [RESEARCH.md](RESEARCH.md).

## Author

Maryam Amjad — <https://github.com/MaryamAmjad-Dev>
