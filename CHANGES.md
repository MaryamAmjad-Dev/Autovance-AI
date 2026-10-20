# Change Record — Contributor Handoff

This document records every change included in the contributor handoff so the
reviewing contributor has a single, complete reference before merging.

| Item | Value |
|------|-------|
| Branch | `handoff/autovance-ai-contributor-review` |
| Base | `feat/explainable-workflow-prototype` @ `8fc60c5` |
| Handoff commit | `7052b32` — `chore: prepare Autovance AI contributor handoff` |
| Scope | 77 files changed, +12,788 / −1,977 |
| Status | Pushed and verified on GitHub; **no merge was performed** — merging is the contributor's step |

Repository: <https://github.com/MaryamAmjad-Dev/Autovance-AI>

---

## 1. What this handoff contains

A full end-to-end audit and hardening pass of the Autovance AI platform:

- The **four primary automation features** made genuinely functional and honest:
  Email Automation, Webhook Automation, Cron Jobs, Form Actions.
- **Authentication and security**: session handling, password reset flow,
  ownership checks, CSRF/origin protection, rate limiting, SSRF-safe outbound
  fetch, credential-redacting error handling.
- The **`/workflows` explainability research prototype** with its
  self-assessment scoresheet and evaluation plan.
- **UI, navigation, and theme** cleanup with accessibility fixes.
- **README, `RESEARCH.md`, `.env.example`, `.gitignore`** rewritten for accuracy.
- **20 test suites** covering every new library and API handler, including
  security regression tests.

## 2. Feature changes

### 2.1 Email Automation (`/email`, `pages/api/email.js`)

- AI draft generation with an explicit language selector: **English**,
  **Urdu (اردو)**, **Roman Urdu**. The requested language is stated in the
  prompt; unknown language ids fall back to English without error.
- Urdu drafts get an advisory Arabic-script check and are sent with an escaped
  **RTL** HTML part (`dir="rtl"` in editor, preview, and provider payload).
- Honest status: when no provider (`RESEND_API_KEY` / `SENDGRID_API_KEY`) is
  configured, the API returns `503 not_configured` instead of faking success.
- Duplicate-send guards; provider credentials are never echoed back in
  responses or errors (verified by regression tests that assert a planted
  dummy key value never appears in output).
- New libs: `lib/emailSender.js`, `lib/emailLanguage.js`.
  Tests: `tests/emailSender.test.mjs`, `tests/emailLanguage.test.mjs`,
  `tests/emailApi.test.mjs`.

### 2.2 Webhook Automation (`/webhook`, `pages/api/webhook.js`)

- Outbound calls go through **`lib/safeFetch.js`**, which blocks loopback and
  private-network targets (SSRF protection). Verified live: a loopback target
  is rejected with `400`.
- Honest delivery status: success is reported only when the remote endpoint
  actually returns a success status; failures surface the mapped error.
- Caller-supplied headers are dropped on cross-origin redirects only.
- Tests: `tests/safeFetch.test.mjs` (18 cases including DNS-rebinding edge
  cases and redirect handling).

### 2.3 Cron Jobs (`/cron`, `pages/api/cron.js`)

- Full lifecycle: create, list, edit, delete, with a manual schedule builder on
  the page and clear **UTC** labelling.
- Owner scoping: users only see and manage their own jobs; legacy ownerless
  jobs remain shared so nothing breaks.
- Validation rejects impossible or unmatchable schedules (including leap-day
  schedules) with a documented message; day-of-week `7` maps to Sunday.
- Honest scheduler disclosure: the runner is in-process — jobs run only while
  the Next.js server is alive — and the UI states this instead of implying a
  distributed scheduler.
- New libs: `lib/scheduler.js` (parse/next-run/execute engine),
  `lib/store.js` (JSON persistence under `data/`).
  Tests: `tests/scheduler.test.mjs`, `tests/schedulerExec.test.mjs`,
  `tests/cronApi.test.mjs`, `tests/store.test.mjs`.

### 2.4 Form Actions (`/form`, `pages/api/form.js`)

- **Server-side validation** of the form schema (fields, types, options) —
  the client is no longer the only validator.
- Honest persistence status and **submissions read-back**: stored submissions
  are listed from the server, not simulated in the browser.
- Optional follow-up webhook (`FORM_FOLLOWUP_WEBHOOK_URL`); when unset, the
  feature reports `not_configured` instead of pretending to deliver.
