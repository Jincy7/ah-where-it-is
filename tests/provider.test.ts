import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decryptApiKey, encryptApiKey } from "../src/lib/ai/crypto";
import { analyzeOpenAIImage, validateOpenAIKey } from "../src/lib/ai/openai";
import { canImportLocalOpenAIKey } from "../src/lib/ai/local-credential";

const secret = randomBytes(32).toString("base64");

test("ciphertext is bound to both owner and provider without breaking legacy Gemini", () => {
  const encrypted = encryptApiKey("openai-private", "user-a", secret, "openai");
  assert.equal(decryptApiKey(encrypted, "user-a", secret, "openai"), "openai-private");
  assert.throws(() => decryptApiKey(encrypted, "user-b", secret, "openai"));
  assert.throws(() => decryptApiKey(encrypted, "user-a", secret, "gemini"));
  const legacy = encryptApiKey("gemini-private", "user-a", secret);
  assert.equal(decryptApiKey(legacy, "user-a", secret, "gemini"), "gemini-private");
  assert.throws(() => decryptApiKey(legacy, "user-a", secret, "openai"));
});

test("development key import requires a local app, local DB and development process", () => {
  const env = { NODE_ENV: "development", SUPABASE_URL: "http://127.0.0.1:54321", OPENAI_API_KEY: "local-private-key" };
  assert.equal(canImportLocalOpenAIKey(env, "http://localhost:4201"), true);
  for (const override of [
    { NODE_ENV: "production" }, { VERCEL: "1" },
    { SUPABASE_URL: "https://project.supabase.co" }, { OPENAI_API_KEY: "" },
  ]) assert.equal(canImportLocalOpenAIKey({ ...env, ...override }, "http://localhost:4201"), false);
  assert.equal(canImportLocalOpenAIKey(env, "https://example.com"), false);
  assert.equal(canImportLocalOpenAIKey(env, "http://localhost.evil.test"), false);
});

function completed(text: string) {
  return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] });
}

test("OpenAI uses image input and strict outputs and preserves uncertain quantity", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer private-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.additionalProperties, false);
    assert.equal(body.input[0].content[1].type, "input_image");
    assert.match(body.input[0].content[1].image_url, /^data:image\/jpeg;base64,/);
    return completed(JSON.stringify({ items: [{ name: "검정 케이블", quantity: null, description: "둥글게 감겨 있음", uncertainty: "겹쳐 있어 수량 확인 필요" }] }));
  };
  const data = await analyzeOpenAIImage("private-key", Buffer.from("image"), fetcher);
  assert.equal(data.items[0].quantity, null);
});

test("OpenAI rejects incomplete, refusal and invalid candidate output", async () => {
  for (const body of [
    { status: "incomplete", output: [] },
    { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "private content" }] }] },
    { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"items":[{"name":"bad","quantity":0,"description":"","uncertainty":""}]}' }] }] },
  ]) {
    await assert.rejects(analyzeOpenAIImage("private-key", Buffer.from("image"), async () => Response.json(body)), /분석 결과/);
  }
});

test("OpenAI key validation and errors never return raw provider data", async () => {
  await validateOpenAIKey("private-key", async (url, init) => {
    assert.match(String(url), /^https:\/\/api.openai.com\/v1\/models\//);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer private-key");
    return Response.json({ id: "model" });
  });
  for (const [status, expected] of [[401, 422], [403, 422], [429, 429], [500, 502]] as const) {
    await assert.rejects(validateOpenAIKey("private-key", async () => new Response("private-key raw response", { status })), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes("private-key"));
      assert.equal((error as { status?: number }).status, expected);
      return true;
    });
  }
});
