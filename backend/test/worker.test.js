import assert from "node:assert/strict";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { createHandler } from "../src/index.js";
import { normalizeSummary } from "../src/summarize.js";

const APP_KEY = "test-app-key";
const DEVICE = "3F2504E0-4F89-11D3-9A0C-0305E82C3301";
const TRANSCRIPT = "Good morning church. Turn with me to John 3:16. ".repeat(20);

const GOOD_SUMMARY = {
  isSermon: true,
  title: "Loved Before We Loved",
  bigIdea: "God's love comes first, and our love is a response to it.",
  outline: [
    { point: "God so loved the world", details: ["Love that gives", "Love for everyone"] },
    { point: "Believing is receiving", details: ["Trust, not effort"] },
  ],
  scriptures: ["John 3:16"],
  applications: ["Thank God each morning this week."],
  questions: ["What did John 3:16 say about God's love?", "Where do you find it hard to receive love?", "Who will you show that love to this week?"],
  prayer: "Lord, help me receive your love and pass it on.",
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
            { type: "text", text: typeof body === "string" ? body : JSON.stringify(body ?? GOOD_SUMMARY) },
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

function summarizeRequest(body = {}, key = APP_KEY) {
  return new Request("https://api.example.com/v1/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "X-App-Key": key } : {}) },
    body: JSON.stringify({ transcript: TRANSCRIPT, deviceId: DEVICE, date: "2026-11-15", ...body }),
  });
}

test("returns the summary and sends a cached, schema-constrained request with fallback", async () => {
  const api = fakeApi();
  const response = await createHandler({ makeClient: api.makeClient }).fetch(summarizeRequest(), env());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.summary.title, GOOD_SUMMARY.title);
  assert.equal(data.summary.questions.length, 3);

  assert.equal(api.calls.length, 1);
  const { url, headers, body } = api.calls[0];
  assert.match(url, /\/v1\/messages/);
  assert.match(headers.get("anthropic-beta") ?? "", /server-side-fallback-2026-07-01/);
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.fallbacks, "default");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.equal(body.output_config.effort, "medium");
  assert.deepEqual(body.system[0].cache_control, { type: "ephemeral" });
  assert.match(body.messages[0].content, /<transcript>/);
  assert.match(body.messages[0].content, /Date: 2026-11-15/);
  assert.equal(body.betas, undefined, "betas must travel as a header, not in the body");
});

test("does not send fallbacks to a Haiku model", async () => {
  const api = fakeApi();
  const response = await createHandler({ makeClient: api.makeClient }).fetch(
    summarizeRequest(),
    env({ CLAUDE_MODEL: "claude-haiku-5-5" }),
  );
  assert.equal(response.status, 200);
  const { headers, body } = api.calls[0];
  assert.equal(body.model, "claude-haiku-5-5");
  assert.equal(body.fallbacks, undefined);
  assert.doesNotMatch(headers.get("anthropic-beta") ?? "", /server-side-fallback/);
});

test("rejects a missing or wrong app key", async () => {
  const api = fakeApi();
  const handler = createHandler({ makeClient: api.makeClient });
  assert.equal((await handler.fetch(summarizeRequest({}, null), env())).status, 401);
  assert.equal((await handler.fetch(summarizeRequest({}, "wrong"), env())).status, 401);
  assert.equal(api.calls.length, 0);
});

test("validates the request body", async () => {
  const api = fakeApi();
  const handler = createHandler({ makeClient: api.makeClient });
  const short = await handler.fetch(summarizeRequest({ transcript: "Too short." }), env());
  assert.equal(short.status, 400);
  assert.equal((await short.json()).error, "transcript_too_short");
  const long = await handler.fetch(summarizeRequest({ transcript: "a".repeat(150_001) }), env());
  assert.equal(long.status, 413);
  const badDevice = await handler.fetch(summarizeRequest({ deviceId: "x" }), env());
  assert.equal((await badDevice.json()).error, "invalid_device_id");
  assert.equal(api.calls.length, 0);
});

