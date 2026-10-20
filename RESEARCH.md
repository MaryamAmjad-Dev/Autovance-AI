# Research notes: explainable workflow proposals

This document explains what the `/workflows` research prototype does, how it is
built, what it does and does not claim, and how to evaluate it reproducibly.
It exists so another developer can assess the contribution without reading the
whole codebase.

## 1. Purpose and scope of the contribution

The contribution is an **engineering implementation of published explainable
AI evaluation ideas in a workflow-automation product**, not a new XAI method:

- The explainability **scoresheet structure** from Winikoff, Thangarajah and
  Rodriguez, *A Scoresheet for Explainable AI* (AAMAS 2025),
  <https://arxiv.org/abs/2502.09861>, is used as the organising frame for a
  developer self-assessment of which explainability requirements the prototype
  addresses (`lib/explainabilityScoresheet.js`, rendered on `/workflows`).
- The **contrastive question form** ("why this instead of that?") from
  *Contrastive explanations of BDI agents*, <https://arxiv.org/abs/2602.13323>,
  is supported as an optional user-supplied alternative ("foil") against which
  the proposed plan is compared.

No research novelty is claimed merely because the application integrates an
LLM or existing provider APIs. No user study has been conducted, and no
experimental results are reported as fact in this repository.

## 2. Pipeline and methodology

A proposal is produced by `POST /api/propose` with `{ request, context?, foil? }`
and flows through these stages:

1. **Prompt construction (server).** A fixed instruction prompt requires a
   strict JSON object with named sections: `goal`, `outcome`, `context`
   (beliefs), `steps` (each with `action` + `rationale`), `assumptions`,
   `risks`, `missing_information`, and `alternative` (2–5 steps plus
   `tradeoffs`). When a `foil` is present, the prompt requires the alternative
   to *be* that foil rather than an invented one. Input lengths are capped
   server-side.
2. **Provider call.** OpenRouter with the configured `AI_MODEL`, a hard
   timeout, and explicit error mapping (401/403, 404, 429, 5xx, network,
   malformed, empty output). Failures return structured errors; a provider
   failure is never treated as a successful generation.
3. **Extraction and normalisation.** `extractJson` tolerates common model
   wrapping (code fences, leading prose); `normalizeProposal` coerces shapes
   and defaults, without inventing content.
4. **Deterministic post-processing (no model involved):**
   - `validateProposal` — structural validation (required sections, step
     shape, action types);
   - `diffPlans` — the differences between the proposed and alternative plans
     are computed from the data, not narrated by the model;
   - `simulateDryRun` — a zero-side-effect execution preview: nothing is sent,
     scheduled, or written; each planned action is classified and counted.
5. **Presentation (`/workflows`).** Every block carries a source tag:
   `model-generated · unverified`, `model-generated`, or
   `computed deterministically`, introduced by a veracity legend. A
   limitations panel and the scoresheet follow the result.

### What is model-generated vs. computed

| Output | Source | Veracity position |
|--------|--------|-------------------|
| Goal, outcome, context/beliefs, steps + rationales, assumptions, risks, missing info, alternative | LLM | **Low** for the model-generated parts: plausible text, no access to any internal computation, not independently checked |
| Structural validation badge and messages | `validateProposal` | **High** for the computation itself (deterministic code) |
| Plan differences (`diffPlans`) | `diffPlans` | **High** — pure function over the two plans |
| Dry-run preview and external-action count | `simulateDryRun` | **High** — executes nothing; deterministic |
| Contrastive origin reporting (`meta.foil_source`) | server | **High** — records whether the user's foil was supplied |

"High" here means the deterministic code did what its tests say it does; it
does **not** mean the model's underlying proposal is correct or that the plan
will succeed in the real world.

## 3. Scoresheet mapping

`lib/explainabilityScoresheet.js` mirrors the paper's section structure
(basic information, veracity, global, local — features/concepts/types — and
automation) as a table of requirements with an explicit status vocabulary
(`supported`, `partial`, `unsupported`, `not_applicable`), each with an
evidence note. Rendering rules enforced by `tests/scoresheet.test.mjs`:

- it is labelled a **developer self-assessment**, not a certification or
  independent evaluation;
- notes may not claim verification, faithfulness, guarantees, or
  certification;
- known gaps (confidence estimates, hypothetical and past-execution
  questions, customisation, domain-expert input) are marked unsupported and
  tests lock them against silent "upgrades";
- the veracity item explicitly answers "Low for the model-generated parts,
  High for the computed parts".

## 4. Contrastive support

- The UI field is labelled "Contrastive question (optional)" and accepts the
  user's own alternative. When present, the model must use it as the
  `alternative`, and the server records the origin in `meta.foil_source`.
- Differences between the two plans are computed deterministically and shown
  under "Why the proposed plan differs" (tagged as computed).
- **Supported:** future-oriented contrastive questions about the generated
  plan (why this rather than your supplied alternative).
- **Not supported (stated in the UI and scoresheet):** hypothetical
  ("what if…"), past ("why did it…"), and confidence questions; there is no
  execution history analysis or calibrated confidence behind the text.

## 5. Limitations

1. **Model-generated rationales are unverified.** The LLM has no internal
   computation of this workflow to describe; rationales are plausible text
   conditioned on the request. They are labelled unverified everywhere and
   must not be read as faithful or causally correct accounts.
2. **No formal BDI implementation.** The proposal structure is *BDI-inspired*
   (goal/beliefs-as-context/steps); no agent architecture, intention
   selection loop, or formal semantics from the BDI literature is implemented.
