// Language support for the Email Automation feature.
//
// Pure data + pure functions so language behaviour is unit testable without
// any network or provider. The configured model decides what it can actually
// produce; these helpers only (a) state the requirement clearly in the prompt,
// (b) render the right direction/lan attributes, and (c) run an ADVISORY
// script check for Urdu — a mismatch is reported as a hint, never as a
// guarantee that the other languages are correct (no reliable detector exists
// for English vs Roman Urdu, so none is claimed).

export const EMAIL_LANGUAGES = [
  {
    id: "english",
    label: "English",
    dir: "ltr",
    lang: "en",
    rtl: false,
    checkScript: false,
    instruction:
      "Write the entire email in clear, professional English."
  },
  {
    id: "urdu",
    label: "Urdu (اردو)",
    dir: "rtl",
    lang: "ur",
    rtl: true,
    checkScript: true,
    instruction:
      "Write the entire email in Urdu using Urdu script (Nastaliq). Keep brand names and technical terms in English where that reads naturally."
  },
  {
    id: "roman-urdu",
    label: "Roman Urdu",
    dir: "ltr",
    lang: "ur-Latn",
    rtl: false,
    checkScript: false,
    instruction:
      "Write the entire email in Roman Urdu (Urdu written with Latin letters, as commonly typed), keeping English technical terms where natural."
  }
];

export function getLanguage(id) {
  return EMAIL_LANGUAGES.find((l) => l.id === id) || EMAIL_LANGUAGES[0];
}

/**
 * Build the prompt sent to /api/ai. The first line asks for a subject so a
 * model that complies yields an in-language subject; parsing tolerates models
 * that ignore it (see parseGeneratedEmail).
 */
export function buildEmailPrompt(topic, languageId) {
  const lang = getLanguage(languageId);
  return (
    `Write a professional email about: ${topic}\n\n` +
    `Language requirement: ${lang.instruction}\n` +
    `Start with a line beginning exactly with "Subject:", followed by a blank line, ` +
    `then the email body. Return plain text only: no markdown, no code, no salutation headers beyond the body itself.`
  );
}

/**
 * Split a model response into { subject, body }.
 * If the model ignored the "Subject:" instruction the whole text stays the
 * body and subject is "" — nothing is invented.
 */
export function parseGeneratedEmail(raw) {
  const text = typeof raw === "string" ? raw : "";
  const match = text.match(/^\s*subject\s*:\s*(.+)\s*\n[\s\n]*([\s\S]*)$/i);
  if (!match) return { subject: "", body: text };
  return { subject: match[1].trim().slice(0, 200), body: match[2] };
}

/** Advisory only: does the text contain any Urdu/Arabic-script characters? */
export function containsUrduScript(text) {
  return /[\u0600-\u06FF]/.test(String(text || ""));
}

/**
 * Returns true when the language REQUESTED was Urdu but the generated text
 * contains no Urdu script — i.e. a likely language mismatch worth flagging.
 * Always advisory: the UI shows a hint, it never blocks or auto-translates.
 */
export function likelyLanguageMismatch(text, languageId) {
  const lang = getLanguage(languageId);
  if (!lang.checkScript) return false; // no reliable check for other languages
  return !containsUrduScript(text);
}

const escapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => escapeMap[ch]);
}

/**
 * HTML part used alongside the plain text when the email is RTL, so Urdu
 * (and any mixed Urdu/English content) renders right-to-left with correct
 * bidi handling in mail clients. User content is HTML-escaped.
 */
export function buildRtlHtml(text, languageId) {
  const lang = getLanguage(languageId);
  return (
    `<div dir="rtl" lang="${lang.lang}" ` +
    `style="white-space:pre-wrap;font-family:Tahoma,Arial,sans-serif;">` +
    `${escapeHtml(text)}</div>`
  );
}
