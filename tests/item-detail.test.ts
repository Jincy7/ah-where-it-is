import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { WorkspaceItem } from '../src/lib/storage/types';
import type { StorageItemDetail } from '../src/lib/storage/item-detail-types';
import type { useItemDetail } from '../src/components/storage-workspace/use-item-detail';

const require = createRequire(import.meta.url);
type Element = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
function findAll(value: unknown, predicate: (node: Element) => boolean): Element[] {
  if (Array.isArray(value)) return value.flatMap(child => findAll(child, predicate));
  if (!value || typeof value !== 'object') return [];
  const node = value as Element;
  return [...(predicate(node) ? [node] : []), ...findAll(node.props?.children, predicate)];
}
function compile(file: string, imports: Record<string, unknown> = {}, globals: Record<string, unknown> = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, (...args: never[]) => unknown> = {};
  runInNewContext(output, { exports, AbortController, Error, ...globals, require: (name: string) => {
    if (name in imports) return imports[name];
    if (name.startsWith('@/components/ui/')) return new Proxy({}, { get: (_, key) => key });
    return require(name);
  } });
  return exports;
}
const item: WorkspaceItem = { id: 'item-a', name: '여권', quantity: 2, description: '파란 케이스', container_id: 'container-a', container_name: '서랍', location_name: '서재', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-02T00:00:00Z', version: 1, match_reason: '등록된 기록', media: [] };

test('result content opens item details by native button while action buttons remain separate', () => {
  const { ResultsCard } = compile('../src/components/storage-workspace/results-card.tsx');
  let selected: WorkspaceItem | undefined;
  const tree = ResultsCard({ items: [item], locked: true, onOpenDetail: (value: WorkspaceItem) => { selected = value; }, onEdit() {}, onMove() {}, onDelete() {}, onShowMap() {} } as never);
  const buttons = findAll(tree, node => node.type === 'button');
  const main = buttons.find(node => node.props['aria-label'] === '여권 상세 보기');
  assert.ok(main, 'each item has a keyboard-accessible detail button');
  assert.equal(main.props.disabled, undefined, 'read-only details remain accessible during a prepared action');
  assert.equal(findAll(main.props.children, node => node.type === 'button' || node.type === 'Button' || node.type === 'a').length, 0, 'interactive children are not nested');
  (main.props.onClick as () => void)();
  assert.equal(selected, item);
  const menu = findAll(tree, node => node.props['aria-label'] === '여권 작업')[0];
  assert.equal(menu.props.disabled, true, 'existing mutation lock is preserved');
});

function detailFixture() {
  const slots: unknown[] = [];
  let cursor = 0;
  let id = item.id;
  let revision = 0;
  const effects: Array<() => void> = [];
  const cleanups = new Map<number, () => void>();
  const listeners = new Map<string, () => void>();
  const requests: Array<{ url: string; signal: AbortSignal; resolve: (detail: StorageItemDetail) => void; reject: (error: Error) => void }> = [];
  class StorageRequestError extends Error { constructor(message: string, public status: number) { super(message); } }
  const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState<T>(initial: T) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value: T) => { slots[index] = value; }]; },
    useRef<T>(initial: T) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback<T>(callback: T, deps: unknown[]) { const index = cursor++; const prior = slots[index] as { deps: unknown[]; callback: T } | undefined; if (!prior || !same(prior.deps, deps)) slots[index] = { deps, callback }; return (slots[index] as { callback: T }).callback; },
    useEffect(setup: () => void | (() => void), deps: unknown[]) { const index = cursor++; const prior = slots[index] as unknown[] | undefined; if (!prior || !same(prior, deps)) { slots[index] = deps; effects.push(() => { cleanups.get(index)?.(); const cleanup = setup(); if (cleanup) cleanups.set(index, cleanup); }); } },
  };
  const document = { hidden: false, addEventListener: (event: string, fn: () => void) => listeners.set(event, fn), removeEventListener: (event: string) => listeners.delete(event) };
  const window = { ...document };
  const exported = compile('../src/components/storage-workspace/use-item-detail.ts', { react, './contracts': { StorageRequestError, storageRequest: (url: string, init: RequestInit) => new Promise<StorageItemDetail>((resolve, reject) => requests.push({ url, signal: init.signal as AbortSignal, resolve, reject })) } }, { document, window });
  const render = () => { cursor = 0; return exported.useItemDetail(id as never, revision as never) as ReturnType<typeof useItemDetail>; };
  const flush = () => { effects.splice(0).forEach(effect => effect()); return render(); };
  render(); flush();
  return { render, flush, requests, StorageRequestError, document, listeners, changeId: (next: string) => { id = next; return render(); }, changeRevision: () => { revision++; render(); return flush(); }, dispose: () => cleanups.forEach(fn => fn()) };
}
const detail: StorageItemDetail = { item: { ...item, location_id: 'location-a', media: [] }, checked_at: '2026-11-09T00:00:00Z' };
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test('detail refresh clears old path and deleted or failed records never retain actionable item values', async () => {
  const fixture = detailFixture();
  fixture.requests[0].resolve(detail);
  await settle();
  assert.equal(fixture.render().detail?.item.container_name, '서랍');
  fixture.changeRevision();
  assert.equal(fixture.render().detail, null, 'old location is hidden while refreshing');
  fixture.requests[1].resolve({ ...detail, item: { ...detail.item, container_name: '새 보관함', version: 2 } });
  await settle();
  assert.equal(fixture.render().detail?.item.container_name, '새 보관함');
  const loading = fixture.render().reload();
  fixture.requests[2].reject(new fixture.StorageRequestError('삭제됨', 404));
  await loading;
  assert.equal(fixture.render().deleted, true);
  assert.equal(fixture.render().detail, null);
  const retry = fixture.render().reload();
  fixture.requests[3].reject(new Error('네트워크 연결 실패'));
  await retry;
  assert.equal(fixture.render().deleted, false, 'network errors are not mistaken for deletion');
  assert.equal(fixture.render().detail, null);
  assert.equal(fixture.render().error, '네트워크 연결 실패');
  fixture.dispose();
});

