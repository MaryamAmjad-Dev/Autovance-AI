/**
 * Explainability scoresheet: the development team's own assessment of this
 * prototype, using the structure of the XAI scoresheet (Figure 1) from
 * "A Scoresheet for Explainable AI" (Winikoff, Thangarajah & Rodriguez,
 * AAMAS 2025, https://arxiv.org/abs/2502.09861).
 *
 * The paper introduces the scoresheet as a way to SPECIFY explainability
 * requirements or to ASSESS the explainability a system provides, and
 * demonstrates both uses by filling it in for several example systems
 * (§5 of the paper). This module applies the same structure to the
 * Autovance AI workflow proposal prototype, and every row records honestly
 * which explainability aspects the prototype addresses, which it only partly
 * addresses, and which remain unsupported.
 *
 * This is a SELF-ASSESSMENT by the prototype's developers, in the same sense
 * as the paper's own worked examples. It has not been validated by external
 * assessors, and it is not a certification of any kind.
 *
 * Like the rest of lib/, this module is pure data plus pure functions: no
 * I/O, no model calls, unit tested, so the assessment cannot drift silently.
 */

/** Allowed assessment values (single source of truth for data and UI). */
export const SCORE_STATUS = {
  supported: { label: "Addressed", rank: 0 },
  partial: { label: "Partly addressed", rank: 1 },
  unsupported: { label: "Not addressed", rank: 2 },
  not_applicable: { label: "Not applicable", rank: 3 },
};

export const SCORESHEET_CITATION = {
  scoresheet_paper: "https://arxiv.org/abs/2502.09861",
  contrastive_paper: "https://arxiv.org/abs/2602.13323",
  publications: "https://winikoff.github.io/publications.html",
};

/** How this sheet must be read, kept in data so the UI and tests share it. */
export const SCORESHEET_META = {
  kind: "self-assessment",
  assessors: "the development team",
  caveat:
    "This is a self-assessment: the development team's own assessment of this prototype, in the same sense as the worked examples in the paper. It has not been validated by external assessors and is not a certification of any kind.",
};

/**
 * The assessment itself, section by section, mirroring the paper's scoresheet
 * layout: basic information, veracity, global explanations, then local
 * explanations (features, concepts, explanation types, automation).
 */
