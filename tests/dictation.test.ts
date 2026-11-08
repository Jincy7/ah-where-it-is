import assert from 'node:assert/strict';
import test from 'node:test';
import { appendDictation, DictationDraftBuffer, DictationSession, supportedDictationTypes, type DictationState } from '../src/components/agent/dictation';

class FakeRecorder {
  state: RecordingState = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() { this.state = 'recording'; }
  emit(data: Blob) { this.ondataavailable?.({ data }); }
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => { this.emit(new Blob(['recorded audio'], { type: this.mimeType })); this.onstop?.(); });
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture(overrides: Partial<ConstructorParameters<typeof DictationSession>[0]> = {}) {
  let stopped = 0;
  let recorder = new FakeRecorder();
  const texts: string[] = [];
  const errors: string[] = [];
  const states: DictationState[] = [];
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const stream = { getTracks: () => [{ stop: () => { stopped++; } }] } as unknown as MediaStream;
  const session = new DictationSession({
    getUserMedia: async () => stream,
    createRecorder: () => { recorder = new FakeRecorder(); return recorder as unknown as MediaRecorder; },
    fetch: async (url, init) => { requests.push({ url, init }); return Response.json({ text: '검은색 충전기' }); },
    onText: text => texts.push(text),
    onError: error => errors.push(error),
    onState: state => states.push(state),
    ...overrides,
  });
  return { session, stream, texts, errors, states, requests, get recorder() { return recorder; }, get stopped() { return stopped; } };
}

test('recording MIME preference follows supported formats and permits browser default fallback', () => {
  assert.deepEqual(supportedDictationTypes(() => true), ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']);
  assert.deepEqual(supportedDictationTypes(mime => mime === 'audio/mp4'), ['audio/mp4']);
  assert.deepEqual(supportedDictationTypes(() => false), []);
});

test('dictation appends to the latest typed draft and rejects overflow without truncation', () => {
  assert.deepEqual(appendDictation('이건 ', ' 검은색 충전기 '), { text: '이건 검은색 충전기', accepted: true });
  assert.deepEqual(appendDictation('이건', '검은색 충전기'), { text: '이건 검은색 충전기', accepted: true });
  assert.deepEqual(appendDictation('x'.repeat(1999), '말'), { text: 'x'.repeat(1999), accepted: false });
  assert.equal(appendDictation('', 'x'.repeat(2000)).accepted, true);
});

test('stopping immediately releases the microphone and sends only a raw transcription request', async () => {
  const f = fixture();
  try {
    assert.equal(await f.session.start(), true);
    f.session.stop();
    assert.equal(f.stopped, 1);
    assert.equal(f.session.state, 'transcribing');
    await tick();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url, '/api/agent/transcribe');
    assert.equal((f.requests[0].init.headers as Record<string, string>)['Content-Type'], 'audio/webm;codecs=opus');
    assert.ok(f.requests[0].init.body instanceof Blob);
    assert.deepEqual(f.texts, ['검은색 충전기']);
    assert.equal(f.session.state, 'idle');
  } finally { f.session.dispose(); }
});

test('cancel while permission is pending discards a late stream and allows another attempt', async () => {
  const permission = deferred<MediaStream>();
  const f = fixture({ getUserMedia: () => permission.promise });
  try {
    const pending = f.session.start();
    assert.equal(f.session.state, 'requesting');
    f.session.cancel();
    permission.resolve(f.stream);
    assert.equal(await pending, false);
    assert.equal(f.stopped, 1);
    assert.equal(f.requests.length, 0);
    assert.equal(f.session.state, 'idle');
    assert.equal(await f.session.start(), true);
  } finally { f.session.dispose(); }
});

test('permission denial never leaves the recorder busy', async () => {
  let denied = true;
  const f = fixture({ getUserMedia: async () => { if (denied) throw new DOMException('denied', 'NotAllowedError'); return f.stream; } });
  try {
    assert.equal(await f.session.start(), false);
    assert.equal(f.session.state, 'error');
    assert.match(f.errors.at(-1) ?? '', /권한/);
    denied = false;
    assert.equal(await f.session.start(), true);
  } finally { f.session.dispose(); }
});

test('cancel during transcription aborts the request and ignores its late result', async () => {
  const response = deferred<Response>();
  let signal: AbortSignal | undefined;
  const f = fixture({ fetch: async (_url, init) => { signal = init.signal ?? undefined; return response.promise; } });
  try {
    await f.session.start();
    f.session.stop();
    await tick();
    f.session.cancel();
    assert.equal(signal?.aborted, true);
    response.resolve(Response.json({ text: '취소한 말' }));
    await tick();
    assert.deepEqual(f.texts, []);
    assert.equal(f.session.state, 'idle');
  } finally { f.session.dispose(); }
});