- Known limitation (documented): the form schema is single-deployment.
- New lib: `lib/forms.js`. Tests: `tests/forms.test.mjs`, `tests/formApi.test.mjs`.

### 2.5 AI proposal endpoint (`pages/api/propose.js`, `pages/api/ai.js`)

- Standardized provider error mapping via `lib/aiError.js`: upstream rate
  limits become `429 rate_limited` with `retryable: true`; a provider failure
  is **never** treated as success.
- Rate limited (in-memory, 20 req/min per IP) and validated input.
- Dry-run mode never executes real actions.
- Tests: `tests/aiError.test.mjs`, `tests/aiHandler.test.mjs`,
  `tests/extractJson.test.mjs`.

## 3. Authentication and security

- **`lib/auth.js`**: `crypto.scrypt` password hashing, session cookies,
  signed reset tokens with expiry, constant-time comparison.
- **`pages/api/auth/`** — `login.js`, `logout.js`, `me.js`, `signup.js`,
  `reset.js` (single route with `mode: "request" | "confirm"`).
- Password reset: base-URL check happens **before** user lookup
  (prevents account enumeration); production requires `APP_BASE_URL`.
- **`lib/rateLimit.js`**: in-memory fixed-window limiter on login, signup,
  reset, AI, propose, and email endpoints. Honest caveat: it is a per-process
  damper, not a security boundary, and resets on restart.
- **`lib/requireAuth.js`**: shared ownership guard used by the cron/form/email
  APIs.
- **Origin/CSRF guard**: cross-site browser requests without a matching Origin
  are rejected `403`; non-browser requests (no Origin header, e.g. curl) are
  allowed. Verified live.
- Regression tests for all of the above: `tests/auth.test.mjs`,
  `tests/authSession.test.mjs`, `tests/rateLimit.test.mjs`.

## 4. Research prototype (`/workflows`)

- Generates a structured proposal (goal, steps with rationale, assumptions,
  risks, missing information, one alternative), validates it deterministically,
  contrasts it against an optional user-supplied alternative, and previews a
  **zero-side-effect** dry run.
- `lib/explainabilityScoresheet.js` is explicitly a **developer
  self-assessment**: it distinguishes model-generated text from
  computed/derived values and never claims results are faithful, causal,
  guaranteed, or verified.
- `lib/workflowProposal.js`: normalization, diffing, and dry-run simulation.
- `RESEARCH.md`: contribution, methodology, limitations, measurable metrics
  (M1–M8), and a reproducible evaluation plan (8 scenarios × 3 variants ×
  3 repetitions). No fabricated results and no novelty claims.
- Tests: `tests/scoresheet.test.mjs`, `tests/explainability.test.mjs`,
  `tests/workflowProposal.test.mjs`, `tests/validate.test.mjs`.

## 5. UI, navigation, and theme

- Navbar keeps its **five links** (Dashboard, Email, Webhook, Cron Jobs, Form
  Actions); Workflow Builder is secondary; no personal greetings; professional
  copy throughout.
- Purple particle background, theme boot script (no flash on load), and
  `ThemeToggle` preserved; `Avatar`, `Footer`, `AuthShell`, `PasswordField`,
  `PasswordStrength`, `FeatureCard` added.
- Accessibility fixes: honest **"unverified" labels**, reduced-motion support
  (JS check plus CSS media query), mobile-menu visibility fixes,
  nested-interactive element cleanup, corrected heading order.
- Signup links to login (`next` param); reset-password and reset-confirm pages
  added.
- Dead code removed: `pages/api/hello.js`, `pages/builder.js`
  (superseded by `/workflows`), `styles/Home.module.css`.

## 6. Files changed (full inventory)

**77 files: +12,788 / −1,977**

### New — configuration & docs
```
.env.example          RESEARCH.md           CHANGES.md (this file)
```

### New — components (11)
```
components/Avatar.js
components/ThemeToggle.js
components/auth/AuthShell.js
components/auth/PasswordField.js
components/auth/PasswordStrength.js
components/dashboard/FeatureCard.js
components/dashboard/features.js
components/layout/Footer.js
components/layout/Navbar.js
components/layout/ParticleBackground.js
```

### New — libraries (13)
```
lib/aiError.js                 lib/emailSender.js       lib/rateLimit.js
lib/auth.js                    lib/explainabilityScoresheet.js  lib/requireAuth.js
lib/emailLanguage.js           lib/forms.js             lib/safeFetch.js
lib/scheduler.js               lib/store.js             lib/validate.js
lib/workflowProposal.js
```

