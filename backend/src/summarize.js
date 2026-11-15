import { SYSTEM_PROMPT, SUMMARY_SCHEMA, buildUserMessage } from "./prompt.js";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** A failure the app can show to the user; `code` is part of the API contract (docs/api.md). */
export class SummaryError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Claude Haiku has no server-side refusal fallback, so the parameter is only sent to other models. */
function supportsServerFallback(model) {
  return !model.startsWith("claude-haiku");
}

const text = value => (typeof value === "string" ? value.trim() : "");
const textList = (value, max) => (Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, max) : []);

/** Checks the model's JSON and trims it to the limits the app expects. */
export function normalizeSummary(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SummaryError("bad_output", 502, "The summary is not a JSON object.");
  }
  const summary = {
    isSermon: raw.isSermon === true,
    title: text(raw.title),
    bigIdea: text(raw.bigIdea),
    outline: (Array.isArray(raw.outline) ? raw.outline : [])
      .map(point => ({ point: text(point?.point), details: textList(point?.details, 4) }))
      .filter(point => point.point)
      .slice(0, 6),
    scriptures: textList(raw.scriptures, 20),
    applications: textList(raw.applications, 4),
    questions: textList(raw.questions, 3),
    prayer: text(raw.prayer),
  };
  if (summary.isSermon && (!summary.title || !summary.bigIdea || summary.outline.length === 0)) {
    throw new SummaryError("bad_output", 502, "The summary is missing its title, big idea or outline.");
  }
  return summary;
}

/**
 * Sends one transcript to Claude and returns the normalized summary.
 * `client` is an Anthropic SDK client; SDK errors are left for the caller to map.
 */
export async function summarizeSermon(client, { model, transcript, title, date }) {
  const request = {
    model,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserMessage({ transcript, title, date }) }],
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: SUMMARY_SCHEMA },
    },
  };
  if (supportsServerFallback(model)) {
    request.betas = [FALLBACK_BETA];
    request.fallbacks = "default";
  }

  const response = await client.beta.messages.create(request);

  if (response.stop_reason === "refusal") {
    throw new SummaryError("refused", 422, "The model declined to summarize this transcript.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new SummaryError("truncated", 502, "The summary was cut off.");
  }

  const output = response.content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("");
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new SummaryError("bad_output", 502, "The model did not return valid JSON.");
  }
  return { summary: normalizeSummary(parsed), model: response.model, usage: response.usage };
}
