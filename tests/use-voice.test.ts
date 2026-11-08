import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { useVoice } from '../src/components/agent/use-voice';

const settleAttempt = (attempt: Promise<boolean>) => Promise.race([attempt, new Promise<'pending'>(resolve => setImmediate(() => resolve('pending')))]);

function voiceFixture(getUserMedia: () => Promise<MediaStream>) {
  const slots: unknown[] = [];
  const effects: Array<() => void | (() => void)> = [];
  const timers = new Map<number, { callback: () => void; duration: number }>();
  let cursor = 0;
  let timerId = 0;
  let peerCount = 0;
  const react = {
    useState<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: T) => { slots[index] = value; }];
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback<T>(callback: T) { cursor++; return callback; },
    useEffect(setup: () => void | (() => void)) { cursor++; effects.push(setup); },
    useLayoutEffect(setup: () => void | (() => void)) { cursor++; effects.push(setup); },
  };
  const source = readFileSync(new URL('../src/components/agent/use-voice.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { useVoice?: typeof useVoice } = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === 'react') return react;
      if (name === '@/lib/agent/contracts') return { agentInstructions: () => 'test instructions' };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    navigator: { mediaDevices: { getUserMedia } },
    RTCPeerConnection: class { constructor() { peerCount++; } },
    AbortController,
    DOMException,
    setTimeout: (callback: () => void, duration: number) => { const id = ++timerId; timers.set(id, { callback, duration }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  function render() {
    cursor = 0;
    return exports.useVoice!({ active: true, context: { selectedContainerId: null, searchScope: null, registrationContainerId: null, activeActionId: null, activeActionRevision: null, photoDrafts: [] }, onEvent: () => assert.fail('Unexpected tool event'), onTranscript: () => assert.fail('Unexpected transcript') });
  }
  render();
  const cleanup = effects.map(setup => setup()).filter((value): value is () => void => typeof value === 'function');
  return { render, timers, peerCount: () => peerCount, dispose: () => cleanup.forEach(fn => fn()) };
}

function permissionFixture() {
  let resolve!: (stream: MediaStream) => void;
  const promise = new Promise<MediaStream>(done => { resolve = done; });
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => { stopped++; } }] } as unknown as MediaStream;
  return { promise, allow: () => resolve(stream), stopped: () => stopped };
}

test('voice permission timeout settles the attempt and releases a late microphone', async () => {
  const permission = permissionFixture();
  const hook = voiceFixture(() => permission.promise);
  try {
    const started = hook.render().start();
    assert.equal(hook.render().state, 'connecting');
    const timeout = [...hook.timers.values()].find(timer => timer.duration === 30_000);
    assert.ok(timeout, 'the connection deadline must include the unresolved permission prompt');
    timeout.callback();
    assert.equal(hook.render().state, 'error');
    assert.match(hook.render().error, /시간이 초과/);
    assert.equal(await settleAttempt(started), false);
    permission.allow();
    await Promise.resolve();
    assert.equal(permission.stopped(), 1);
    assert.equal(hook.peerCount(), 0);
  } finally { hook.dispose(); permission.allow(); }
});

test('ending voice while permission is pending settles start and stops late permission streams', async () => {
  const permission = permissionFixture();
  const hook = voiceFixture(() => permission.promise);
  try {
    const started = hook.render().start();
    hook.render().stop();
    assert.equal(hook.render().state, 'idle');
    assert.equal(hook.timers.size, 0);
    assert.equal(await settleAttempt(started), false);
    permission.allow();
    await Promise.resolve();
    assert.equal(permission.stopped(), 1);
    assert.equal(hook.peerCount(), 0);
  } finally { hook.dispose(); permission.allow(); }
});

test('disposing voice while permission is pending releases the eventual stream', async () => {
  const permission = permissionFixture();
  const hook = voiceFixture(() => permission.promise);
  const started = hook.render().start();
  hook.dispose();
  assert.equal(await settleAttempt(started), false);
  permission.allow();
  await Promise.resolve();
  assert.equal(permission.stopped(), 1);
  assert.equal(hook.timers.size, 0);
  assert.equal(hook.peerCount(), 0);
});
