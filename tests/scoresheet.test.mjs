// Unit tests for lib/explainabilityScoresheet.js.
// These guard the research honesty of the self-assessment: the scoresheet
// must stay faithful to the paper's structure, use only the allowed status
// vocabulary, and never grow claims of verification or faithfulness.
// Run with: npm test
import assert from "node:assert";
import {
  PROTOTYPE_SCORESHEET,
  SCORE_STATUS,
  SCORESHEET_CITATION,
  SCORESHEET_META,
  summariseScoresheet,
} from "../lib/explainabilityScoresheet.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("PASS", name);
  } catch (e) {
    failed++;
    console.log("FAIL", name, "->", e.message);
  }
}

const allItems = PROTOTYPE_SCORESHEET.flatMap((s) =>
  s.items.map((item) => ({ section: s.id, ...item }))
);

test("scoresheet sections follow the paper's structure", () => {
  const ids = PROTOTYPE_SCORESHEET.map((s) => s.id);
  assert.deepStrictEqual(ids, [
    "basic",
    "veracity",
    "global",
    "local-features",
    "local-concepts",
    "local-types",
    "automation",
  ]);
});

test("every item has id, label, status, and an evidence note", () => {
  assert.ok(allItems.length >= 20, `expected a substantial sheet, got ${allItems.length}`);
  for (const item of allItems) {
    assert.ok(item.id && typeof item.id === "string", `bad id in ${item.section}`);
    assert.ok(item.label && item.label.length >= 5, `bad label for ${item.id}`);
    assert.ok(
      Object.prototype.hasOwnProperty.call(SCORE_STATUS, item.status),
      `status "${item.status}" for ${item.id} is outside the vocabulary`
    );
    assert.ok(
      typeof item.note === "string" && item.note.length > 20,
      `missing evidence note for ${item.id}`
    );
  }
});

test("statuses are unique per section", () => {
  for (const section of PROTOTYPE_SCORESHEET) {
    const ids = section.items.map((i) => i.id);
    assert.strictEqual(new Set(ids).size, ids.length, `duplicate item id in ${section.id}`);
  }
});

test("veracity is NOT claimed as high for model-generated text", () => {
  const reliability = allItems.find((i) => i.id === "reliability");
  assert.ok(reliability, "reliability row must exist");
  assert.strictEqual(reliability.status, "partial");
  assert.match(reliability.answer, /Low/, "answer must state Low for the model parts");
  assert.match(reliability.note, /no link to any executed system/i);
});

test("unsupported rows really are unsupported (no accidental upgrades)", () => {
  const byId = Object.fromEntries(allItems.map((i) => [i.id, i]));
  // Confidence indications: absent, per the honest self-assessment.
  assert.strictEqual(byId.confidence.status, "unsupported");
  // Hypothetical question forms: not implemented.
  assert.strictEqual(byId["t-whatif"].status, "unsupported");
  assert.strictEqual(byId["t-howtobe"].status, "unsupported");
  assert.strictEqual(byId["t-howstill"].status, "unsupported");
  // Past execution questions: nothing ever runs, so these cannot be supported.
  assert.strictEqual(byId["t-did"].status, "unsupported");
  assert.strictEqual(byId["t-why"].status, "unsupported");
});

test("contrastive and deterministic rows match the implementation", () => {
  const byId = Object.fromEntries(allItems.map((i) => [i.id, i]));
  assert.strictEqual(byId["t-contrastive"].status, "supported");
  assert.strictEqual(byId["t-fcontrastive"].status, "supported");
  assert.match(byId["t-contrastive"].note, /deterministically/i);
});

test("notes never claim verification, faithfulness, or guarantees", () => {
  const notes = allItems
    .map((i) => `${i.label} ${i.note}${i.answer ? " " + i.answer : ""}`)
    .join(" ")
    .toLowerCase()
    // "unverified" is the honest label used throughout; strip it before
    // checking for standalone overclaim words.
    .replace(/unverified/g, "");
  for (const banned of ["faithful", "guaranteed", "formally verified", "certified", "verified by"]) {
    assert.ok(!notes.includes(banned), `scoresheet must not contain "${banned}"`);
  }
  assert.ok(!/\bverified\b/.test(notes), "standalone 'verified' must not appear");
});

test("self-assessment framing is present in the data", () => {
  assert.strictEqual(SCORESHEET_META.kind, "self-assessment");
  assert.match(SCORESHEET_META.caveat, /not been validated by external assessors/i);
  assert.ok(SCORESHEET_META.assessors.length > 0);
});

test("citation links point at the two papers and the publications page", () => {
  assert.strictEqual(SCORESHEET_CITATION.scoresheet_paper, "https://arxiv.org/abs/2502.09861");
  assert.strictEqual(SCORESHEET_CITATION.contrastive_paper, "https://arxiv.org/abs/2602.13323");
  assert.strictEqual(SCORESHEET_CITATION.publications, "https://winikoff.github.io/publications.html");
});

test("summariseScoresheet counts every row exactly once", () => {
  const s = summariseScoresheet(PROTOTYPE_SCORESHEET);
  assert.strictEqual(s.total, allItems.length);
  assert.strictEqual(
    s.supported + s.partial + s.unsupported + s.not_applicable,
    allItems.length
  );
  assert.ok(s.supported > 0 && s.unsupported > 0, "an honest sheet has both");
});

test("summariseScoresheet never throws on garbage input", () => {
  assert.deepStrictEqual(summariseScoresheet(null), {
    supported: 0, partial: 0, unsupported: 0, not_applicable: 0, total: 0,
  });
  assert.deepStrictEqual(summariseScoresheet([{ items: "nope" }]).total, 0);
  assert.deepStrictEqual(summariseScoresheet([{}]).total, 0);
});

console.log(`scoresheet: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
