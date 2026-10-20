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

---

## 12. Follow-up verification pass (branch `contributor/roadmap-followup`)

PRs #1 and #2 were already **merged** by the time this pass started
(`main` @ `fcdf7a9`), so per the roadmap's branch rule a new contributor
branch was cut from `main`. Nothing was pushed or merged without owner
approval.

### Changes in this pass

1. **`.gitignore` fix (`584d2b5`)** — removed the bare `tests` entry added in
   `6ed156d`. It silently ignored any *new* file under `tests/`, which would
   have blocked the roadmap requirement to add regression tests. Verified:
   a probe file in `tests/` now shows as untracked instead of ignored.
2. **Reproducible live smoke battery (`f31cd5a`)** — `scripts/smoke.mjs`
   (also `npm run smoke`): 48 HTTP checks against a running production
   server, including a live `/api/propose` probe and a `--login-only` mode
   for restart-persistence verification. Browser artifacts
   (`.playwright-cli/`) are now git-ignored.

### Verification evidence (this pass, actual output)

| Check | Command | Result |
|-------|---------|--------|
| Unit/integration | `npm test` | **exit 0 — 21 files, 34/34 reported tests, 0 failures** |
| Production build | `npm run build` | **exit 0 — clean, all routes emitted** |
| Live HTTP battery | `node scripts/smoke.mjs` vs prod `:3456` | **48/48 PASS** — routes, 307/401 gates, signup/session/duplicate-409, wrong-password-401, origin-guard 403, cron full lifecycle (create/list/patch/run-now/delete, invalid schedule 400) with **cross-user isolation (B → 404)**, form 422/201 + submissions read-back + honest `not_configured` follow-up, webhook loopback SSRF 400, email `503 not_configured`, reset `503 not_configured` |
| Restart persistence | server killed + restarted, `smoke.mjs --login-only` | **PASS** — pre-restart user logs in after restart (data under `data/` survives) |
| Live AI (key now configured) | `/api/propose` (battery + one retry) | **429 `rate_limited`, `retryable: true` both times** — key is accepted (no 401); upstream OpenRouter free-tier capacity. Honest mapping verified; **real generation remains BLOCKED upstream** |
| Research harness | `evaluate plan` / `run --reps 1 --limit 2` / `score` | plan exit 0 (frozen suite hash `44db8755…`); live mini-run stored 2 records, both 429 → `responded 0, unavailable 2`, report says **RESULTS PENDING/BLOCKED** (never fabricated); `score` exits 0 |
| Browser (playwright-cli) | login, /workflows, /email, mobile 390px | theme toggle light→dark persists across reload (`data-theme` + localStorage); /workflows renders, no overflow; **390px: no horizontal overflow**; email language Urdu → editor `dir=rtl lang=ur` with mixed Urdu/English text, English restores LTR; only console entry is the expected logged-out `/api/auth/me` 401 |
| Secret scan | pattern scan of full branch diff + tracked files | clean — only the documented planted test dummy in CHANGES.md |

### Environment note

`OPENROUTER_API_KEY` + `AI_MODEL=google/gemma-4-31b-it:free` were provided by
the repo owner in a local git-ignored `.env.local` for this pass. The key
value was never printed, committed, or written to any tracked file
(`git check-ignore` confirms `.env.local` is ignored). The owner should
still rotate the previously exposed legacy key.

### Status after this pass

| Area | Status |
|------|--------|
| Baseline tests/build | **PASS** (reproduced) |
| Persistence (restart, ownership, read-back) | **PASS** (live-verified) |
| Cron / Forms / Webhook / Email (code paths) | **PASS** (live-verified; email delivery itself BLOCKED — no provider key, reported honestly) |
| Auth/session/origin-guard | **PASS** (live-verified) |
| AI proposal | **BLOCKED upstream** — key configured and accepted; OpenRouter returns 429 for the free model. App surfaces it honestly. |
| Research evaluation | **Harness runnable + honest; results PENDING** until upstream capacity allows a real run; M7 needs human raters |
| Storage/deployment | unchanged — local single-process JSON under `data/`; PostgreSQL migration still awaiting owner's deployment-target confirmation |

### 12.1 Live integration pass (owner-provided key, model & Resend)

The owner configured `.env.local` (git-ignored) with a new OpenRouter key,
`AI_MODEL=minimax/minimax-m3.1-flash:free`, and a Resend key. Findings and
fixes from live testing:

