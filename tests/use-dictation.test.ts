import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as dictation from '../src/components/agent/dictation';
import type { useDictation } from '../src/components/agent/use-dictation';

type Effect = { setup: () => void | (() => void); cleanup?: () => void };

/** Fast Refresh keeps state/ref slots but reruns every effect, including effects with []. */
function hookFixture(getUserMedia: () => Promise<MediaStream>) {
  const slots: unknown[] = [];
  const effects = new Map<number, Effect>();
  let cursor = 0;
  function registerEffect(setup: Effect['setup']) {
    const index = cursor++;
    effects.set(index, { setup, cleanup: effects.get(index)?.cleanup });
  }
  class Recorder {
    static isTypeSupported() { return true; }
    state: RecordingState = 'inactive';
    mimeType = 'audio/webm;codecs=opus';
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; }
  }
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
    useEffect: registerEffect,
    useLayoutEffect: registerEffect,
  };
  const source = readFileSync(new URL('../src/components/agent/use-dictation.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { useDictation?: typeof useDictation } = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === 'react') return react;
      if (name === './dictation') return dictation;
      throw new Error(`Unexpected hook dependency: ${name}`);
    },
    navigator: { mediaDevices: { getUserMedia } },
    MediaRecorder: Recorder,
    fetch: () => { throw new Error('This lifecycle test must not transcribe audio.'); },
  });
  function render() {
    cursor = 0;
    return exports.useDictation!({ active: true, onTranscript: () => assert.fail('Unexpected transcript') });
  }
  function setupEffects() {
    for (const effect of effects.values()) effect.cleanup = effect.setup() || undefined;
  }
  function cleanupEffects() {
    for (const effect of effects.values()) { effect.cleanup?.(); effect.cleanup = undefined; }
  }
  render();
  setupEffects();
  return {
    render,
    refresh() { cleanupEffects(); render(); setupEffects(); return render(); },
    dispose: cleanupEffects,
  };
}

test('effect replacement resets preserved permission state and permits another recording', async () => {
  let resolvePermission!: (stream: MediaStream) => void;
  const pendingPermission = new Promise<MediaStream>(resolve => { resolvePermission = resolve; });
  let stopped = 0;
  let attempts = 0;
  const stream = { getTracks: () => [{ stop: () => { stopped++; } }] } as unknown as MediaStream;
  const hook = hookFixture(() => ++attempts === 1 ? pendingPermission : Promise.resolve(stream));
  try {
    const pendingStart = hook.render().start();
    assert.equal(hook.render().state, 'requesting');
    assert.equal(hook.render().busy, true);

    const refreshed = hook.refresh();
    assert.equal(refreshed.state, 'idle');
    assert.equal(refreshed.busy, false);
    assert.equal(refreshed.error, '');

    resolvePermission(stream);
    assert.equal(await pendingStart, false);
    assert.equal(stopped, 1, 'a permission result belonging to the disposed effect must release its microphone');
    assert.equal(await refreshed.start(), true);
    assert.equal(hook.render().state, 'recording');
    hook.render().cancel();
    assert.equal(hook.render().state, 'idle');
    assert.equal(stopped, 2);
  } finally { hook.dispose(); resolvePermission(stream); }
});

test('effect replacement clears a preserved microphone error through the new session', async () => {
  const hook = hookFixture(async () => { throw new DOMException('Permission denied', 'NotAllowedError'); });
  try {
    assert.equal(await hook.render().start(), false);
    assert.equal(hook.render().state, 'error');
    assert.match(hook.render().error, /권한/);

    const refreshed = hook.refresh();
    assert.equal(refreshed.state, 'idle');
    assert.equal(refreshed.error, '');
    assert.equal(refreshed.busy, false);
  } finally { hook.dispose(); }
});