### New — API routes (9)
```
pages/api/auth/login.js        pages/api/auth/logout.js
pages/api/auth/me.js           pages/api/auth/reset.js
pages/api/auth/signup.js       pages/api/cron.js
pages/api/email.js             pages/api/form.js
pages/api/propose.js
```

### New — pages (2)
```
pages/reset-confirm.js         pages/reset-password.js
```

### New — tests (20)
```
tests/aiError.test.mjs         tests/aiHandler.test.mjs
tests/auth.test.mjs            tests/authSession.test.mjs
tests/cronApi.test.mjs         tests/emailApi.test.mjs
tests/emailLanguage.test.mjs   tests/emailSender.test.mjs
tests/explainability.test.mjs  tests/extractJson.test.mjs
tests/formApi.test.mjs         tests/forms.test.mjs
tests/rateLimit.test.mjs       tests/safeFetch.test.mjs
tests/scheduler.test.mjs       tests/schedulerExec.test.mjs
tests/scoresheet.test.mjs      tests/store.test.mjs
tests/validate.test.mjs        tests/workflowProposal.test.mjs
```

### Modified (19)
```
.gitignore  README.md  package.json
pages/_document.js  pages/about.js  pages/api/ai.js  pages/api/webhook.js
pages/cron.js  pages/dashboard.js  pages/email.js  pages/form.js
pages/index.js  pages/login.js  pages/signup.js  pages/team.js
pages/webhook.js  pages/workflows.js  styles/globals.css
```

### Deleted (3 — dead code)
```
pages/api/hello.js   pages/builder.js   styles/Home.module.css
```

## 7. Verification results (actual, not aspirational)

| Check | Command | Result |
|-------|---------|--------|
| Test suite | `npm test` | **20/20 suites pass, 0 failures** (Node built-in `node --test`) |
| Production build | `npm run build` | **Compiles clean**, all routes emitted, no errors or warnings |
| Live HTTP battery | production server, 31 checks | **31/31 pass** — routes, 307 auth gates, public `/workflows`, origin-guard 403, signup 409 on duplicate, login/session, cron full lifecycle with runner active, form lifecycle with submissions read-back, webhook loopback block 400, email `not_configured` 503, reset `not_configured` 503 |
| Secret scan | pattern scan of staged diff + untracked files | Clean — only deliberate test dummies (`re_SUPERSECRETVALUE123`) used for leak-prevention assertions |

Mocked vs real: all unit tests are offline/mocked. The live battery ran against
a real production build. The only unverified success path is real AI
generation — see limitations below.

## 8. Environment variables (`.env.example` — placeholders only)

```
OPENROUTER_API_KEY=your-openrouter-api-key
AI_MODEL=google/gemma-4-31b-it:free
RESEND_API_KEY=re_your_resend_key
SENDGRID_API_KEY=SG.your_sendgrid_key
EMAIL_FROM="Autovance AI <no-reply@yourdomain.com>"
FORM_FOLLOWUP_WEBHOOK_URL=https://example.com/hooks/autovance
APP_BASE_URL=http://localhost:3000
```

`.env` and `.env.local` are git-ignored (with `!.env.example` exception);
`data/` (local JSON database), `node_modules/`, `.next/`, and logs are
excluded from version control.

## 9. Known limitations and open items

1. **Real AI generation is externally blocked (not a code bug).** All live
   `/api/propose` attempts returned upstream HTTP 429 from OpenRouter's
   free-tier shared pool (key accepted, quota unused). The app reports this
   honestly as `429 rate_limited` with `retryable: true`. Retry when the
   model's free capacity recovers, or configure a paid `AI_MODEL` slug.
2. **Compromised legacy OpenRouter key must be revoked by the account owner**
   (user-side action; the old shared key was exposed previously).
3. **No email provider configured** — email sends and password-reset delivery
   honestly return `not_configured` (503) until `RESEND_API_KEY` or
   `SENDGRID_API_KEY` is set.
4. **`FORM_FOLLOWUP_WEBHOOK_URL` unset** — follow-up delivery reports
   `not_configured`.
5. **SafeFetch DNS-rebinding race (TOCTOU)** between resolution and connect is
   documented as a limitation; `lookup`/`fetchImpl` test seams exist for
   future hardening.
6. **Rate limiter is in-memory and per-process** — a deliberate damper, not a
   distributed security boundary.
7. **Cron runner lives in the Next.js process** — schedules execute only while
   the server runs; the UI discloses this.
8. **Form schema is single-deployment** (documented limitation).

