import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptApiKey, decryptApiKey } from "../src/lib/ai/crypto";
import { analysisSchema, bulkRequestSchema } from "../src/lib/ai/schema";
import { analyzeImage } from "../src/lib/ai/gemini";

const secret = randomBytes(32).toString("base64");
test("keys round-trip with randomized ciphertext bound to a user", () => {
  const a = encryptApiKey("private-key", "user-a", secret);
  assert.notEqual(a, encryptApiKey("private-key", "user-a", secret));
  assert.ok(!a.includes("private-key"));
  assert.equal(decryptApiKey(a, "user-a", secret), "private-key");
  assert.throws(() => decryptApiKey(a, "user-b", secret));
  assert.throws(() =>
    decryptApiKey(a, "user-a", randomBytes(32).toString("base64")),
  );
  const pieces = a.split(".");
  pieces[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decryptApiKey(pieces.join("."), "user-a", secret));
});
test("missing or malformed deployment secret fails closed", () => {
  for (const bad of ["", "short", "a".repeat(44)]) {
    assert.throws(() => encryptApiKey("private-key", "user-a", bad));
  }
});
test("unknown count is preserved and cannot be registered without review", () => {
  const result = analysisSchema.parse({
    items: [
      {
        name: "케이블",
        quantity: null,
        description: "",
        uncertainty: "가려짐",
      },
    ],
  });
  assert.equal(result.items[0].quantity, null);
  const base = {
    container_id: "bb213656-061c-4823-a46f-cdb28d7fdb56",
    items: result.items,
  };
  assert.equal(bulkRequestSchema.safeParse(base).success, false);
  for (const quantity of [0, -1, 1.5, 1000000]) {
    assert.equal(
      bulkRequestSchema.safeParse({
        ...base,
        items: [{ name: "케이블", quantity }],
      }).success,
      false,
    );
  }
  assert.equal(
    bulkRequestSchema.safeParse({
      ...base,
      items: [{ name: "케이블", quantity: 1 }],
    }).success,
    true,
  );
});
test("Gemini uses the requested model and header key, validates structured output", async () => {
  const mockFetch: typeof fetch = async (url, options) => {
    assert.match(String(url), /gemini-3\.5-flash-lite:generateContent$/);
    assert.ok(!String(url).includes("secret-key"));
    assert.equal(
      new Headers(options?.headers).get("x-goog-api-key"),
      "secret-key",
    );
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: JSON.stringify({
                  items: [
                    {
                      name: "상자",
                      quantity: 1,
                      description: "",
                      uncertainty: "",
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    });
  };
  assert.equal(
    (await analyzeImage("secret-key", Buffer.from("image"), mockFetch)).items[0]
      .name,
    "상자",
  );
});
test("provider errors do not leak keys or raw responses", async () => {
  await assert.rejects(
    analyzeImage(
      "secret-key",
      Buffer.from("image"),
      async () =>
        new Response("secret-key raw provider details", { status: 403 }),
    ),
    (error: Error) =>
      !error.message.includes("secret-key") && /키/.test(error.message),
  );
  await assert.rejects(
    analyzeImage("secret-key", Buffer.from("image"), async () =>
      Response.json({
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: '{"items":[]}' }] },
          },
        ],
      }),
    ),
  );
});
