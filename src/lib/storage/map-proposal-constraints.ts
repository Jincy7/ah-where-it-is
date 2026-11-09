import { VisionError } from '@/lib/ai/gemini';
import type { BinaryMapRelation, MapRelation, PositionMapRelation } from './map-proposal-types';
export type ProposalRect = { col: number; row: number; width: number; height: number };
export type ConstraintNode = { key: string; rect: ProposalRect; existing: boolean };
type Edge = { from: number; to: number; distance: number };
type WorkBudget = { remaining: number };
const MAX_CONSTRAINT_RELAXATIONS = 4_000_000;
export function isPositionRelation(relation: MapRelation): relation is PositionMapRelation { return relation.relation.startsWith('at_') || relation.relation === 'center'; }
export function isBinaryRelation(relation: MapRelation): relation is BinaryMapRelation { return !isPositionRelation(relation) && relation.relation !== 'between'; }
export function relationPlaceKeys(relation: MapRelation): string[] { return isPositionRelation(relation) ? [relation.subject] : relation.relation === 'between' ? [relation.subject, relation.target, relation.other_target] : [relation.subject, relation.target]; }
export function relationSlots(relation: MapRelation): string[] {
  if (isPositionRelation(relation)) {
    const axes = relation.relation === 'center' ? ['x', 'y'] : [relation.relation === 'at_left_edge' || relation.relation === 'at_right_edge' ? 'x' : 'y'];
    return axes.map(axis => `position:${relation.subject}:${axis}`);
  }
  if (relation.relation === 'between') return [`between:${relation.subject}`];
  const axis = relation.relation === 'above' || relation.relation === 'below' ? 'y' : 'x';
  return [`${axis}:${[relation.subject, relation.target].sort().join(':')}`];
}
export function normalizeBetweenRelations(nodes: ConstraintNode[], relations: MapRelation[], assumptions: string[]): MapRelation[] {
  return relations.map(relation => {
    if (relation.relation !== 'between') return relation;
    const first = nodes.find(node => node.key === relation.target)!, second = nodes.find(node => node.key === relation.other_target)!;
    const members = new Set([relation.subject, relation.target, relation.other_target]);
    const directions = relations.filter((other): other is BinaryMapRelation => isBinaryRelation(other) && other.relation !== 'next_to' && members.has(other.subject) && members.has(other.target));
    const statedAxes = new Set(directions.map(other => other.relation === 'above' || other.relation === 'below' ? 'vertical' : 'horizontal'));
    let axis = relation.axis;
    if (!axis || axis === 'auto') {
      const boundary = relations.find(other => other.subject === relation.subject && isPositionRelation(other) && other.relation !== 'center');
      if (boundary) axis = boundary.relation === 'at_left_edge' || boundary.relation === 'at_right_edge' ? 'vertical' : 'horizontal';
      else if (statedAxes.size === 1) axis = [...statedAxes][0];
      else if (first.existing && second.existing) axis = Math.abs(first.rect.row - second.rect.row) > Math.abs(first.rect.col - second.rect.col) ? 'vertical' : 'horizontal';
      else axis = 'horizontal';
      assumptions.push(`‘사이’의 방향이 지정되지 않아 ${axis === 'vertical' ? '세로(위·아래)' : '가로(왼쪽·오른쪽)'} 배치를 제안했습니다. 적용한 관계에서 순서를 확인해주세요`);
    }
    const ranks = new Map([[relation.target, 0], [relation.subject, 1], [relation.other_target, 2]]);
    const orientations = new Set(directions.filter(other => (other.relation === 'above' || other.relation === 'below' ? 'vertical' : 'horizontal') === axis).map(other => {
      const reversed = other.relation === 'right_of' || other.relation === 'below';
      const from = reversed ? other.target : other.subject, to = reversed ? other.subject : other.target;
      return ranks.get(from)! > ranks.get(to)!;
    }));
    if (orientations.size > 1) throw new VisionError('사이 관계와 명시한 방향 조건이 서로 충돌합니다. 세 장소의 순서를 확인해주세요', 400);
    const reverse = orientations.size ? orientations.has(true) : first.existing && second.existing && (axis === 'horizontal' ? first.rect.col > second.rect.col : first.rect.row > second.rect.row);
    return { ...relation, axis, ...(reverse ? { target: relation.other_target, other_target: relation.target } : {}) };
  });
}
function overlaps(a: ProposalRect, b: ProposalRect) { return a.col < b.col + b.width && b.col < a.col + a.width && a.row < b.row + b.height && b.row < a.row + a.height; }
function coordinates(count: number, edges: Edge[], work: WorkBudget): number[] | null {
  const values = Array<number>(count).fill(0);
  for (let pass = 0; pass < count; pass++) {
    work.remaining -= edges.length;
    if (work.remaining < 0) throw new VisionError('관계 조건이 복잡해 제한 시간 안에 모든 조건을 만족하는 배치를 찾지 못했습니다. 일부 관계를 나누어 적용하거나 구획 크기를 줄여주세요', 422);
    let changed = false;
    for (const edge of edges) if (values[edge.to] < values[edge.from] + edge.distance) { values[edge.to] = values[edge.from] + edge.distance; changed = true; }
    if (!changed) return values;
  }
  return null;
}
function samePair(a: BinaryMapRelation, b: BinaryMapRelation) { return [a.subject, a.target].sort().join(':') === [b.subject, b.target].sort().join(':'); }
function compiled(nodes: ConstraintNode[], relations: MapRelation[], columns: number, rows: number) {
  const origin = nodes.length, indices = new Map(nodes.map((node, i) => [node.key, i]));
  const x: Edge[] = [], y: Edge[] = [];
  const equality = (edges: Edge[], from: number, to: number, distance: number) => { edges.push({ from, to, distance }, { from: to, to: from, distance: -distance }); };
  const involved = new Set(relations.flatMap(relationPlaceKeys));
  nodes.forEach((node, i) => {
    x.push({ from: origin, to: i, distance: 0 }, { from: i, to: origin, distance: -(columns - node.rect.width) });
    y.push({ from: origin, to: i, distance: 0 }, { from: i, to: origin, distance: -(rows - node.rect.height) });
    if (node.existing && !involved.has(node.key)) { equality(x, origin, i, node.rect.col); equality(y, origin, i, node.rect.row); }
  });
  for (const relation of relations) {
    const subject = indices.get(relation.subject)!;
    if (isPositionRelation(relation)) {
      if (relation.relation === 'at_left_edge') equality(x, origin, subject, 0);
      if (relation.relation === 'at_right_edge') equality(x, origin, subject, columns - nodes[subject].rect.width);
      if (relation.relation === 'at_top_edge') equality(y, origin, subject, 0);
      if (relation.relation === 'at_bottom_edge') equality(y, origin, subject, rows - nodes[subject].rect.height);
      if (relation.relation === 'center') { equality(x, origin, subject, Math.floor((columns - nodes[subject].rect.width) / 2)); equality(y, origin, subject, Math.floor((rows - nodes[subject].rect.height) / 2)); }
      continue;
    }
    const target = indices.get(relation.target)!;
    if (relation.relation === 'between') {
      const other = indices.get(relation.other_target)!;
      const vertical = relation.axis === 'vertical', line = vertical ? y : x, align = vertical ? x : y;
      line.push({ from: target, to: subject, distance: vertical ? nodes[target].rect.height : nodes[target].rect.width }, { from: subject, to: other, distance: vertical ? nodes[subject].rect.height : nodes[subject].rect.width });
      const boundary = relations.find(candidate => candidate.subject === relation.subject && (vertical ? ['at_left_edge', 'at_right_edge'] : ['at_top_edge', 'at_bottom_edge']).includes(candidate.relation));
      for (const endpoint of [target, other]) {
        const subjectSize = vertical ? nodes[subject].rect.width : nodes[subject].rect.height, endpointSize = vertical ? nodes[endpoint].rect.width : nodes[endpoint].rect.height;
        const offset = boundary?.relation === 'at_left_edge' || boundary?.relation === 'at_top_edge' ? 0 : boundary ? subjectSize - endpointSize : Math.floor((subjectSize - endpointSize) / 2);
        equality(align, subject, endpoint, offset);
      }
      continue;
    }
    let from = subject, to = target;
    if (relation.relation === 'right_of' || relation.relation === 'below') [from, to] = [to, from];
    if (relation.relation === 'next_to') {
      const explicit = relations.find((candidate): candidate is BinaryMapRelation => isBinaryRelation(candidate) && ['left_of', 'right_of'].includes(candidate.relation) && samePair(candidate, relation));
      if (explicit) { from = indices.get(explicit.relation === 'right_of' ? explicit.target : explicit.subject)!; to = indices.get(explicit.relation === 'right_of' ? explicit.subject : explicit.target)!; }
      else if (nodes[from].existing && nodes[to].existing && nodes[to].rect.col + nodes[to].rect.width <= nodes[from].rect.col) [from, to] = [to, from];
      equality(x, from, to, nodes[from].rect.width); equality(y, from, to, 0);
    } else if (relation.relation === 'above' || relation.relation === 'below') y.push({ from, to, distance: nodes[from].rect.height });
    else x.push({ from, to, distance: nodes[from].rect.width });
  }
  return { x, y };
}
function fit(nodes: ConstraintNode[], x: Edge[], y: Edge[], work: WorkBudget): ProposalRect[] | null {
  const origin = nodes.length, xs = coordinates(origin + 1, x, work), ys = coordinates(origin + 1, y, work);
  if (!xs || !ys) return null;
  return nodes.map((node, i) => ({ ...node.rect, col: xs[i] - xs[origin], row: ys[i] - ys[origin] }));
}
function pack(nodes: ConstraintNode[], x: Edge[], y: Edge[], budget: { remaining: number }, work: WorkBudget): ProposalRect[] | null {
  if (--budget.remaining < 0) return null;
  const current = fit(nodes, x, y, work);
  if (!current) return null;
  let collision: [number, number] | null = null;
  for (let a = 0; a < nodes.length && !collision; a++) for (let b = a + 1; b < nodes.length; b++) if (overlaps(current[a], current[b])) { collision = [a, b]; break; }
  if (!collision) return current;
  const [a, b] = collision;
  const candidates: { x: Edge[]; y: Edge[]; score: number }[] = [];
  for (const horizontal of [true, false]) for (const [from, to] of [[a, b], [b, a]]) {
    const edge = { from, to, distance: horizontal ? nodes[from].rect.width : nodes[from].rect.height };
    const nx = horizontal ? [...x, edge] : x, ny = horizontal ? y : [...y, edge], rects = fit(nodes, nx, ny, work);
    if (!rects) continue;
    const width = Math.max(...rects.map(rect => rect.col + rect.width)), height = Math.max(...rects.map(rect => rect.row + rect.height));
    const movement = nodes.reduce((sum, node, i) => sum + (node.existing ? Math.abs(rects[i].col - node.rect.col) + Math.abs(rects[i].row - node.rect.row) : 0), 0);
    candidates.push({ x: nx, y: ny, score: width * height + movement / 100 });
  }
  candidates.sort((a, b) => a.score - b.score);
  for (const candidate of candidates) { const result = pack(nodes, candidate.x, candidate.y, budget, work); if (result) return result; }
  return null;
}
export function layoutMapConstraints(nodes: ConstraintNode[], relations: MapRelation[], columns: number, rows: number, assumptions: string[]) {
  // Absolute center/edge equations are not monotonic in grid size: a valid
  // 12-column layout can be impossible at 64. Test actual candidate grids.
  const work: WorkBudget = { remaining: MAX_CONSTRAINT_RELAXATIONS };
  const grids: { columns: number; rows: number }[] = [];
  for (let width = columns; width <= 64; width++) for (let height = rows; height <= 64; height++) grids.push({ columns: width, rows: height });
  grids.sort((a, b) => a.columns * a.rows - b.columns * b.rows || (a.columns - columns) + (a.rows - rows) - (b.columns - columns) - (b.rows - rows) || a.columns - b.columns);
  for (const grid of grids) {
    const constraints = compiled(nodes, relations, grid.columns, grid.rows);
    const rects = pack(nodes, constraints.x, constraints.y, { remaining: 512 }, work);
    if (!rects) continue;
    if (relations.some(isPositionRelation)) assumptions.push('벽·가운데는 지도 격자의 경계·중앙을 기준으로 맞췄습니다. 실제 벽이나 실측 중심을 확인한 것은 아닙니다');
    if (relations.some(relation => relation.relation === 'center')) assumptions.push('중앙은 구획을 격자에 맞추기 위해 반 칸 이내로 조정될 수 있습니다');
    if (relations.some(relation => relation.relation === 'next_to')) assumptions.push('‘옆’은 경계를 맞댄 좌우 배치로 제안했습니다. 적용한 방향을 확인해주세요');
    if (grid.columns !== columns || grid.rows !== rows) assumptions.push(`모든 관계를 유지하려고 격자를 ${grid.columns}×${grid.rows}칸으로 확장했습니다`);
    return { ...grid, rects };
  }
  throw new VisionError('조건을 모두 유지하면서 겹치지 않는 배치를 찾지 못했습니다. 64×64칸 안에서 구획 크기나 관계를 조정해주세요', 422);
}
