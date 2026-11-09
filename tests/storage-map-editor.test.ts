import assert from 'node:assert/strict'
import test from 'node:test'
import { gridResizeProblem, rectangleCells, rectangleProblem, selectionRectangle, transformRegion } from '../src/components/storage-map/editor-state'

test('forward and reverse drag include both boundary cells', () => {
  const forward = selectionRectangle({ col: 2, row: 1 }, { col: 5, row: 3 })
  assert.deepEqual(forward, selectionRectangle({ col: 5, row: 3 }, { col: 2, row: 1 }))
  assert.equal(rectangleCells(forward).length, 12)
  assert.deepEqual(rectangleCells(selectionRectangle({ col: 0, row: 0 }, { col: 0, row: 0 })), [{ col: 0, row: 0 }])
})
test('collision and invalid coordinates are rejected without removing existing cells', () => {
  const region = { id: 'r', cells: rectangleCells({ col: 1, row: 1, width: 2, height: 2 }) }
  assert.match(rectangleProblem({ col: 2, row: 2, width: 2, height: 2 }, 12, 8, [region])!, /겹칩니다/)
  assert.equal(region.cells.length, 4)
  assert.ok(rectangleProblem({ col: 11, row: 7, width: 2, height: 1 }, 12, 8, []))
  assert.equal(rectangleProblem({ col: 11, row: 7, width: 1, height: 1 }, 12, 8, []), null)
})
test('moving carries anchors and shrink reports only anchors that become unplaced', () => {
  const region = { id: 'r', cells: rectangleCells({ col: 1, row: 1, width: 3, height: 3 }) }
  const anchors = [{ region_id: 'r', container_id: 'a', col: 1, row: 1 }, { region_id: 'r', container_id: 'b', col: 3, row: 3 }]
  const moved = transformRegion(region, { col: 4, row: 2, width: 3, height: 3 }, anchors)
  assert.deepEqual(moved.anchors.map(({ col, row }) => ({ col, row })), [{ col: 4, row: 2 }, { col: 6, row: 4 }])
  assert.equal(moved.removed.length, 0)
  const shrunk = transformRegion(region, { col: 1, row: 1, width: 2, height: 2 }, anchors)
  assert.deepEqual(shrunk.removed.map(anchor => anchor.container_id), ['b'])
  assert.equal(anchors.length, 2)
})
test('grid resize preserves occupied cells and markers and allows expansion to 64', () => {
  assert.ok(gridResizeProblem(5, 5, [], [{ col: 5, row: 0 }]))
  assert.ok(gridResizeProblem(5, 5, [{ id: 'r', cells: [{ col: 0, row: 5 }] }], []))
  assert.equal(gridResizeProblem(64, 64, [], [{ col: 63, row: 63 }]), null)
})