test("enforces the per-device daily limit", async () => {
  const api = fakeApi();
  const kv = fakeKv();
  const handler = createHandler({ makeClient: api.makeClient, now: () => new Date("2026-11-15T10:00:00Z") });
  const limited = env({ RATE: kv, DAILY_LIMIT_PER_DEVICE: "1" });
  assert.equal((await handler.fetch(summarizeRequest(), limited)).status, 200);
  const second = await handler.fetch(summarizeRequest(), limited);
  assert.equal(second.status, 429);
  assert.equal((await second.json()).error, "device_daily_limit");
  assert.equal(api.calls.length, 1);
  assert.equal(kv.store.get("g:2026-11-15"), "1");
});

test("enforces the service-wide daily limit", async () => {
  const kv = fakeKv();
  kv.store.set("g:2026-11-15", "5");
  const api = fakeApi();
  const handler = createHandler({ makeClient: api.makeClient, now: () => new Date("2026-11-15T10:00:00Z") });
  const response = await handler.fetch(summarizeRequest(), env({ RATE: kv, GLOBAL_DAILY_LIMIT: "5" }));
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, "service_daily_limit");
});

test("maps a refusal, a non-sermon and bad output to clear errors", async () => {
  const refused = await createHandler({ makeClient: fakeApi({ stopReason: "refusal", body: "" }).makeClient })
    .fetch(summarizeRequest(), env());
  assert.equal(refused.status, 422);
  assert.equal((await refused.json()).error, "refused");

  const notSermon = await createHandler({ makeClient: fakeApi({ body: { ...GOOD_SUMMARY, isSermon: false } }).makeClient })
    .fetch(summarizeRequest(), env());
  assert.equal(notSermon.status, 422);
  assert.equal((await notSermon.json()).error, "not_a_sermon");

  const garbage = await createHandler({ makeClient: fakeApi({ body: "not json" }).makeClient })
    .fetch(summarizeRequest(), env());
  assert.equal(garbage.status, 502);
  assert.equal((await garbage.json()).error, "bad_output");
});

test("maps upstream API errors", async () => {
  const busy = await createHandler({ makeClient: fakeApi({ status: 429 }).makeClient }).fetch(summarizeRequest(), env());
  assert.equal(busy.status, 503);
  const down = await createHandler({ makeClient: fakeApi({ status: 529 }).makeClient }).fetch(summarizeRequest(), env());
  assert.equal(down.status, 502);
  const badKey = await createHandler({ makeClient: fakeApi({ status: 401 }).makeClient }).fetch(summarizeRequest(), env());
  assert.equal(badKey.status, 500);
  assert.equal((await badKey.json()).error, "server_not_configured");
});

test("reports a missing server configuration and unknown routes", async () => {
  const handler = createHandler({ makeClient: fakeApi().makeClient });
  assert.equal((await handler.fetch(summarizeRequest(), { APP_SHARED_KEY: APP_KEY })).status, 500);
  assert.equal((await handler.fetch(new Request("https://api.example.com/nope"), env())).status, 404);
  assert.equal((await handler.fetch(new Request("https://api.example.com/v1/summarize"), env())).status, 405);
  assert.equal((await handler.fetch(new Request("https://api.example.com/health"), env())).status, 200);
});

test("normalizeSummary trims lists to the limits the app expects", () => {
  const summary = normalizeSummary({
    ...GOOD_SUMMARY,
    questions: ["a", "b", "c", "d"],
    outline: Array.from({ length: 8 }, (_, index) => ({ point: `P${index}`, details: ["1", "2", "3", "4", "5"] })),
    applications: ["  spaced  ", "", 7],
  });
  assert.equal(summary.questions.length, 3);
  assert.equal(summary.outline.length, 6);
  assert.equal(summary.outline[0].details.length, 4);
  assert.deepEqual(summary.applications, ["spaced"]);
  assert.throws(() => normalizeSummary({ ...GOOD_SUMMARY, outline: [] }), /missing/);
});
