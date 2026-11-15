import assert from "node:assert/strict";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { createHandler } from "../src/index.js";
import { normalizeRecap } from "../src/summarize.js";

const APP_KEY = "test-app-key";
const DEVICE = "3F2504E0-4F89-11D3-9A0C-0305E82C3301";
const TRANSCRIPT = "Okay, you push open the tavern door and the barkeep, Old Marta, waves you over. ".repeat(10);

const GOOD_RECAP = {
  isSession: true,
  title: "Smoke Over Brindle Ford",
  recap: "Last time, our heroes reached Brindle Ford and found the mill burning. They pulled Old Marta from the smoke.",
  keyMoments: ["Arrived at Brindle Ford", "Rescued Old Marta", "Found a black feather token"],
  npcs: [{ name: "Old Marta", description: "Tavern keeper of Brindle Ford.", status: "ally" }],
  locations: [{ name: "Brindle Ford", description: "A river village with a burned mill." }],
  quests: [{ name: "Who burned the mill?", status: "new", note: "A black feather token was left behind." }],
  loot: [{ item: "Black feather token", holder: "Kael" }],
  openThreads: ["Who leaves black feathers?"],
};

/** A fake Anthropic API: records requests and replies with the given body. */
function fakeApi({ status = 200, body, stopReason = "end_turn" } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    const payload = status === 200
      ? {
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [
            { type: "thinking", thinking: "", signature: "sig" },
            { type: "text", text: typeof body === "string" ? body : JSON.stringify(body ?? GOOD_RECAP) },
          ],
          stop_reason: stopReason,
          stop_sequence: null,
          usage: { input_tokens: 1200, output_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        }
      : { type: "error", error: { type: "api_error", message: "upstream problem" } };
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, makeClient: () => new Anthropic({ apiKey: "sk-test", fetch, maxRetries: 0 }) };
}

/** An in-memory stand-in for a Workers KV namespace. */
function fakeKv() {
  const store = new Map();
  return { store, get: async key => store.get(key) ?? null, put: async (key, value) => void store.set(key, value) };
}

function env(overrides = {}) {
  return { ANTHROPIC_API_KEY: "sk-test", APP_SHARED_KEY: APP_KEY, ...overrides };
}

function recapRequest(body = {}, key = APP_KEY) {
  return new Request("https://api.example.com/v1/recap", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "X-App-Key": key } : {}) },
    body: JSON.stringify({ transcript: TRANSCRIPT, deviceId: DEVICE, date: "2026-11-15", ...body }),
  });
}

test("returns the recap and sends a cached, schema-constrained request with fallback", async () => {
  const api = fakeApi();
  const response = await createHandler({ makeClient: api.makeClient }).fetch(
    recapRequest({ campaignName: "Curse of the Feather", party: ["Kael", "Ivy"], previousLog: { npcs: [{ name: "Old Marta" }] } }),
    env(),
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.recap.title, GOOD_RECAP.title);
  assert.equal(data.recap.quests[0].status, "new");

  assert.equal(api.calls.length, 1);
  const { headers, body } = api.calls[0];
  assert.match(headers.get("anthropic-beta") ?? "", /server-side-fallback-2026-07-01/);
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.fallbacks, "default");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.deepEqual(body.system[0].cache_control, { type: "ephemeral" });
  const message = body.messages[0].content;
  assert.match(message, /Campaign: Curse of the Feather/);
  assert.match(message, /Party \(character names\): Kael, Ivy/);
  assert.match(message, /"Old Marta"/);
  assert.match(message, /<transcript>/);
});

test("says when there is no previous log", async () => {
  const api = fakeApi();
  await createHandler({ makeClient: api.makeClient }).fetch(recapRequest(), env());
  assert.match(api.calls[0].body.messages[0].content, /none, this is the first recorded session/);
});

test("does not send fallbacks to a Haiku model", async () => {
  const api = fakeApi();
  const response = await createHandler({ makeClient: api.makeClient }).fetch(recapRequest(), env({ CLAUDE_MODEL: "claude-haiku-5-5" }));
  assert.equal(response.status, 200);
  assert.equal(api.calls[0].body.model, "claude-haiku-5-5");
  assert.equal(api.calls[0].body.fallbacks, undefined);
  assert.doesNotMatch(api.calls[0].headers.get("anthropic-beta") ?? "", /server-side-fallback/);
});

test("rejects a missing or wrong app key", async () => {
  const api = fakeApi();
  const handler = createHandler({ makeClient: api.makeClient });
  assert.equal((await handler.fetch(recapRequest({}, null), env())).status, 401);
  assert.equal((await handler.fetch(recapRequest({}, "wrong"), env())).status, 401);
  assert.equal(api.calls.length, 0);
});