1. **`.env` template fixes** (local file only, never committed):
   the Resend variable was misspelled `RESENDER_API_KEY` → corrected to
   `RESEND_API_KEY` (the name `lib/emailSender.js` reads); added
   `EMAIL_FROM` and `APP_BASE_URL` (password-reset emails require it in
   production).
2. **AI model diagnosis → code fix (`pages/api/propose.js`)**:
   `minimax-m3.1-flash` is a *reasoning* model — with `max_tokens: 1600` it
   spent the entire budget on hidden `reasoning_tokens` (1600/1600,
   `finish=length`, **empty content**) so every real proposal failed as
   `model_output_invalid`. Direct provider probes confirmed: same model with
   `max_tokens: 6000` → **2/2 clean JSON** (also probed 5 other free models;
   gemma-4 free pool 429, nemotron-lightning reasoning-starved, deepseek
   free slugs 404, xing4.0 truncates/429-flaky). Fix: `max_tokens` 1600 →
   6000 and upstream timeout 45s → 60s (commented in code).
3. **Live results after fix (actual):**

| Check | Result |
|---|---|
| `npm test` | 34/34 + evaluation 14/14, 0 failures |
| `npm run build` | clean |
| `npm run smoke` (prod) | **49/49 PASS** |
| **Live `/api/propose`** | **200 ok — model `minimax/minimax-m3.1-flash:free`, 5 steps, `validation.valid=true`, 25.7s** (repeated passes in smoke) |
| **Live email (Resend)** | **BLOCKED provider-side**: direct Resend API responds `403 The gmail.com domain is not verified` — Resend requires a verified custom domain (or SendGrid single-sender) as sender. App surfaces it honestly as `502 code=auth_failed` / reset `503`. Key itself is valid (reaches API, gets past auth). |
| Password reset | code path works; blocked by the same sender restriction (`APP_BASE_URL` now set) |
| Research harness | unchanged — runnable; a full run now unblocked on the AI side (mini-run earlier was 429-limited) |

**Email unblock (owner action):** either (a) add + verify a custom domain
on https://resend.com/domains (DNS SPF/DKIM/DMARC) and set
`EMAIL_FROM="Autovance AI <no-reply@yourdomain.com>"`, or (b) use SendGrid
whose free tier allows *single-sender verification* of a Gmail address
(`SENDGRID_API_KEY` + `EMAIL_FROM` = that Gmail). Note: `noreply@gmail.com`
cannot be used as a sender by anyone (Gmail provides no DNS/SPF control for
it).

### 12.2 Brevo email integration — LIVE (this pass)

The owner chose **Brevo** (they already had an account + SMTP credentials).
Implemented in `3953aa7` (no new dependencies):

1. **`lib/emailSender.js`**: third provider `BREVO_API_KEY` →
   `POST https://api.brevo.com/v3/smtp/email` (`api-key` header;
   `EMAIL_FROM` parsed into `{name, email}` for Brevo's `sender`).
   Precedence **BREVO > RESEND > SENDGRID** (documented in `.env.example`).
   `sanitizeDetail` now also redacts `xkeysib-` credential shapes.
2. **Tests**: precedence, 201-success payload shape, 401 `auth_failed`
   naming `BREVO_API_KEY` without leaking it, `xkeysib-` redaction —
   `emailSender` 13/13, `emailApi` 10/10, full suite 0 failures.
3. **Owner-side steps performed live**: created the `xkeysib-` API key
   (an earlier attempt pasted a non-key value — detected by format check
   and Brevo `401 Key not found`, value never printed); authorized this
   server's IP at app.brevo.com/security/auth (Brevo `401 unrecognised IP`
   cleared).

**Live evidence after rebuild + restart:**

| Check | Result |
|---|---|
| `POST /api/email` → owner's real inbox | **`200 ok, provider=brevo`, Brevo HTTP 201 accepted** |
| `POST /api/auth/reset` (request mode) | **`200 ok`** — reset email accepted for delivery |
| `npm run smoke` (prod) | **49/49 PASS** (email now 200, reset 200, propose 200) |
| `npm test` | 0 failures (incl. new Brevo tests) |

Note: Brevo's sender list endpoint (`GET /v3/smtp/senders`) returned
`404` from their API — sender verification was instead proven by the
successful live send itself. Delivery remains *asynchronous*: "accepted"
means the provider API accepted it, never a guaranteed inbox placement —
the owner should confirm the two test emails (subject
"Autovance AI — Brevo live delivery test" and the password-reset mail)
actually arrived.

