// Form definitions + submission validation for the Form Actions feature.
//
// The schema is stored server-side (data/form-schema.json); the browser only
// receives the public schema. Submissions are validated on the server against
// that schema — client-side checks are for convenience only.

export const FORM_FIELD_TYPES = ["text", "email", "number", "textarea", "select"];
const MAX_FIELDS = 30;

export const DEFAULT_FORM = {
  name: "Contact form",
  fields: [
    { name: "name", label: "Name", type: "text", required: true, maxLength: 120 },
    { name: "email", label: "Email", type: "email", required: true, maxLength: 254 },
    { name: "message", label: "Message", type: "textarea", required: true, maxLength: 2000 }
  ]
};

const NAME_RE = /^[a-z][a-z0-9_-]{0,29}$/;

/** Validate a form definition (field configuration). */
export function validateFormSchema(schema) {
  const errors = {};
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { ok: false, errors: { schema: "Form definition must be an object." } };
  }

  const name = typeof schema.name === "string" ? schema.name.trim() : "";
  if (!name || name.length > 80) errors.name = "Form name is required (max 80 characters).";

  const fields = Array.isArray(schema.fields) ? schema.fields : null;
  if (!fields || fields.length === 0) {
    errors.fields = "At least one field is required.";
  } else if (fields.length > MAX_FIELDS) {
    errors.fields = `Too many fields (max ${MAX_FIELDS}).`;
  } else {
    const seen = new Set();
    fields.forEach((field, i) => {
      const label = `Field ${i + 1}`;
      if (!field || typeof field !== "object") {
        errors[label] = "Invalid field.";
        return;
      }
      const fieldName = typeof field.name === "string" ? field.name.trim() : "";
      if (!NAME_RE.test(fieldName)) {
        errors[label] =
          "Field key must be lowercase letters, digits, _ or - (max 30 chars, starting with a letter).";
      } else if (seen.has(fieldName)) {
        errors[label] = `Duplicate field key "${fieldName}".`;
      } else {
        seen.add(fieldName);
      }
      if (typeof field.label !== "string" || !field.label.trim() || field.label.length > 80) {
        errors[`${label} label`] = "Field label is required (max 80 characters).";
      }
      if (!FORM_FIELD_TYPES.includes(field.type)) {
        errors[`${label} type`] = `Type must be one of: ${FORM_FIELD_TYPES.join(", ")}.`;
      }
      if (field.type === "select") {
        const options = Array.isArray(field.options) ? field.options : [];
        if (options.length === 0 || options.length > 20 || options.some((o) => typeof o !== "string" || !o.trim())) {
          errors[`${label} options`] = "Select fields need 1-20 non-empty text options.";
        }
      }
      if (field.required !== undefined && typeof field.required !== "boolean") {
        errors[`${label} required`] = '"required" must be true or false.';
      }
      if (field.maxLength !== undefined) {
        const m = Number(field.maxLength);
        if (!Number.isInteger(m) || m < 1 || m > 10000) {
          errors[`${label} maxLength`] = "maxLength must be an integer between 1 and 10000.";
        }
      }
    });
  }

  const clean = {
    name,
    fields: (fields || [])
      .filter((f) => f && typeof f === "object")
      .slice(0, MAX_FIELDS)
      .map((f) => ({
        name: String(f.name || "").trim(),
        label: String(f.label || "").trim().slice(0, 80),
        type: FORM_FIELD_TYPES.includes(f.type) ? f.type : "text",
        required: Boolean(f.required),
        ...(f.type === "select"
          ? { options: (Array.isArray(f.options) ? f.options : []).map(String).slice(0, 20) }
          : {}),
        ...(f.maxLength !== undefined && Number.isInteger(Number(f.maxLength))
          ? { maxLength: Number(f.maxLength) }
          : { maxLength: f.type === "textarea" ? 2000 : 500 })
      }))
  };

  return { ok: Object.keys(errors).length === 0, errors, value: clean };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validate a submission against a schema.
 * Returns { ok, errors: {fieldName: message}, cleaned } — unknown fields are
 * dropped, so extra posted values can never be stored.
 */
export function validateSubmission(schema, values) {
  const errors = {};
  const cleaned = {};
  if (!schema || !Array.isArray(schema.fields)) {
    return { ok: false, errors: { schema: "Form is not configured." }, cleaned };
  }
  const input = values && typeof values === "object" && !Array.isArray(values) ? values : {};

  for (const field of schema.fields) {
    const raw = input[field.name];
    const value = typeof raw === "string" ? raw.trim() : raw === undefined || raw === null ? "" : String(raw).trim();
    const max = Number.isInteger(field.maxLength) ? field.maxLength : 500;

    if (!value) {
      if (field.required) errors[field.name] = `${field.label} is required.`;
      else cleaned[field.name] = "";
      continue;
    }
    if (value.length > max) {
      errors[field.name] = `${field.label} must be at most ${max} characters.`;
      continue;
    }
    if (field.type === "email" && !EMAIL_RE.test(value)) {
      errors[field.name] = `${field.label} must be a valid email address.`;
      continue;
    }
    if (field.type === "number" && !Number.isFinite(Number(value))) {
      errors[field.name] = `${field.label} must be a number.`;
      continue;
    }
    if (field.type === "select" && Array.isArray(field.options) && !field.options.includes(value)) {
      errors[field.name] = `${field.label} must be one of the provided options.`;
      continue;
    }
    cleaned[field.name] = value;
  }

  return { ok: Object.keys(errors).length === 0, errors, cleaned };
}