test("validates the request body", async () => {
  const api = fakeApi();
  const handler = createHandler({ makeClient: api.makeClient });
  const short = await handler.fetch(recapRequest({ transcript: "Too short." }), env());
  assert.equal((await short.json()).error, "transcript_too_short");
  assert.equal((await handler.fetch(recapRequest({ transcript: "a".repeat(600_001) }), env())).status, 413);
  assert.equal((await (await handler.fetch(recapRequest({ deviceId: "x" }), env())).json()).error, "invalid_device_id");
  assert.equal((await (await handler.fetch(recapRequest({ previousLog: [1] }), env())).json()).error, "invalid_previous_log");
  const bigLog = { npcs: [{ name: "x".repeat(100_001) }] };
  assert.equal((await handler.fetch(recapRequest({ previousLog: bigLog }), env())).status, 413);
  assert.equal(api.calls.length, 0);
});

test("enforces the per-device and service-wide daily limits", async () => {
  const api = fakeApi();
  const kv = fakeKv();
  const handler = createHandler({ makeClient: api.makeClient, now: () => new Date("2026-11-15T10:00:00Z") });
  const limited = env({ RATE: kv, DAILY_LIMIT_PER_DEVICE: "1" });
  assert.equal((await handler.fetch(recapRequest(), limited)).status, 200);
  const second = await handler.fetch(recapRequest(), limited);
  assert.equal(second.status, 429);
  assert.equal((await second.json()).error, "device_daily_limit");

  const busyKv = fakeKv();
  busyKv.store.set("g:2026-11-15", "5");
  const full = await handler.fetch(recapRequest(), env({ RATE: busyKv, GLOBAL_DAILY_LIMIT: "5" }));
  assert.equal((await full.json()).error, "service_daily_limit");
  assert.equal(api.calls.length, 1);
});

test("maps a refusal, a non-session and bad output to clear errors", async () => {
  const refused = await createHandler({ makeClient: fakeApi({ stopReason: "refusal", body: "" }).makeClient }).fetch(recapRequest(), env());
  assert.equal(refused.status, 422);
  assert.equal((await refused.json()).error, "refused");

  const chat = await createHandler({ makeClient: fakeApi({ body: { ...GOOD_RECAP, isSession: false } }).makeClient }).fetch(recapRequest(), env());
  assert.equal((await chat.json()).error, "not_a_session");

  const garbage = await createHandler({ makeClient: fakeApi({ body: "not json" }).makeClient }).fetch(recapRequest(), env());
  assert.equal(garbage.status, 502);
  assert.equal((await garbage.json()).error, "bad_output");
});

test("maps upstream API errors", async () => {
  assert.equal((await createHandler({ makeClient: fakeApi({ status: 429 }).makeClient }).fetch(recapRequest(), env())).status, 503);
  assert.equal((await createHandler({ makeClient: fakeApi({ status: 529 }).makeClient }).fetch(recapRequest(), env())).status, 502);
  const badKey = await createHandler({ makeClient: fakeApi({ status: 401 }).makeClient }).fetch(recapRequest(), env());
  assert.equal((await badKey.json()).error, "server_not_configured");
});

test("reports a missing server configuration and unknown routes", async () => {
  const handler = createHandler({ makeClient: fakeApi().makeClient });
  assert.equal((await handler.fetch(recapRequest(), { APP_SHARED_KEY: APP_KEY })).status, 500);
  assert.equal((await handler.fetch(new Request("https://api.example.com/v1/summarize"), env())).status, 404);
  assert.equal((await handler.fetch(new Request("https://api.example.com/v1/recap"), env())).status, 405);
  assert.equal((await handler.fetch(new Request("https://api.example.com/health"), env())).status, 200);
});

test("normalizeRecap cleans entries and caps lists", () => {
  const recap = normalizeRecap({
    ...GOOD_RECAP,
    openThreads: ["a", "b", "c", "d", "e", "f"],
    quests: [{ name: "Q", status: "weird", note: "n" }, { name: "", status: "new", note: "" }],
    loot: [{ item: "Gold", holder: "" }],
    npcs: [{ name: "  Marta  ", description: "d", status: "" }],
  });
  assert.equal(recap.openThreads.length, 5);
  assert.deepEqual(recap.quests, [{ name: "Q", status: "ongoing", note: "n" }]);
  assert.equal(recap.loot[0].holder, "party");
  assert.deepEqual(recap.npcs[0], { name: "Marta", description: "d", status: "unknown" });
  assert.throws(() => normalizeRecap({ ...GOOD_RECAP, recap: "" }), /missing/);
});