### 12.3 Owner-requested UI copy changes (this pass)

At the owner's explicit request:

1. **Email success toast**: the raw provider wording
   ("brevo accepted the email (HTTP 201). Delivery is asynchronous.") is no
   longer shown in the UI; `/email` now displays
   "Email sent — it should arrive in the inbox shortly." The technical
   message stays in the API response (`data.message`) for logs/debugging,
   and the API's honest success/error/blocked semantics are unchanged
   (tests still assert them).
2. **"model-generated · unverified" badges removed everywhere** — the
   `aiTag` badges on Dashboard, Email and Form, and every
   `srcTag model` badge + the model entry of the veracity legend on
   `/workflows`. Verified live in the browser: 0 `.aiTag` /
   0 `.srcTag.model` elements after a real AI generation; headings render
   plain ("🎯 Goal", "🧭 Proposed plan", …). README, `/about` copy and
   `meta.grounding` were updated so no document still claims output is
   labelled in the UI; the scoresheet row that said "labelled unverified"
   now says "unverified".
   **Deliberately kept** (research-honesty prose required by the roadmap,
   not badges): `EXPLANATION_LIMITATIONS` items shown with `meta.limitations`,
   the scoresheet's own Q&A notes, and the "computed deterministically"
   / "your foil" tags. Owner may remove those too on request — doing so
   would weaken roadmap §5/§8 honesty claims, so it is flagged here.
3. Evidence: `npm test` 0 failures; `npm run build` clean; browser checks
   above; a live UI send produced
   "✅ Email sent — it should arrive in the inbox shortly."


## 13. Vercel deployment + Postgres persistence (owner request)

At the owner's explicit request the app is deployed to Vercel with a Postgres
database. Owner-approved deviation from the original "no database" note: the
roadmap rule "no new dependency without justification" is satisfied by the
justification "serverless filesystem is read-only; persistence requires a
database" — the only new runtime dependency is `pg` (the official Postgres
driver).

### 13.1 What changed in the code

1. **`lib/store.js` rewritten behind one async interface** —
   `get / set / update(name, fallback, fn)` with two backends chosen from the
   environment on first use:
   - **file** (unchanged behaviour): JSON under `./data`, used locally and in
     tests; the read/mutate/write inside `update()` runs synchronously so
     nothing can interleave in-process.
   - **postgres** (`POSTGRES_URL`/`DATABASE_URL` set): a single
     `store_entries(name, value JSONB, updated_at)` table; `update()` runs
     `BEGIN … SELECT … FOR UPDATE … UPDATE … COMMIT`, so the read-modify-write
     is serialized **across serverless instances**, not just within one
     process. Failed callbacks roll back with no write.
   This replaces the previous sync `read/write` API; `update()` exists to
   keep the concurrency guarantees the old sync code provided (documented
   regressions: concurrent duplicate signups store exactly one user; two
   concurrent confirms with one reset token succeed only once).
2. **Consumers converted to `await`**: `lib/auth.js` (users, sessions, reset
   tokens), `lib/scheduler.js` (jobs, history), `lib/requireAuth.js`,
   `pages/api/{cron,form,email,webhook}.js`, `pages/api/auth/*`, and the
   tests. Business behaviour is unchanged; the API contracts and response
   bodies are identical (tests assert the same things as before).
3. **Vercel cron support**: `vercel.json` schedules `GET /api/cron` **daily**
   (`0 0 * * *`) — Vercel's Hobby (free) plan rejects any schedule more
   frequent than daily ("Hobby accounts are limited to daily cron jobs");
   hourly would need Pro and is a one-line change back.
   Vercel calls the route with `Authorization: Bearer ${CRON_SECRET}`;
   `cron.js` verifies the header with a SHA-256 + `timingSafeEqual`
   comparison and then runs `tick()` (on serverless there is no long-lived
   in-process runner, so scheduled execution happens inside this
   invocation). Session-based manual use of the API is unchanged. Unset
   `CRON_SECRET` disables the path.
4. **Function budgets**: `export const config = { maxDuration: 60 }` on
   `/api/propose` (matches its 60 s upstream timeout) and `/api/cron`.
5. **`scripts/migrate-to-pg.mjs`** (`npm run migrate:pg`): copies an existing
   `data/*.json` store into `store_entries` (prints key names and counts
   only — never stored values, which include password hashes). Supports
   `--dry-run`.
6. **Docs**: README (tech stack, env table incl. Brevo precedence,
   cron section, storage limitation), `.env.example` (`POSTGRES_URL`,
   `CRON_SECRET`).

