// Maps AI request failures from /api/ai (and the AI parts of feature pages)
// to clear, honest user-facing messages. Pure function so it can be unit
// tested with mocked provider responses.
//
// Rules:
//   - never invent or soften a failure (no success wording when the provider
//     failed),
//   - name configuration variables, never values,
//   - prefer the server's message when it already explains the failure.

export function describeAiFailure(status, data) {
  const payload = data && typeof data === "object" ? data : {};
  const code = typeof payload.error === "string" ? payload.error : "";

  // Configuration messages only when the server explicitly said so (the
  // missing_environment_variable / model_not_found codes). Attributing a
  // bare 503/404 to a configuration problem would invent a cause, which
  // this module must never do.
  if (code === "missing_environment_variable") {
    const name = payload.variable || "OPENROUTER_API_KEY";
    return `The AI service is not configured on this server. Set the ${name} environment variable to enable it.`;
  }

  if (status === 429 || code === "rate_limited") {
    return (
      payload.message ||
      "The AI provider is rate limiting requests (HTTP 429). This may be a rate limit, exhausted free-tier capacity, or provider capacity limits. Please wait a few minutes and try again."
    );
  }

  if (code === "auth_failed" || status === 401 || status === 403) {
    return (
      payload.message ||
      `The AI provider rejected the server credentials (HTTP ${status}). Check the OPENROUTER_API_KEY configuration.`
    );
  }

  if (code === "model_not_found") {
    return (
      payload.message ||
      "The configured AI model was not found (HTTP 404). Check the AI_MODEL configuration."
    );
  }

  if (code === "invalid_request" || status === 400) {
    return payload.message || "The AI request was invalid. Adjust the prompt and try again.";
  }

  if (code === "upstream_failure" || status === 502) {
    return payload.message || "The AI provider could not complete the request. Try again shortly.";
  }

  if (status === 503 && payload.variable) {
    // 503 carrying a variable name: still a configuration report.
    return `The AI service is not configured on this server. Set the ${payload.variable} environment variable to enable it.`;
  }

  if (status === 503) {
    // Upstream availability (or proxy) problem — NOT necessarily our config.
    return payload.message || "The AI service is temporarily unavailable (HTTP 503). Try again shortly.";
  }

  if (status === 404) {
    return payload.message || "The AI endpoint or model returned not found (HTTP 404). Try again shortly.";
  }

  if (status === 0 || code === "network") {
    return "Network error while contacting the AI service. Check your connection and try again.";
  }

  return payload.message || `The AI request failed${status ? ` (HTTP ${status})` : ""}. Try again shortly.`;
}
