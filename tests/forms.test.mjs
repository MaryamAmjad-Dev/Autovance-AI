// Unit tests for lib/forms.js — schema validation + submission validation.
// Run with: npm test
import assert from "node:assert";
import {
  DEFAULT_FORM,
  validateFormSchema,
  validateSubmission,
  FORM_FIELD_TYPES,
} from "../lib/forms.js";

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

test("DEFAULT_FORM: is itself a valid schema", () => {
  const r = validateFormSchema(DEFAULT_FORM);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.value.fields.length, 3);
});

test("validateFormSchema: rejects empty/duplicate/invalid fields", () => {
  assert.strictEqual(validateFormSchema(null).ok, false);
  assert.strictEqual(validateFormSchema({ name: "F", fields: [] }).ok, false);

  const dup = validateFormSchema({
    name: "F",
    fields: [
      { name: "a", label: "A", type: "text" },
      { name: "a", label: "B", type: "text" },
    ],
  });
  assert.strictEqual(dup.ok, false);

  const badKey = validateFormSchema({
    name: "F",
    fields: [{ name: "9Bad key!", label: "X", type: "text" }],
  });
  assert.strictEqual(badKey.ok, false);

  const badType = validateFormSchema({
    name: "F",
    fields: [{ name: "a", label: "A", type: "richtext" }],
  });
  assert.strictEqual(badType.ok, false);

  const selectNoOptions = validateFormSchema({
    name: "F",
    fields: [{ name: "a", label: "A", type: "select", options: [] }],
  });
  assert.strictEqual(selectNoOptions.ok, false);
});

test("validateFormSchema: cleans and normalizes a good schema", () => {
  const r = validateFormSchema({
    name: "  Survey  ",
    fields: [
      { name: "age", label: " Age ", type: "number", required: true },
      { name: "city", label: "City", type: "select", options: ["Lahore", "Islamabad"] },
    ],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.value.name, "Survey");
  assert.strictEqual(r.value.fields[0].name, "age");
  assert.strictEqual(r.value.fields[0].label, "Age");
  assert.strictEqual(r.value.fields[0].maxLength, 500); // default applied
  assert.deepStrictEqual(r.value.fields[1].options, ["Lahore", "Islamabad"]);
});

test("validateSubmission: required fields produce per-field errors", () => {
  const r = validateSubmission(DEFAULT_FORM, { name: "", email: "", message: "" });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.name);
  assert.ok(r.errors.email);
  assert.ok(r.errors.message);
});

test("validateSubmission: email/number/select/maxLength rules enforced", () => {
  const schema = {
    name: "F",
    fields: [
      { name: "mail", label: "Mail", type: "email", required: true, maxLength: 100 },
      { name: "count", label: "Count", type: "number", required: false, maxLength: 100 },
      { name: "plan", label: "Plan", type: "select", required: false, options: ["basic", "pro"], maxLength: 100 },
      { name: "note", label: "Note", type: "text", required: false, maxLength: 5 },
    ],
  };
  assert.ok(validateSubmission(schema, { mail: "not-an-email" }).errors.mail);
  assert.ok(validateSubmission(schema, { mail: "a@b.io", count: "twelve" }).errors.count);
  assert.ok(validateSubmission(schema, { mail: "a@b.io", plan: "enterprise" }).errors.plan);
  assert.ok(validateSubmission(schema, { mail: "a@b.io", note: "way too long" }).errors.note);
  const ok = validateSubmission(schema, { mail: "a@b.io", count: "12", plan: "pro", note: "hi" });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.cleaned.count, "12");
  assert.strictEqual(ok.cleaned.plan, "pro");
});

test("validateSubmission: unknown posted fields are dropped (never stored)", () => {
  const r = validateSubmission(DEFAULT_FORM, {
    name: "A",
    email: "a@b.io",
    message: "Hello",
    is_admin: "true",
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual("is_admin" in r.cleaned, false);
  assert.strictEqual(Object.keys(r.cleaned).length, 3);
});

test("validateSubmission: optional fields may be empty", () => {
  const schema = {
    name: "F",
    fields: [
      { name: "a", label: "A", type: "text", required: true, maxLength: 50 },
      { name: "b", label: "B", type: "text", required: false, maxLength: 50 },
    ],
  };
  const r = validateSubmission(schema, { a: "yes" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.cleaned.b, "");
});

test("FORM_FIELD_TYPES whitelist is stable", () => {
  assert.deepStrictEqual(FORM_FIELD_TYPES, ["text", "email", "number", "textarea", "select"]);
});

console.log(`forms: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
