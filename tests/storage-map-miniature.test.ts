import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StorageMapMiniature, mapMiniatureSize } from '../src/components/storage-map/storage-map-miniature'

test('chat miniature fits both dimensions without cropping or changing the grid ratio', () => {
  for (const [columns, rows] of [[12, 8], [64, 64], [1, 64], [64, 1]]) {
    const size = mapMiniatureSize(columns, rows)
    assert.ok(size.width <= 240 && size.height <= 160)
    assert.ok(Math.abs(size.width / size.height - columns / rows) < 0.001)
  }
  assert.deepEqual(mapMiniatureSize(12, 8), { width: 240, height: 160 })
})

test('thumbnail preserves grid geometry and exposes an accessible expand action', () => {
  const html = renderToStaticMarkup(createElement(StorageMapMiniature, {
    columns: 12, rows: 8, title: '우리 집 배치',
    regions: [{ id: 'room', location_id: 'place', client_location_key: null, color_key: 'green', location_name: '서재', cells: [{ col: 11, row: 7 }] }],
    anchors: [{ container_id: 'box', region_id: 'room', col: 11, row: 7 }],
  }))
  assert.match(html, /aria-label="우리 집 배치 크게 보기"/)
  assert.match(html, /width:240px/)
  assert.match(html, /viewBox="0 0 480 320"/)
  assert.match(html, /translate\(460 309\)/)
})

test('historical static miniature contains no action button', () => {
  const html = renderToStaticMarkup(createElement(StorageMapMiniature, { columns: 12, rows: 8, regions: [], anchors: [], interactive: false }))
  assert.doesNotMatch(html, /<button/)
  assert.match(html, /<svg/)
})