export const PROTOTYPE_SCORESHEET = [
  {
    id: "basic",
    title: "Basic information",
    items: [
      {
        id: "source-code",
        label: "System source code is available",
        status: "supported",
        note: "The repository is public (linked in the Footer), so the proposal pipeline (prompting, parsing, validation, plan differences, dry run) can be inspected.",
      },
      {
        id: "training-data",
        label: "Is training data used and available?",
        status: "not_applicable",
        note: "The prototype trains no model of its own: it sends requests to a hosted language model through an API, so there is no training data belonging to this system.",
      },
      {
        id: "developers",
        label: "There is access to the system's developers",
        status: "supported",
        note: "This is a team project developed for HEC Generative AI Cohort 3; the development team is reachable through the linked GitHub profile.",
      },
      {
        id: "domain-experts",
        label: "There is access to trusted domain experts",
        status: "unsupported",
        note: "No automation-domain experts were consulted when building the prototype, and none are integrated into its explanation process.",
      },
    ],
  },
  {
    id: "veracity",
    title: "Veracity",
    items: [
      {
        id: "reliability",
        label: "How reliable are the explanations?",
        status: "partial",
        answer: "Low for the model-generated parts, High for the computed parts",
        note: "Beliefs, rationales, assumptions, risks and the alternative are language model output with no link to any executed system, so they reflect no real decision-making process. Validation, plan differences and the dry run are computed directly from the proposal data and correspond exactly to that data.",
      },
      {
        id: "reliability-steps",
        label: "What steps are taken to ensure explanation reliability?",
        status: "partial",
        note: "Model-generated text and computed results are labelled separately on screen; structural validation rejects malformed proposals; the dry run is constructed to have zero side effects. No alignment testing against a real decision-making system has been performed.",
      },
    ],
  },
  {
    id: "global",
    title: "Global explanations",
    items: [
      {
        id: "how-it-works",
        label: "Has information been provided on how does the system work?",
        status: "supported",
        note: "The page and repository document the pipeline: a language model generates a structured proposal, the server parses and validates it, computes the plan differences and the dry run, and labels the source of every part.",
      },
      {
        id: "how-well",
        label: "Has information been provided on how well does it work?",
        status: "partial",
        note: "Stated limitations and per-proposal risks are documented on screen and in every response. No accuracy, usability or trust evaluation of the prototype has been carried out, so no performance figures exist.",
      },
    ],
  },
  {
    id: "local-features",
    title: "Local explanations: features",
    items: [
      {
        id: "customised",
        label: "Explanations can be individually customised",
        status: "unsupported",
        note: "Every user asking the same question receives the same form of explanation; there is no adaptation to role, expertise or requested detail.",
      },
      {
        id: "interactive",
        label: "Explanations are interactive",
        status: "partial",
        note: "A user can steer one contrastive comparison by supplying a foil (asking why this instead of a named alternative), but explanations cannot be elaborated or drilled into step by step.",
      },
      {
        id: "confidence",
        label: "Explanations include an indication of confidence",
        status: "unsupported",
        note: "No confidence values are produced for model-generated content, and the prototype does not estimate uncertainty.",
      },
      {
        id: "scope",
        label: "Explanations include an indication of scope of generalisation",
        status: "partial",
        note: "The stated limitations define the overall scope (structural checks only, dry run is not execution, model text unverified), and per-proposal assumptions and risks are listed, but no scope boundary is computed for a specific decision.",
      },
    ],
  },
  {
    id: "local-concepts",
    title: "Local explanations: concepts used",
    items: [
      { id: "c-beliefs", label: "Beliefs", status: "supported", note: "Extracted context and beliefs, each marked as taken from the user or assumed by the model." },
      { id: "c-goals", label: "Goals", status: "supported", note: "Every proposal states the goal it pursues and the intended outcome." },
      { id: "c-actions", label: "Actions", status: "supported", note: "Plan and alternative steps are typed as trigger, condition, action or review." },
      { id: "c-events", label: "Events or percepts", status: "partial", note: "Trigger steps name the event a workflow listens for, but no live percept stream exists: the prototype never runs." },
      { id: "c-examples", label: "Examples", status: "unsupported", note: "Explanations do not illustrate behaviour with worked examples." },
      { id: "c-features", label: "Features", status: "unsupported", note: "No feature-based (for example data attribute) explanation is produced." },
      { id: "c-preferences", label: "Preferences", status: "unsupported", note: "The prototype elicits no preference model and does not explain via preferences." },
      { id: "c-values", label: "Values", status: "unsupported", note: "No value-based justification is part of the explanation format." },
      { id: "c-other", label: "Other concepts", status: "supported", note: "Workflow plans, per-step rationales and deterministic dry-run outcomes are the prototype's own explanatory concepts." },
    ],
  },
  {
    id: "local-types",
    title: "Local explanations: explanation types",
    items: [
      { id: "t-did", label: "Factual past: Did?", status: "unsupported", note: "Nothing is ever executed, so there is no past behaviour to explain; the dry run is explicitly a preview, not a record." },
      { id: "t-why", label: "Factual past: Why?", status: "unsupported", note: "Step rationales explain a proposal, not an execution, so no past why-question about real behaviour can be answered." },
      { id: "t-whynot", label: "Factual past: Why not?", status: "partial", note: "The computed difference shows which steps the alternative contains that the proposal lacks, but no causal why-not reasoning is derived." },
      { id: "t-contrastive", label: "Factual past: Contrastive", status: "supported", note: "A user-supplied foil makes the comparison answer why this plan instead of that one, with the structural differences computed deterministically (cf. the contrastive explanation paper)." },
      { id: "t-will", label: "Future looking: Will?", status: "supported", note: "The dry run states what each step would do, with zero external actions, computed from the step list." },
      { id: "t-fwhy", label: "Future looking: Why?", status: "supported", note: "Each step carries a rationale for why it belongs in the plan, and the proposal states the goal the plan pursues (model-generated, unverified)." },
      { id: "t-fwhynot", label: "Future looking: Why not?", status: "partial", note: "Same limits as the factual form: differences are listed, causation is not derived." },
      { id: "t-fcontrastive", label: "Future looking: Contrastive", status: "supported", note: "The alternative plan plus the deterministic difference and trade-offs answer why this approach is preferred over the named other approach." },
      { id: "t-whatif", label: "Hypothetical: What-if?", status: "unsupported", note: "No counterfactual simulation is performed: changing conditions and re-running is not supported." },
      { id: "t-howtobe", label: "Hypothetical: How to be?", status: "unsupported", note: "The prototype cannot derive the inputs needed to reach a different outcome." },
      { id: "t-howstill", label: "Hypothetical: How to still be?", status: "unsupported", note: "The prototype cannot identify which changes would leave the outcome unchanged." },
    ],
  },
  {
    id: "automation",
    title: "Level of automation",
    items: [
      {
        id: "automation-level",
        label: "Is explanation generation from questions automated?",
        status: "supported",
        answer: "Fully automated",
        note: "A question (a description plus an optional contrastive foil) automatically produces the proposal with all explanation sections when a model provider is configured; nothing has to be assembled by hand. When no provider is configured, the request fails honestly instead of answering.",
      },
    ],
  },
];

/**
 * Count assessment rows by status. Pure and total: the summary line in the UI
 * is always derived from the data above, never typed by hand.
 */
export function summariseScoresheet(sections) {
  const counts = { supported: 0, partial: 0, unsupported: 0, not_applicable: 0 };
  let total = 0;
  const list = Array.isArray(sections) ? sections : [];
  for (const section of list) {
    const items = section && Array.isArray(section.items) ? section.items : [];
    for (const item of items) {
      if (item && Object.prototype.hasOwnProperty.call(counts, item.status)) {
        counts[item.status] += 1;
        total += 1;
      }
    }
  }
  return { ...counts, total };
}