test('late detail responses cannot replace another item or update a closed dialog', async () => {
  const fixture = detailFixture();
  assert.equal(fixture.changeId('item-b').detail, null);
  fixture.flush();
  assert.equal(fixture.requests[0].signal.aborted, true);
  fixture.requests[1].resolve({ ...detail, item: { ...detail.item, id: 'item-b', name: '충전기' } });
  await settle();
  fixture.requests[0].resolve(detail);
  await settle();
  assert.equal(fixture.render().detail?.item.id, 'item-b');
  const pending = fixture.render().reload();
  fixture.dispose();
  fixture.requests[2].resolve(detail);
  await pending;
  assert.equal(fixture.requests[2].signal.aborted, true);
  assert.equal(fixture.render().detail, null);
  assert.equal(fixture.listeners.size, 0);
});

test('open details refresh on focus and tab visibility without requesting hidden pages', () => {
  const fixture = detailFixture();
  fixture.document.hidden = true;
  fixture.listeners.get('focus')!();
  assert.equal(fixture.requests.length, 1);
  fixture.document.hidden = false;
  fixture.listeners.get('visibilitychange')!();
  assert.equal(fixture.requests.length, 2);
  fixture.listeners.get('focus')!();
  assert.equal(fixture.requests.length, 3);
  assert.equal(fixture.requests[1].signal.aborted, true);
  fixture.dispose();
});

test('detail dialog exposes owned original photos and keeps mutation locks separate from map lookup', () => {
  const photoDetail = { ...detail, item: { ...detail.item, media: [{ id: 'media-a', url: 'https://example.test/private-signed-photo', created_at: '2026-11-01T01:23:00Z' }] } };
  const { ItemDetailDialog } = compile('../src/components/storage-workspace/item-detail-dialog.tsx', { './use-item-detail': { useItemDetail: () => ({ detail: photoDetail, loading: false, error: '', deleted: false, reload() {} }) } });
  let mapped: WorkspaceItem | undefined;
  const tree = ItemDetailDialog({ itemId: item.id, refreshKey: 0, locked: true, onClose() {}, onShowMap: (value: WorkspaceItem) => { mapped = value; }, onEdit() {}, onMove() {} } as never);
  const original = findAll(tree, node => node.type === 'a' && node.props['aria-label'] === '여권 사진 1 원본 보기')[0];
  assert.equal(original.props.href, photoDetail.item.media[0].url);
  assert.equal(original.props.target, '_blank');
  const text = (value: unknown): string => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text((value as Element).props?.children) : typeof value === 'string' ? value : '';
  const buttons = findAll(tree, node => node.type === 'Button');
  assert.equal(buttons.find(node => text(node) === '이름·수량 수정')?.props.disabled, true);
  assert.equal(buttons.find(node => text(node) === '이동')?.props.disabled, true);
  const map = buttons.find(node => text(node) === '지도에서 보기')!;
  assert.equal(map.props.disabled, undefined);
  (map.props.onClick as () => void)();
  assert.equal(mapped?.container_id, item.container_id);
  assert.match(text(tree), /사진 등록/);
  assert.match(text(tree), /마지막 변경/);
});
