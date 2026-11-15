import { RECAP_SCHEMA, SYSTEM_PROMPT, buildUserMessage } from "./prompt.js";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const QUEST_STATUSES = new Set(["new", "ongoing", "completed", "failed"]);

/** A failure the app can show to the user; `code` is part of the API contract (docs/api.md). */
export class RecapError extends Error {
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
const objects = (value, max, map) =>
  (Array.isArray(value) ? value : []).map(entry => map(entry ?? {})).filter(Boolean).slice(0, max);

/** Checks the model's JSON and trims it to the limits the app expects. */
export function normalizeRecap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RecapError("bad_output", 502, "The recap is not a JSON object.");
  }
  const recap = {
    isSession: raw.isSession === true,
    title: text(raw.title),
    recap: text(raw.recap),
    keyMoments: textList(raw.keyMoments, 10),
    npcs: objects(raw.npcs, 200, entry =>
      text(entry.name) ? { name: text(entry.name), description: text(entry.description), status: text(entry.status) || "unknown" } : null),
    locations: objects(raw.locations, 100, entry =>
      text(entry.name) ? { name: text(entry.name), description: text(entry.description) } : null),
    quests: objects(raw.quests, 100, entry =>
      text(entry.name)
        ? { name: text(entry.name), status: QUEST_STATUSES.has(entry.status) ? entry.status : "ongoing", note: text(entry.note) }
        : null),
    loot: objects(raw.loot, 200, entry => (text(entry.item) ? { item: text(entry.item), holder: text(entry.holder) || "party" } : null)),
    openThreads: textList(raw.openThreads, 5),
  };
  if (recap.isSession && (!recap.title || !recap.recap)) {
    throw new RecapError("bad_output", 502, "The recap is missing its title or text.");
  }
  return recap;
}

/**
 * Sends one session transcript to Claude and returns the normalized recap.
 * `client` is an Anthropic SDK client; SDK errors are left for the caller to map.
 */
export async function recapSession(client, { model, transcript, campaignName, party, previousLog, date }) {
  const request = {
    model,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserMessage({ transcript, campaignName, party, previousLog, date }) }],
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: RECAP_SCHEMA },
    },
  };
  if (supportsServerFallback(model)) {
    request.betas = [FALLBACK_BETA];
    request.fallbacks = "default";
  }

  const response = await client.beta.messages.create(request);

  if (response.stop_reason === "refusal") {
    throw new RecapError("refused", 422, "The model declined to recap this session.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new RecapError("truncated", 502, "The recap was cut off.");
  }

  const output = response.content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("");
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new RecapError("bad_output", 502, "The model did not return valid JSON.");
  }
  return { recap: normalizeRecap(parsed), model: response.model };
}
