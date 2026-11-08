import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { ContainerEditor } from '../src/components/storage-workspace/editors';

const require = createRequire(import.meta.url);
type Element = { type: unknown; props: { id?: string; children?: unknown; onChange?: (event: unknown) => void; onSubmit?: (event: unknown) => Promise<void> } };

function editorFixture(prepare: (...args: unknown[]) => Promise<void> = async () => {}) {
  const slots: unknown[] = [];
  const effects: Array<() => void | (() => void)> = [];
  const errors: string[] = [];
  let cursor = 0;
  let resolveUpload!: (value: { media: { id: string } }) => void;
  let rejectUpload!: (error: Error) => void;
  let signal: AbortSignal | undefined;
  let currentEditor: string | null = 'container';
  const upload = new Promise<{ media: { id: string } }>((resolve, reject) => { resolveUpload = resolve; rejectUpload = reject; });
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
    useEffect(setup: () => void | (() => void)) { cursor++; effects.push(setup); },
  };
  const source = readFileSync(new URL('../src/components/storage-workspace/editors.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: { ContainerEditor?: typeof ContainerEditor } = {};
  runInNewContext(compiled, {
    exports,
    AbortController,
    require: (name: string) => {
      if (name === 'react') return react;
      if (name.startsWith('@/components/ui/')) return new Proxy({}, { get: (_, key) => key });
      if (name === 'sonner') return { toast: { error: (message: string) => errors.push(message) } };
      if (name === './contracts') return { storageRequest: (_url: string, init: RequestInit) => { signal = init.signal ?? undefined; return upload; } };
      return require(name);
    },
  });
  function render() {
    cursor = 0;
    return exports.ContainerEditor!({ locations: [], prepare: prepare as never, onPrepared: () => { currentEditor = null; } }) as Element;
  }
  function find(element: unknown, id: string): Element | undefined {
    if (!element || typeof element !== 'object') return undefined;
    const node = element as Element;
    if (node.props?.id === id) return node;
    return [node.props?.children].flat(Infinity).map(child => find(child, id)).find(Boolean);
  }
  const tree = render();
  const cleanup = effects.map(setup => setup()).filter((value): value is () => void => typeof value === 'function');
  find(tree, 'container-name')!.props.onChange!({ target: { value: '사진 보관함' } });
  find(tree, 'container-photo')!.props.onChange!({ target: { files: [{ type: 'image/jpeg' }] } });
  return {
    submit: () => render().props.onSubmit!({ preventDefault() {} }),
    dispose: () => cleanup.forEach(fn => fn()),
    replaceEditor: () => { currentEditor = 'new item draft'; },
    currentEditor: () => currentEditor,
    signal: () => signal,
    resolveUpload: () => resolveUpload({ media: { id: 'retained-cover' } }),
    rejectUpload,
    errors,
  };
}

test('closing a container editor during upload cannot prepare or close its replacement', async () => {
  let prepared = 0;
  const editor = editorFixture(async () => { prepared++; });
  const submitting = editor.submit();
  editor.dispose();
  editor.replaceEditor();
  editor.resolveUpload(); // A transport may finish even after cancellation.
  await submitting;
  assert.equal(prepared, 0);
  assert.equal(editor.currentEditor(), 'new item draft');
  assert.equal(editor.signal()?.aborted, true);
});

test('cancelling an upload suppresses its abort error', async () => {
  const editor = editorFixture();
  const submitting = editor.submit();
  editor.dispose();
  editor.rejectUpload(new DOMException('Upload aborted', 'AbortError'));
  await submitting;
  assert.deepEqual(editor.errors, []);
  assert.equal(editor.signal()?.aborted, true);
});

test('unmounting after upload cannot close another editor when preparation returns', async () => {
  let resolvePrepare!: () => void;
  const prepared = new Promise<void>(resolve => { resolvePrepare = resolve; });
  const editor = editorFixture(() => prepared);
  const submitting = editor.submit();
  editor.resolveUpload();
  await Promise.resolve();
  editor.dispose();
  editor.replaceEditor();
  resolvePrepare();
  await submitting;
  assert.equal(editor.currentEditor(), 'new item draft');
});

test('an active container editor still prepares its uploaded photo before closing', async () => {
  const changes: unknown[][] = [];
  const editor = editorFixture(async (...args) => { changes.push(args); });
  const submitting = editor.submit();
  editor.resolveUpload();
  await submitting;
  assert.equal(changes.length, 1);
  assert.equal(changes[0][0], 'create_container');
  assert.equal((changes[0][1] as { cover_media_id: string }).cover_media_id, 'retained-cover');
  assert.equal(editor.currentEditor(), null);
  editor.dispose();
});
