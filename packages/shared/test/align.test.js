import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  alignTieBreak,
  compareCandidate,
  encodeGrid,
  searchBestAlignment,
} from '../dist/index.js';

const SYMBOLS = ['A', 'B', 'C'];

// 8 列 × 4 行基准网格（刻意非周期，避免意外平分）
const GRID = [
  ['A', 'B', 'B', 'A', 'C', 'A', 'B', 'C'],
  ['C', 'C', 'A', 'A', 'B', 'A', 'B', 'A'],
  ['A', 'A', 'B', 'C', 'C', 'B', 'A', 'A'],
  ['B', 'A', 'C', 'A', 'A', 'C', 'B', 'B'],
];
const WIDTH = 8;
const HEIGHT = 4;

/** 网格 → 口令文本（偶数行自动按 ← 读取） */
function textOf(grid) {
  return encodeGrid({ grid, width: grid[0].length, height: grid.length }).text;
}

/** 视觉坐标循环平移：out[r][c] = src[(r-dr) mod h][(c-dc) mod w]（正数向下/向右） */
function shiftGrid(src, dr, dc) {
  const h = src.length;
  const w = src[0].length;
  const mod = (a, n) => ((a % n) + n) % n;
  return Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) => src[mod(r - dr, h)][mod(c - dc, w)]),
  );
}

function align(text, grid = GRID, maxShift = 3, width = WIDTH, height = HEIGHT) {
  return searchBestAlignment({ text, width, height, grid, symbols: SYMBOLS, maxShift });
}

function totalDiffs(cmp) {
  return cmp.totals.added + cmp.totals.missing + cmp.totals.replaced;
}

test('原始差异与对版合计一致；候选整体平移后最佳偏移恰好反向抵消', () => {
  const text = textOf(shiftGrid(GRID, 1, 2)); // 候选 = 网格向下 1 行、向右 2 列
  const res = align(text);
  const cmp = compareCandidate({ text, width: WIDTH, height: HEIGHT, grid: GRID, symbols: SYMBOLS });
  assert.ok(res.originalDiffs > 0);
  assert.equal(res.originalDiffs, totalDiffs(cmp));
  assert.equal(res.comparableRows, HEIGHT);
  // 最佳方案：把候选向上 1 行、向左 2 列循环平移，差异归零
  assert.deepEqual(
    { dr: res.best.dr, dc: res.best.dc, diffs: res.best.diffs },
    { dr: -1, dc: -2, diffs: 0 },
  );
  // 用最佳偏移做预览比较，差异格总数与搜索结果一致
  const preview = compareCandidate({
    text,
    width: WIDTH,
    height: HEIGHT,
    grid: GRID,
    symbols: SYMBOLS,
    offset: { dr: res.best.dr, dc: res.best.dc },
  });
  assert.equal(totalDiffs(preview), 0);
  assert.equal(preview.cells.length, 0);
});

test('全部偏移同分时按决胜链取零偏移；决胜比较器为全序', () => {
  const flat = Array.from({ length: HEIGHT }, () => new Array(WIDTH).fill('A'));
  const res = align(textOf(flat), flat, 2);
  assert.deepEqual(
    { dr: res.best.dr, dc: res.best.dc, diffs: res.best.diffs },
    { dr: 0, dc: 0, diffs: 0 },
  );

  // 决胜顺序：曼哈顿距离 → |行| → |列| → 带符号行 → 带符号列
  const shuffled = [
    { dr: 1, dc: 1 },
    { dr: -1, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: -1, dc: -1 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 0 },
  ];
  assert.deepEqual([...shuffled].sort(alignTieBreak), [
    { dr: 0, dc: 0 }, // 曼哈顿 0
    { dr: 0, dc: -1 }, // 曼哈顿 1、|行| 0、带符号列 -1 优先
    { dr: 0, dc: 1 }, // 曼哈顿 1、|行| 0
    { dr: -1, dc: 0 }, // 曼哈顿 1、|行| 1、带符号行 -1 优先
    { dr: 1, dc: 0 }, // 曼哈顿 1、|行| 1
    { dr: -1, dc: -1 }, // 曼哈顿 2、带符号行 -1 优先
    { dr: 1, dc: 1 }, // 曼哈顿 2
  ]);
});

test('同分偏移按带符号列偏移决胜：周期 2 网格中 (0,-1) 先于 (0,+1)', () => {
  // 每行水平周期 2；候选 = 网格右移 1 列 → (0,-1) 与 (0,+1) 同为 0 分
  const g = [
    ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'],
    ['B', 'C', 'B', 'C', 'B', 'C', 'B', 'C'],
    ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'],
    ['C', 'A', 'C', 'A', 'C', 'A', 'C', 'A'],
  ];
  const res = align(textOf(shiftGrid(g, 0, 1)), g, 3);
  assert.equal(res.originalDiffs, WIDTH * HEIGHT); // 相邻符号全不同
  assert.deepEqual(
    { dr: res.best.dr, dc: res.best.dc, diffs: res.best.diffs },
    { dr: 0, dc: -1, diffs: 0 },
  );
});

