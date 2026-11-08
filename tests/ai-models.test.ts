import assert from 'node:assert/strict';
import test from 'node:test';
import { openAIChatModel, openAIValidationModels, openAIVisionModel } from '../src/lib/ai/models';
import { analyzeOpenAIImage, validateOpenAIKey } from '../src/lib/ai/openai';
import { runConversation } from '../src/lib/agent/conversation';
import { contextSchema } from '../src/lib/agent/contracts';
import { VisionError } from '../src/lib/ai/gemini';

const variables = ['OPENAI_CHAT_MODEL', 'OPENAI_VISION_MODEL', 'OPENAI_MODEL'] as const;
async function withModels(values: Partial<Record<typeof variables[number], string>>, run: () => Promise<void>) {
  const before = Object.fromEntries(variables.map(name => [name, process.env[name]]));
  try {
    for (const name of variables) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
    await run();
  } finally {
    for (const name of variables) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  }
}

test('workload model selection uses separate defaults and preserves explicit legacy fallback', () => {
  assert.equal(openAIChatModel({}), 'gpt-6-luna');
  assert.equal(openAIVisionModel({}), 'gpt-6.1-terra');
  assert.deepEqual(openAIValidationModels({}), ['gpt-6-luna', 'gpt-6.1-terra']);
  const legacy = { OPENAI_MODEL: 'legacy-model' };
  assert.deepEqual(openAIValidationModels(legacy), ['legacy-model']);
  assert.equal(openAIChatModel({ ...legacy, OPENAI_CHAT_MODEL: 'chat-only' }), 'chat-only');
  assert.equal(openAIVisionModel({ ...legacy, OPENAI_CHAT_MODEL: 'chat-only' }), 'legacy-model');
  assert.equal(openAIChatModel({ ...legacy, OPENAI_VISION_MODEL: 'photo-only' }), 'legacy-model');
  assert.equal(openAIVisionModel({ ...legacy, OPENAI_VISION_MODEL: ' photo-only ' }), 'photo-only');
  assert.equal(openAIChatModel({ OPENAI_CHAT_MODEL: ' ', OPENAI_MODEL: '' }), 'gpt-6-luna');
});

test('actual chat and shared photo adapters route to their own configured models', async () => {
  await withModels({ OPENAI_MODEL: 'legacy-model', OPENAI_CHAT_MODEL: 'gpt-6-luna', OPENAI_VISION_MODEL: 'gpt-6.1-terra' }, async () => {
    const reply = await runConversation({ message: '충전기 찾아줘', history: [], context: contextSchema.parse({}) }, {
      request: async body => {
        assert.equal(body.model, 'gpt-6-luna');
        assert.equal(body.store, false);
        assert.equal(body.max_output_tokens, 2500);
        assert.equal(body.parallel_tool_calls, false);
        assert.ok(Array.isArray(body.tools));
        return { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '확인할게요.' }] }] };
      },
      execute: async () => { throw new Error('No tool requested'); },
    });
    assert.equal(reply.message, '확인할게요.');
    const candidates = await analyzeOpenAIImage('fixture-key', Buffer.from('fixture image'), async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'gpt-6.1-terra');
      assert.equal(body.store, false);
      assert.equal(body.max_output_tokens, 8192);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.input[0].content[1].type, 'input_image');
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"items":[]}' }] }] });
    });
    assert.deepEqual(candidates, { items: [] });
  });
});

test('key validation checks both workload model permissions using only metadata reads', async () => {
  await withModels({}, async () => {
    const models: string[] = [];
    await validateOpenAIKey('fixture-key', async (url, init) => {
      assert.match(String(url), /^https:\/\/api.openai.com\/v1\/models\//);
      assert.equal(init?.method ?? 'GET', 'GET');
      assert.equal(init?.body, undefined);
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fixture-key');
      models.push(decodeURIComponent(String(url).split('/').at(-1)!));
      return Response.json({});
    });
    assert.deepEqual(models.sort(), ['gpt-6-luna', 'gpt-6.1-terra'].sort());
    await assert.rejects(validateOpenAIKey('fixture-key', async url => String(url).endsWith('gpt-6.1-terra')
      ? new Response('fixture-key provider detail', { status: 404 }) : Response.json({})), (error: unknown) => {
      assert.ok(error instanceof VisionError);
      assert.equal(error.status, 422);
      assert.doesNotMatch(error.message, /fixture-key|provider detail/);
      return true;
    });
  });
  await withModels({ OPENAI_MODEL: 'one-shared-model' }, async () => {
    let requests = 0;
    await validateOpenAIKey('fixture-key', async () => { requests++; return Response.json({}); });
    assert.equal(requests, 1, 'the same configured model is verified once');
  });
});
