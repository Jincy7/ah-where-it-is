import assert from 'node:assert/strict';
import test from 'node:test';
import { VisionError } from '../src/lib/ai/gemini';
import { readLimitedBody } from '../src/lib/ai/http';
import { MAX_AUDIO_BYTES, transcribeAudio, transcriptionFormat, validateRecording } from '../src/lib/ai/transcription';

const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0]);
const ogg = new TextEncoder().encode('OggS\0fixture');
const mp4 = new Uint8Array([0, 0, 0, 20, ...Buffer.from('ftypisom')]);

test('dictation sends only audio transcription multipart with browser format metadata', async () => {
  for (const [contentType, audio, extension] of [
    ['audio/webm;codecs=opus', webm, 'webm'],
    ['audio/ogg;codecs=opus', ogg, 'ogg'],
    ['audio/mp4;codecs=mp4a.40.2', mp4, 'mp4'],
  ] as const) {
    const result = await transcribeAudio('private-key', audio, contentType, async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer private-key');
      assert.equal(new Headers(init?.headers).get('content-type'), null, 'fetch supplies the multipart boundary');
      assert.equal(init?.cache, 'no-store');
      assert.ok(init?.signal);
      assert.ok(init?.body instanceof FormData);
      const form = init.body;
      assert.deepEqual([...form.keys()].sort(), ['file', 'model', 'response_format']);
      assert.equal(form.get('model'), process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-transcribe');
      assert.equal(form.get('response_format'), 'json');
      const file = form.get('file') as File;
      assert.equal(file.name, `recording.${extension}`);
      assert.equal(file.type, `audio/${extension}`);
      assert.deepEqual(new Uint8Array(await file.arrayBuffer()), audio);
      return Response.json({ text: '  충전기 어디 있어?  ', usage: { private: 'not-returned' } });
    });
    assert.deepEqual(result, { text: '충전기 어디 있어?' });
  }
});

test('unsupported, empty, mismatched and oversized audio never reaches the provider', async () => {
  assert.equal(transcriptionFormat('VIDEO/MP4;codecs=mp4a.40.2').extension, 'mp4');
  assert.equal(transcriptionFormat('application/ogg').extension, 'ogg');
  for (const [audio, contentType, status] of [
    [webm, 'text/plain', 415], [webm, null, 415],
    [new Uint8Array(), 'audio/webm', 400],
    [webm, 'audio/ogg', 400],
    [Buffer.from('{"confirmed":true}'), 'audio/mp4', 400],
    [new Uint8Array(MAX_AUDIO_BYTES + 1), 'audio/webm', 413],
  ] as const) {
    let called = false;
    await assert.rejects(transcribeAudio('private-key', audio, contentType, async () => {
      called = true;
      throw new Error('must not call');
    }), (error: unknown) => error instanceof VisionError && error.status === status);
    assert.equal(called, false);
  }
  assert.equal(validateRecording(mp4, 'video/mp4').extension, 'mp4');
});

test('streamed request limits work without trusting Content-Length', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(6)); },
    cancel() { cancelled = true; },
  });
  const request = new Request('http://localhost/api/agent/transcribe', {
    method: 'POST', body, duplex: 'half',
  } as RequestInit);
  await assert.rejects(readLimitedBody(request, 10), (error: unknown) => error instanceof VisionError && error.status === 413);
  assert.equal(cancelled, true);
});

test('provider errors and malformed transcripts never expose audio, keys or raw errors', async () => {
  for (const [status, expected] of [[401, 422], [429, 429], [500, 502]] as const) {
    await assert.rejects(transcribeAudio('private-key', webm, 'audio/webm', async () => new Response('private-key raw-audio', { status })), (error: unknown) => {
      assert.ok(error instanceof VisionError);
      assert.equal(error.status, expected);
      assert.doesNotMatch(error.message, /private-key|raw-audio/);
      return true;
    });
  }
  for (const body of [{ text: null }, { error: 'private-key raw-audio' }]) {
    await assert.rejects(transcribeAudio('private-key', webm, 'audio/webm', async () => Response.json(body)), (error: unknown) => error instanceof VisionError && error.status === 502 && !error.message.includes('private-key'));
  }
  await assert.rejects(transcribeAudio('private-key', webm, 'audio/webm', async () => { throw new Error('private-key raw-audio'); }), (error: unknown) => error instanceof VisionError && error.status === 504 && !error.message.includes('private-key'));
});

test('empty or long speech is reported without silently submitting or truncating it', async () => {
  for (const text of ['  ', '가'.repeat(2001)]) {
    await assert.rejects(transcribeAudio('private-key', webm, 'audio/webm', async () => Response.json({ text })), (error: unknown) => error instanceof VisionError && error.status === 422);
  }
  let cancelled = false;
  await assert.rejects(transcribeAudio('private-key', webm, 'audio/webm', async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(65 * 1024)); },
    cancel() { cancelled = true; },
  }))), (error: unknown) => error instanceof VisionError && error.status === 502);
  assert.equal(cancelled, true);
});