test('针数错误或缺失的候选行不参与评分，最佳差异可为 0', () => {
  // 候选第 1、3 行 = 网格右移 2 列；第 2 行 9 针（针数错误）；第 4 行缺失
  const shifted = shiftGrid(GRID, 0, 2);
  const lines = encodeGrid({ grid: shifted, width: WIDTH, height: HEIGHT }).lines;
  const text = [lines[0].canonical, 'B9', lines[2].canonical].join('\n');
  const res = align(text);
  assert.equal(res.comparableRows, 2); // 仅第 1、3 行可比较
  assert.ok(res.originalDiffs > 0);
  assert.deepEqual(
    { dr: res.best.dr, dc: res.best.dc, diffs: res.best.diffs },
    { dr: 0, dc: -2, diffs: 0 },
  );
  // 最佳偏移下预览：第 2、4 行仍不可比较，可比较行零差异
  const preview = compareCandidate({
    text,
    width: WIDTH,
    height: HEIGHT,
    grid: GRID,
    symbols: SYMBOLS,
    offset: { dr: res.best.dr, dc: res.best.dc },
  });
  assert.equal(totalDiffs(preview), 0);
  assert.deepEqual(
    preview.rows.map((r) => r.status),
    ['same', 'invalid', 'same', 'missing'],
  );
});

test('行平移后不可比较行跟随候选源循环换位', () => {
  // 候选 = 网格整体下移 1 行（视觉坐标），再把第 1 行改为针数错误（9 针）
  const shifted = shiftGrid(GRID, 1, 0);
  const lines = encodeGrid({ grid: shifted, width: WIDTH, height: HEIGHT }).lines.map(
    (l) => l.canonical,
  );
  lines[0] = 'B9';
  const text = lines.join('\n');
  const res = compareCandidate({
    text,
    width: WIDTH,
    height: HEIGHT,
    grid: GRID,
    symbols: SYMBOLS,
    offset: { dr: -1, dc: 0 }, // 候选向上循环平移 1 行
  });
  // 网格第 1–3 行分别对上候选第 2–4 行（= 网格第 1–3 行）→ 一致
  assert.deepEqual(
    res.rows.map((r) => r.status),
    ['same', 'same', 'same', 'invalid'],
  );
  // 网格第 4 行对上候选第 1 行（针数错误），不可比较并注明来源
  assert.match(res.rows[3].reason ?? '', /候选第 1 行/);
  assert.equal(res.cells.length, 0);
});

test('最大偏移限定枚举范围：够不到的对齐不入选，maxShift=0 时只有原始对齐', () => {
  const text = textOf(shiftGrid(GRID, 0, 3)); // 候选右移 3 列
  const narrow = align(text, GRID, 2);
  assert.ok(narrow.best.diffs > 0); // ±2 内无法完全对齐
  const wide = align(text, GRID, 3);
  assert.deepEqual(
    { dr: wide.best.dr, dc: wide.best.dc, diffs: wide.best.diffs },
    { dr: 0, dc: -3, diffs: 0 },
  );
  const frozen = align(text, GRID, 0);
  assert.deepEqual(
    { dr: frozen.best.dr, dc: frozen.best.dc },
    { dr: 0, dc: 0 },
  );
  assert.equal(frozen.best.diffs, frozen.originalDiffs);
});

test('空候选：没有可比较行，所有偏移同分，最佳为零偏移', () => {
  const res = align('', GRID, 3);
  assert.equal(res.comparableRows, 0);
  assert.equal(res.originalDiffs, 0);
  assert.deepEqual(
    { dr: res.best.dr, dc: res.best.dc, diffs: res.best.diffs },
    { dr: 0, dc: 0, diffs: 0 },
  );
});

test('错位对齐搜索与预览均不修改当前网格', () => {
  const grid = GRID.map((r) => [...r]);
  const snapshot = JSON.stringify(grid);
  const text = textOf(shiftGrid(grid, 2, 1));
  const res = align(text, grid, 3);
  compareCandidate({
    text,
    width: WIDTH,
    height: HEIGHT,
    grid,
    symbols: SYMBOLS,
    offset: { dr: res.best.dr, dc: res.best.dc },
  });
  assert.equal(JSON.stringify(grid), snapshot);
});

test('offset 缺省或为零时与原始对版完全一致', () => {
  const text = textOf(shiftGrid(GRID, 1, 1));
  const plain = compareCandidate({ text, width: WIDTH, height: HEIGHT, grid: GRID, symbols: SYMBOLS });
  const zero = compareCandidate({
    text,
    width: WIDTH,
    height: HEIGHT,
    grid: GRID,
    symbols: SYMBOLS,
    offset: { dr: 0, dc: 0 },
  });
  assert.deepEqual(zero, plain);
});