## 10. For the reviewer

- Nothing was merged, and `main` was not touched (local and remote both at
  `8fc60c5` before this branch).
- Suggested review order: `lib/` (auth, safeFetch, scheduler, store, aiError)
  → `pages/api/` → feature pages → tests → docs.
- Every claim in the README and `RESEARCH.md` is backed by a passing test or
  was verified live; claims that could not be verified are labelled
  "unverified" or "not_configured" in the product itself.

---

## 11. Finalization pass (contributor branch `contributor/finalization-roadmap`)

PR #1 was **merged** (`a708442`) before this pass started, so — per the
roadmap's branch rule — a new contributor branch was created from `main` and
this work is committed there for a follow-up review. Nothing was pushed or
merged without owner approval.

### What this pass adds

1. **Runnable research evaluation harness** (roadmap §5: "deliver a runnable
   harness and mark results pending"):
   - `lib/evaluation.js` — the 8-scenario × 3-variant suite **frozen** before
     any run (sha256 suite hash), deterministic run plan, and pure metric
     functions M1–M4, M6, M8; `formatReport` renders explicit
     **RESULTS PENDING / BLOCKED** wording when no model output exists.
   - `scripts/evaluate.mjs` — `plan` / `run` / `score` CLI; stores raw model
     responses verbatim under `evaluation/<runId>/` (git-ignored, never
     overwritten), honors 429 `Retry-After`, never prints keys.
   - `tests/evaluation.test.mjs` — 14 offline tests locking suite shape,
     classification, metric math, determinism (M3), and report honesty.
   - `RESEARCH.md` §6 updated to document the harness; **results remain
     pending** (no model access in this environment).
2. **`.gitignore`**: `/evaluation/` excluded — raw run data stays local.
3. **Docs**: this section records the storage/deployment decision below.

### Storage / deployment decision (roadmap §3)

- Current target verified as **local, single-process** (`npm start` serving
  JSON files under `data/` via `lib/store.js`: atomic temp+rename writes,
  corrupt-file backup, ENOENT→empty, read errors thrown).
- **No PostgreSQL migration was started.** The roadmap forbids a risky
  migration without a confirmed hosted multi-instance/serverless target; no
  such target is confirmed. File storage + in-process cron remain correct
  *for single-process deployments only*; this is documented in README
  "Known limitations" and must not be presented as durable multi-user
  production storage.
- Smallest safe step taken: decision documented, tests re-verified (below).
  Migration blocker: requires owner confirmation of the deployment target
  (and, if hosted: schema, migrations, indexes, backup/import, rollback).

### Verification evidence (this pass)

| Check | Command | Result |
|-------|---------|--------|
| Unit/integration | `npm test` | **exit 0 — 21 test files, 34/34 reported tests, 0 failures** (20 prior suites + new `tests/evaluation.test.mjs` with 14 tests) |
| Production build | `npm run build` | clean, all routes emitted |
| Lint | `npm run lint` | **not runnable non-interactively** — no ESLint config/binary exists in the repo, so `next lint` opens the interactive first-time setup prompt. Not configured here (adding ESLint + plugin would be a new dependency, deferred to the owner). |
| Live HTTP battery | prod server on `:3456`, 25 checks | **25/25** — routes, 307/401 gates, origin-guard 403, signup/me session, cron lifecycle incl. run-now, SSRF loopback 400, email `503 not_configured`, propose `503` naming `OPENROUTER_API_KEY`, form submit 422 + submissions read-back |
| Browser (headless Chrome/CDP) | 17 checks | **17/17** — theme switch+persist across reload, Tab focus, signup, email validation errors, honest AI failure message, Urdu RTL (`dir=rtl`, `lang=ur`, mixed Urdu/English preview), ltr restore, honest `not_configured` send, cron/form empty states, mobile 390px: no h-overflow, burger menu + panel, email page |
| Harness CLI | `plan` / blocked `run` / `score` | exit 0 / 0 / 0; usage=2; missing dir=3; blocked report says RESULTS PENDING |
| Secret scan | pattern scan of tracked files | only planted test dummies; no real keys |

Mocked vs live: unit tests are offline; the HTTP battery and browser checks
ran against a real production build locally. **BLOCKED:** real AI generation
(no `OPENROUTER_API_KEY` configured here — server reports `503` naming the
variable), real email delivery (no provider key — server reports
`503 not_configured`). The previously shared OpenRouter key remains an
owner-side revocation task and was never reproduced here.
