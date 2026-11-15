// Cloudflare Worker: keeps the Anthropic API key off the phone, checks the app key,
// applies daily limits and turns a tabletop RPG session transcript into a recap and campaign log.
import Anthropic from "@anthropic-ai/sdk";
import { checkAndCount } from "./limits.js";
import { RecapError, recapSession } from "./summarize.js";

const DEFAULT_MODEL = "claude-opus-5-5";
const MIN_TRANSCRIPT_CHARS = 300;
const MAX_TRANSCRIPT_CHARS = 600_000; // roughly six hours of table talk
const MAX_PREVIOUS_LOG_CHARS = 100_000;
const DEVICE_ID = /^[A-Za-z0-9-]{8,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Constant-time string comparison for the app key. */
function safeEqual(a, b) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function errorResponse(error) {
  if (error instanceof RecapError) return json(error.status, { error: error.code });
  // Most specific SDK errors first. Transcripts are never logged.
  if (error instanceof Anthropic.RateLimitError) return json(503, { error: "busy_retry_later" });
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    console.error("Anthropic credentials rejected", error.status);
    return json(500, { error: "server_not_configured" });
  }
  if (error instanceof Anthropic.BadRequestError) {
    console.error("Anthropic rejected the request", error.status, error.message);
    return json(500, { error: "server_error" });
  }
  if (error instanceof Anthropic.APIError) {
    console.error("Anthropic API unavailable", error.status ?? "connection");
    return json(502, { error: "model_unavailable" });
  }
  console.error("Unexpected error", error?.name);
  return json(500, { error: "server_error" });
}

const shortText = (value, max) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);

async function readRequest(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: json(400, { error: "invalid_json" }) };
  }
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "";
  if (!DEVICE_ID.test(deviceId)) return { error: json(400, { error: "invalid_device_id" }) };
  if (transcript.length < MIN_TRANSCRIPT_CHARS) return { error: json(400, { error: "transcript_too_short" }) };
  if (transcript.length > MAX_TRANSCRIPT_CHARS) return { error: json(413, { error: "transcript_too_long" }) };

  let previousLog;
  if (body.previousLog != null) {
    if (typeof body.previousLog !== "object" || Array.isArray(body.previousLog)) {
      return { error: json(400, { error: "invalid_previous_log" }) };
    }
    if (JSON.stringify(body.previousLog).length > MAX_PREVIOUS_LOG_CHARS) {
      return { error: json(413, { error: "previous_log_too_long" }) };
    }
    const { npcs, locations, quests, loot } = body.previousLog;
    previousLog = { npcs, locations, quests, loot };
  }
  const party = Array.isArray(body.party)
    ? body.party.map(name => shortText(name, 60)).filter(Boolean).slice(0, 12)
    : [];
  return {
    transcript,
    deviceId,
    previousLog,
    party,
    campaignName: shortText(body.campaignName, 200),
    date: typeof body.date === "string" && DATE.test(body.date) ? body.date : undefined,
  };
}

export function createHandler({
  makeClient = env => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
  now = () => new Date(),
} = {}) {
  return {
    async fetch(request, env) {
      const { pathname } = new URL(request.url);
      if (pathname === "/health" && request.method === "GET") return json(200, { ok: true });
      if (pathname !== "/v1/recap") return json(404, { error: "not_found" });
      if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
      if (!env.ANTHROPIC_API_KEY || !env.APP_SHARED_KEY) return json(500, { error: "server_not_configured" });
      if (!safeEqual(request.headers.get("X-App-Key") ?? "", env.APP_SHARED_KEY)) {
        return json(401, { error: "unauthorized" });
      }

      const input = await readRequest(request);
      if (input.error) return input.error;

      const limit = await checkAndCount(env.RATE, {
        deviceId: input.deviceId,
        perDevice: Number(env.DAILY_LIMIT_PER_DEVICE) || 3,
        global: Number(env.GLOBAL_DAILY_LIMIT) || 100,
        now: now(),
      });
      if (!limit.ok) return json(429, { error: limit.code });

      try {
        const { recap, model } = await recapSession(makeClient(env), {
          model: env.CLAUDE_MODEL || DEFAULT_MODEL,
          transcript: input.transcript,
          campaignName: input.campaignName,
          party: input.party,
          previousLog: input.previousLog,
          date: input.date,
        });
        if (!recap.isSession) return json(422, { error: "not_a_session" });
        return json(200, { recap, model });
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}

export default createHandler();
