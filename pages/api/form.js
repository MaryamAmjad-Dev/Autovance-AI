// Form Actions API (session required).
//
//   GET  -> current form definition + whether a follow-up action is configured
//   PUT  -> save a new field configuration  { name, fields }
//   POST -> submit a response               { values }
//
// Submissions are validated server-side against the stored definition, stored
// in the store (via lib/store.js), and (only if FORM_FOLLOWUP_WEBHOOK_URL is set)
// forwarded to that URL through the SSRF-safe fetcher. When no follow-up is
// configured the API says so instead of inventing an action.

import crypto from "crypto";
import { store } from "../../lib/store.js";
import { getUserFromRequest } from "../../lib/auth.js";
import {
  DEFAULT_FORM,
  validateFormSchema,
  validateSubmission
} from "../../lib/forms.js";
import { safeFetch, SafeFetchError } from "../../lib/safeFetch.js";

const MAX_STORED_SUBMISSIONS = 200;

async function currentSchema() {
  const stored = await store().get("form-schema", null);
  if (stored && Array.isArray(stored.fields)) return stored;
  return DEFAULT_FORM;
}

export default async function handler(req, res) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Not authenticated. Log in first." });
  }

  const followupUrl = process.env.FORM_FOLLOWUP_WEBHOOK_URL || "";

  if (req.method === "GET") {
    // `GET ?submissions=1` additionally returns the stored responses so the
    // UI can actually show what was saved (they are otherwise write-only).
    // Requires the same session as every other call on this route.
    const wantsSubmissions = req.query && req.query.submissions === "1";
    let submissions = [];
    let total = 0;
    if (wantsSubmissions) {
      const stored = await store().get("form-submissions", []);
      total = stored.length;
      submissions = stored.slice(0, 20);
    }
    return res.status(200).json({
      ok: true,
      schema: await currentSchema(),
      followupConfigured: Boolean(followupUrl),
      ...(wantsSubmissions ? { submissions, total } : {})
    });
  }

  if (req.method === "PUT") {
    const { ok, errors, value } = validateFormSchema(req.body || {});
    if (!ok) {
      return res.status(400).json({ ok: false, errors, message: "Invalid form configuration." });
    }
    await store().set("form-schema", value);
    return res.status(200).json({ ok: true, schema: value });
  }

  if (req.method === "POST") {
    const schema = await currentSchema();
    const { ok, errors, cleaned } = validateSubmission(schema, (req.body && req.body.values) || {});
    if (!ok) {
      return res.status(422).json({
        ok: false,
        errors,
        message: "Some fields need attention."
      });
    }

    const submission = {
      id: `sub_${crypto.randomBytes(6).toString("hex")}`,
      submittedAt: new Date().toISOString(),
      submittedBy: user.email,
      values: cleaned
    };
    let storedCount = 0;
    await store().update("form-submissions", [], (submissions) => {
      submissions.unshift(submission);
      submissions.splice(MAX_STORED_SUBMISSIONS);
      storedCount = submissions.length;
    });

    // Optional follow-up action — reported exactly as it happens.
    let followup = { executed: false, reason: "not_configured" };
    if (followupUrl) {
      try {
        const result = await safeFetch(followupUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ form: schema.name, submission }),
          timeoutMs: 10000
        });
        followup = {
          executed: true,
          ok: result.ok,
          status: result.status,
          summary: `HTTP ${result.status} in ${result.ms}ms`
        };
      } catch (err) {
        followup = {
          executed: true,
          ok: false,
          summary:
            err instanceof SafeFetchError
              ? `Blocked/failed: ${err.message}`
              : `Failed: ${(err && err.message) || "unknown error"}`
        };
      }
    }

    return res.status(201).json({
      ok: true,
      submission: { id: submission.id, storedAt: submission.submittedAt },
      storedCount,
      followup
    });
  }

  res.setHeader("Allow", "GET, PUT, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed." });
}