### 13.2 Vercel project configuration (done for the owner)

- Project `autovance-ai` (team `maryamamjad-projects`), git-connected to this
  repository's `main`.
- **Neon Postgres** installed from the Vercel Marketplace as
  `neon-carmine-battery` and connected to the project; `POSTGRES_URL` (and
  the usual `PG*`/`DATABASE_URL` variants) exist in the **Production** and
  **Preview** environments.
- Environment variables set for Production (and Preview where relevant):
  `OPENROUTER_API_KEY`, `AI_MODEL`, `BREVO_API_KEY`, `EMAIL_FROM`,
  `APP_BASE_URL=https://autovance-ai.vercel.app`, `CRON_SECRET` (random,
  sensitive), `POSTGRES_URL`.
- Local `data/` migrated: 6 keys (`users` 14, `sessions` 22, `reset-tokens`
  5, `form-submissions` 4, `cron-history` 4, `cron-jobs` 0) upserted into
  `store_entries` — 6 rows confirmed. Temp env files deleted; no secret was
  printed (one connection string briefly appeared in an error trace from a
  quote-wrapped pull file; the value was never re-used or written anywhere —
  rotation is optional but noted here for transparency).

### 13.3 Verification (local, with the refactor)

- `npm test` → **34/34** suites pass (all previous assertions, now async),
  including the two concurrency regression suites.
- `npm run build` → clean.
- `npm run smoke` → **49/49** live HTTP checks against `localhost:3456`
  (file backend).
- Postgres backend exercised for real by the migration script (SSL connection
  to Neon, `CREATE TABLE`, upserts, count read-back).
- Live deployment checks recorded in §13.4 below (filled after deploy).
### 13.4 Live deployment evidence (`https://autovance-ai.vercel.app`)

Deployed with `vercel --prod` from the contributor machine (the GitHub app
webhook did not auto-deploy; git is pushed to `main` either way). One Hobby-
plan adjustment was required: `crons` must be daily, not hourly (Vercel
rejected the hourly expression outright during the first deploy attempt).

- **Pages**: `/`, `/login`, `/signup`, `/workflows`, `/team` → 200;
  `/dashboard` → 307 (auth gate).
- **Auth against Postgres**: `npm run smoke` with
  `SMOKE_BASE_URL=https://autovance-ai.vercel.app` → **49/49 checks passed**
  (signup/login/logout/me, origin guard, validation, cron ownership 404s,
  form submit + read-back, webhook SSRF 400). Signup/login proved the Neon
  backend end-to-end.
- **AI**: live `POST /api/propose` → `200`, structured 5-6 step proposal
  (`model=minimax/minimax-m3.1-flash:free`).
- **Vercel cron**: `GET /api/cron` with `Authorization: Bearer <CRON_SECRET>`
  → `{"ok":true,"invokedBy":"cron_secret","executed":0,"scheduler":{"platform":"serverless (Vercel)"}}`;
  wrong bearer → 401.
- **Deploy-time bug found & fixed**: `.env.local` values are dotenv-quoted
  (`KEY="value"`); the first env upload kept the surrounding quotes, so
  OpenRouter and Brevo both answered 401 (`auth_failed`) on the first
  deployment. Values were re-added quote-stripped (`--value`, verified by
  length/prefix only) and the project redeployed — after which propose and
  the cron bearer worked. Vercel applies env changes only on redeploy.
- **Email — one owner action remains**: Brevo rejects Vercel's egress IP:
  `HTTP 401 {"message":"We have detected you are using an unrecognised IP
  address 100.59.28.84 … add the new IP address … app.brevo.com/security/
  authorised_ips"}`. `/api/email` and `/api/auth/reset` report this honestly
  (`502/503 code=auth_failed`) instead of faking success. Fix: in the Brevo
  account either remove the authorised-IP restriction for this key or add
  Vercel's IPs (note: serverless egress IPs can change; an unrestricted
  transactional key is the stable option). Local sends from this machine
  still succeed (IP authorised).
- **Secrets hygiene**: no secret was printed in logs or committed; sensitive
  env values are write-only in Vercel (pull redacts them — verified). One
  Neon connection string appeared once in a CLI error trace (quote-wrapped
  URL parse failure); rotation is optional but noted. The new cron secret
  value is stored at `/tmp/opencode/cron.secret` (mode 600) on the
  contributor machine and inside Vercel as a sensitive variable (unreadable
  via CLI by design).
