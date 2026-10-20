// Unit tests for lib/emailLanguage.js — pure language helpers for the
// Email Automation feature. No network, no provider, no model.
// Run with: npm test
import assert from "node:assert";
import {
  EMAIL_LANGUAGES,
  getLanguage,
  buildEmailPrompt,
  parseGeneratedEmail,
  containsUrduScript,
  likelyLanguageMismatch,
  escapeHtml,
  buildRtlHtml,
} from "../lib/emailLanguage.js";

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

test("exactly three languages with the right direction/script metadata", () => {
  assert.deepStrictEqual(EMAIL_LANGUAGES.map((l) => l.id), ["english", "urdu", "roman-urdu"]);
  const english = getLanguage("english");
  assert.strictEqual(english.dir, "ltr");
  assert.strictEqual(english.checkScript, false);
  const urdu = getLanguage("urdu");
  assert.strictEqual(urdu.dir, "rtl");
  assert.strictEqual(urdu.rtl, true);
  assert.strictEqual(urdu.checkScript, true);
  assert.strictEqual(urdu.lang, "ur");
  const roman = getLanguage("roman-urdu");
  assert.strictEqual(roman.dir, "ltr");
  assert.strictEqual(roman.rtl, false);
  assert.strictEqual(roman.checkScript, false, "no script check is claimed for Roman Urdu");
  assert.strictEqual(roman.lang, "ur-Latn");
});

test("getLanguage falls back to English for unknown or missing ids", () => {
  assert.strictEqual(getLanguage("klingon").id, "english");
  assert.strictEqual(getLanguage(undefined).id, "english");
  assert.strictEqual(getLanguage(null).id, "english");
});

test("buildEmailPrompt states the topic, the language requirement, and the Subject contract", () => {
  const p = buildEmailPrompt("a payment reminder", "english");
  assert.ok(p.includes("a payment reminder"));
  assert.ok(p.includes("Language requirement:"));
  assert.ok(p.includes('"Subject:"'), "asks for a subject line");
  assert.ok(p.includes(getLanguage("english").instruction));
  assert.ok(p.includes("plain text only"));
});

test("each language produces a distinct prompt with its own instruction", () => {
  const prompts = EMAIL_LANGUAGES.map((l) => buildEmailPrompt("same topic", l.id));
  assert.strictEqual(new Set(prompts).size, 3, "prompts must differ per language");
  assert.ok(buildEmailPrompt("t", "urdu").includes(getLanguage("urdu").instruction));
  assert.ok(buildEmailPrompt("t", "roman-urdu").includes(getLanguage("roman-urdu").instruction));
});

test("parseGeneratedEmail splits a Subject: line from the body", () => {
  const r = parseGeneratedEmail("Subject: Hello there\n\nBody line 1\nBody line 2");
  assert.strictEqual(r.subject, "Hello there");
  assert.strictEqual(r.body, "Body line 1\nBody line 2");
});

test("parseGeneratedEmail invents nothing when the model ignores the Subject instruction", () => {
  const r = parseGeneratedEmail("Just prose, no subject line.");
  assert.strictEqual(r.subject, "");
  assert.strictEqual(r.body, "Just prose, no subject line.");
  assert.deepStrictEqual(parseGeneratedEmail(null), { subject: "", body: "" });
  assert.deepStrictEqual(parseGeneratedEmail(42), { subject: "", body: "" });
});

test("parsed subject is capped at 200 characters", () => {
  const long = "Subject: " + "x".repeat(500) + "\n\nbody";
  assert.strictEqual(parseGeneratedEmail(long).subject.length, 200);
});

test("containsUrduScript detects Urdu/Arabic script only", () => {
  assert.strictEqual(containsUrduScript("اردو میں خوش آمدید"), true);
  assert.strictEqual(containsUrduScript("Hello world"), false);
  assert.strictEqual(containsUrduScript(""), false);
  assert.strictEqual(containsUrduScript(null), false);
});

test("likelyLanguageMismatch is advisory and only ever fires for requested Urdu", () => {
  // Requested Urdu, Latin-only output: flag a likely mismatch.
  assert.strictEqual(likelyLanguageMismatch("This came back in English", "urdu"), true);
  // Requested Urdu with Urdu script: no flag.
  assert.strictEqual(likelyLanguageMismatch("یہ اردو ہے", "urdu"), false);
  // No check is claimed for the other languages (nothing reliable exists).
  assert.strictEqual(likelyLanguageMismatch("Latin text", "english"), false);
  assert.strictEqual(likelyLanguageMismatch("Latin text", "roman-urdu"), false);
  assert.strictEqual(likelyLanguageMismatch("", "english"), false);
});

test("escapeHtml escapes every HTML-special character", () => {
  assert.strictEqual(escapeHtml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  assert.strictEqual(escapeHtml("plain"), "plain");
});

test("buildRtlHtml wraps escaped content with dir/lang attributes", () => {
  const html = buildRtlHtml("<b>سلام</b>", "urdu");
  assert.ok(html.includes('dir="rtl"'));
  assert.ok(html.includes('lang="ur"'));
  assert.ok(html.includes("white-space:pre-wrap"));
  assert.ok(!html.includes("<b>"), "content must be escaped, never raw HTML");
  assert.ok(html.includes("&lt;b&gt;"));
});

console.log(`emailLanguage: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