test('byte limit discards oversize audio and does not upload it', async () => {
  const f = fixture({ maxBytes: 4 });
  try {
    await f.session.start();
    f.recorder.emit(new Blob(['12345'], { type: f.recorder.mimeType }));
    await tick();
    assert.equal(f.session.state, 'error');
    assert.equal(f.stopped, 1);
    assert.equal(f.requests.length, 0);
  } finally { f.session.dispose(); }
});

test('duration cap stops and transcribes without requiring another click', async () => {
  const f = fixture({ maxDurationMs: 5 });
  try {
    await f.session.start();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(f.stopped, 1);
    assert.deepEqual(f.texts, ['검은색 충전기']);
    assert.equal(f.session.state, 'idle');
  } finally { f.session.dispose(); }
});

test('becoming inactive discards recording and never produces draft text', async () => {
  const f = fixture();
  try {
    await f.session.start();
    f.session.setActive(false);
    await tick();
    assert.equal(f.stopped, 1);
    assert.equal(f.requests.length, 0);
    assert.equal(await f.session.start(), false);
    f.session.setActive(true);
    assert.equal(await f.session.start(), true);
  } finally { f.session.dispose(); }
});

test('permission timeout releases the busy state and ignores a later grant', async () => {
  const permission = deferred<MediaStream>();
  const f = fixture({ getUserMedia: () => permission.promise, permissionTimeoutMs: 5 });
  try {
    const start = f.session.start();
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(f.session.state, 'error');
    permission.resolve(f.stream);
    assert.equal(await start, false);
    assert.equal(f.stopped, 1);
    assert.equal(f.requests.length, 0);
  } finally { f.session.dispose(); }
});

test('disposal during transcription ignores the response and leaves no microphone running', async () => {
  const response = deferred<Response>();
  const f = fixture({ fetch: async () => response.promise });
  await f.session.start();
  f.session.stop();
  await tick();
  f.session.dispose();
  response.resolve(Response.json({ text: '늦은 응답' }));
  await tick();
  assert.deepEqual(f.texts, []);
  assert.equal(f.stopped, 1);
});

function draftBufferFixture(initial = '') {
  let draft = initial;
  let nextFrame: (() => void) | null = null;
  const writes: string[] = [];
  const overflow: string[] = [];
  const buffer = new DictationDraftBuffer({
    readDraft: () => draft,
    writeDraft: text => { draft = text; writes.push(text); },
    onOverflow: text => overflow.push(text),
    schedule: callback => { nextFrame = callback; return () => { if (nextFrame === callback) nextFrame = null; }; },
  });
  return { buffer, writes, overflow, change(text: string) { draft = text; }, frame() { const callback = nextFrame; nextFrame = null; callback?.(); }, get draft() { return draft; } };
}

test('dictation waits for Korean composition and the following final change event', () => {
  const f = draftBufferFixture('충전');
  f.buffer.beginComposition();
  f.buffer.enqueue('책상에 있어');
  f.frame();
  assert.deepEqual(f.writes, []);
  f.change('충전ㄱ');
  f.buffer.endComposition();
  // React/browser may deliver the committed input after compositionend.
  f.change('충전기');
  f.frame();
  assert.equal(f.draft, '충전기 책상에 있어');
  f.frame();
  assert.equal(f.writes.length, 1);
});

test('another composition before the deferred flush keeps speech queued until its commit', () => {
  const f = draftBufferFixture('검은');
  f.buffer.enqueue('두 개');
  f.buffer.beginComposition();
  f.change('검은색');
  f.frame();
  assert.equal(f.draft, '검은색');
  f.buffer.endComposition();
  f.change('검은색 충전기');
  f.frame();
  assert.equal(f.draft, '검은색 충전기 두 개');
});

test('queued speech is preserved on overflow and cleared by cancellation/unmount', () => {
  const f = draftBufferFixture('x'.repeat(2000));
  f.buffer.enqueue('남은 음성');
  f.frame();
  assert.equal(f.draft.length, 2000);
  assert.equal(f.buffer.hasPending, true);
  assert.deepEqual(f.overflow, ['남은 음성']);
  f.change('충전기');
  f.buffer.flush();
  assert.equal(f.draft, '충전기 남은 음성');
  assert.equal(f.buffer.hasPending, false);
  f.buffer.enqueue('취소할 음성');
  f.buffer.clear();
  f.frame();
  assert.equal(f.draft, '충전기 남은 음성');
  assert.equal(f.buffer.hasPending, false);
});