3. **Structural validation ≠ semantic correctness.** `validateProposal`
   checks shape and required fields, not whether the plan is sensible.
4. **Dry run executes nothing.** By design it can only predict side-effect
   categories, never outcomes of real calls.
5. **No human evaluation yet.** No user study, expert review, or corpus
   annotation has been performed (see §6 for the plan).
6. **Upstream dependence.** Free-tier provider capacity is finite; 429s are
   surfaced verbatim and limit how much data a run can collect.
7. **Single-process prototype storage.** Results collected per run live
   outside the app (see §6); the app's `data/` store holds users, jobs, and
   submissions, not evaluation data.

## 6. Evaluation plan (reproducible, scenario-based)

Nothing in this section has been executed as a study; it defines the procedure
and metrics so that a run is reproducible and its results are unambiguous.
**Reported results: none yet.**

A runnable harness now implements this plan:

```bash
node scripts/evaluate.mjs plan    # frozen 72-request plan + suite hash (offline)
node scripts/evaluate.mjs run     # execute against a running app; raw outputs
                                  # stored under evaluation/<runId>/ (git-ignored)
node scripts/evaluate.mjs score evaluation/<runId>  # recompute metrics from
                                  # stored records only (no model calls)
```

The suite (8 scenarios × plain/context/foil × repetitions) is frozen in
`lib/evaluation.js` with a recorded sha256 suite hash; scoring rules (M1–M4,
M6, M8) are implemented as pure functions in the same module and locked by
`tests/evaluation.test.mjs`. When no model output is produced (no key, HTTP
429, upstream failure), the generated `REPORT.md` states **RESULTS PENDING /
BLOCKED** and reports every metric as *pending* — never as zero — and the run
records are retained verbatim. M5 comes from the offline test suite, M7
requires two human raters and is always reported separately.

### 6.1 Metrics

| # | Metric | How it is measured | Target |
|---|--------|--------------------|--------|
| M1 | Structural validity rate | `validateProposal(proposal).valid` per run: valid / total | ≥ 90% of parsed runs |
| M2 | Parse robustness | `extractJson` succeeds / total responses | ≥ 95% |
| M3 | Determinism of computed parts | Re-run `diffPlans` + `simulateDryRun` on the same stored proposal 100×; compare serialized outputs | 100% identical (asserted by tests) |
| M4 | Foil compliance | For foil runs, fraction where `meta.foil_source` reports the foil was used as the alternative, confirmed by reading the alternative label/tradeoffs | 100% server-side; ≥ 80% judged "clearly about my foil" on manual read |
| M5 | Failure honesty | Induce failures (missing key, wrong key → 401, unknown model → 404, throttling → 429) and check the machine `error` code and human message match the real cause | 100% correct codes (covered by tests for the mapping logic) |
| M6 | Explainability coverage | `summariseScoresheet()` counts (supported / partial / unsupported / not applicable) tracked per release | no decrease without a documented reason |
| M7 | Rationale groundedness (manual) | Two raters score each rationale 0–2 (0 = generic, 1 = partly request-specific, 2 = clearly about this request); report mean and inter-rater agreement (Cohen's κ) | mean ≥ 1.5; κ ≥ 0.6 |
| M8 | Operational cost | p50/p95 latency per proposal; count of HTTP 429 during the run window | reported, no target |

### 6.2 Scenario suite

Eight scenarios, each run in three variants (plain / with `context` / with a
`foil`), 3 repetitions per variant = **72 proposals** per full run:

1. "When an invoice email arrives, check its details and prepare a reply for human review."
2. "Every failed payment webhook should be retried, then escalated to email."
3. "Sync new CRM contacts into our mailing list every night."
4. "When the contact form is submitted, store it and notify the sales alias."
5. "Flag expired inventory rows daily and post a digest to our team chat."
6. "On signup, send a welcome email and create an onboarding task." (foil: "…instead of a single combined welcome email.")
7. "Back up exported reports weekly to remote storage." (foil: "…instead of keeping them only locally.")
8. "Escalate support tickets untouched for 24 hours." (context: ticket volume, on-call rotation; foil: "…instead of a 12-hour reminder.")

### 6.3 Procedure

1. `npm test` — tooling correctness (validation, diffing, dry run, error
   mapping, scoresheet honesty guards) must pass first. These tests are
   offline/mocked and say nothing about model quality.
2. Configure `.env.local` (`OPENROUTER_API_KEY`, `AI_MODEL`) and confirm live
   capacity with one request; a 429 means the run cannot start yet.
3. For each scenario variant, `POST /api/propose` with `request`, `context`,
   `foil` (as applicable); store each raw response JSON verbatim (request
   inputs included) in a dated results directory outside `data/` (e.g.
   `evaluation/<date>/`). Never overwrite previous runs.
4. Compute M1–M4 and M8 directly from the stored JSON (server fields plus
   `validateProposal`/`extractJson` re-execution). M3 and M5 come from the test
   suite runs; record the test output alongside the results directory.
5. For M7, export the rationales to a sheet, strip scenario metadata, and have
   two raters score independently per the rubric in §6.1; record both raw
   score columns and the κ computation.
6. Report all metrics with the exact scenario file hashes and the model slug;
   mark any scenario where the provider returned an error as "unavailable"
   rather than dropping it silently.

## 7. References

- Winikoff, M., Thangarajah, J., Rodriguez, R. *A Scoresheet for Explainable
  AI*. AAMAS 2025. <https://arxiv.org/abs/2502.09861>
- *Contrastive explanations of BDI agents*.
  <https://arxiv.org/abs/2602.13323>
- Winikoff publications page: <https://winikoff.github.io/publications.html>
