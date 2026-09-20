import type {
  AlignCandidate,
  AlignOffset,
  AlignSearchRequest,
  AlignSearchResult,
} from './types.js';
import { DIFF_BASE_SYMBOL } from './diff.js';
import { analyzeText, placeRuns } from './rle.js';

/** 错位对齐搜索：用户可选最大偏移的范围与默认值（行、列方向相同） */
export const ALIGN_SHIFT_MIN = 0;
export const ALIGN_SHIFT_MAX = 8;
export const ALIGN_SHIFT_DEFAULT = 3;

/** 正取模（防御负偏移） */
function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/**
 * 错位对齐的同分决胜顺序（全部升序）：
 * 偏移曼哈顿距离 → 行偏移绝对值 → 列偏移绝对值 → 带符号行偏移 → 带符号列偏移。
 * 该比较器是 (dr, dc) 的全序，枚举范围内结果唯一、稳定。
 */
export function alignTieBreak(a: AlignOffset, b: AlignOffset): number {
  return (
    Math.abs(a.dr) + Math.abs(a.dc) - (Math.abs(b.dr) + Math.abs(b.dc)) ||
    Math.abs(a.dr) - Math.abs(b.dr) ||
    Math.abs(a.dc) - Math.abs(b.dc) ||
    a.dr - b.dr ||
    a.dc - b.dc
  );
}

/**
 * 错位对齐搜索：把可比较的候选图案（针数恰好等于行宽的候选行，
 * 已按各自编织方向落针为视觉坐标）在行、列方向做循环平移，
 * 枚举 [-maxShift, +maxShift] 内的全部偏移，按差异格总数选出最佳方案。
 *
 * - 评分完全在视觉坐标上进行：偏移 (dr, dc) 表示把候选图案整体向下/向右
 *   循环平移，网格本身不动，偶数行绝不镜像；
 * - 针数错误或缺失的候选行在任何偏移下都不参与评分（落到哪一行，哪一行
 *   就不计入该偏移的差异总数）；
 * - 零偏移（原始对齐）必定精确评分并写入 originalDiffs；
 * - 同分时按 {@link alignTieBreak} 的顺序稳定决胜。
 */
export function searchBestAlignment(
  req: AlignSearchRequest,
): AlignSearchResult {
  const { text, width, height, grid, symbols } = req;
  const base = (req.baseSymbol ?? DIFF_BASE_SYMBOL).toUpperCase();
  const maxShift = Number.isFinite(req.maxShift)
    ? Math.max(ALIGN_SHIFT_MIN, Math.min(ALIGN_SHIFT_MAX, Math.trunc(req.maxShift)))
    : ALIGN_SHIFT_DEFAULT;

  // 候选口令逐行落针（视觉坐标）；针数错误/缺失的行为 null，不参与评分
  const analysis = analyzeText({ text, width, height, symbols });
  const byRow = new Map(analysis.rows.map((r) => [r.row, r]));
  const candRows: (string[] | null)[] = [];
  for (let row = 1; row <= height; row += 1) {
    const analyzed = byRow.get(row);
    candRows.push(
      analyzed && analyzed.runs !== null
        ? placeRuns(analyzed.runs, row, width)
        : null,
    );
  }
  const comparableRows = candRows.filter((r) => r !== null).length;

  // 网格符号归一化（与 compareCandidate 同一口径：缺格按底色、大小写不敏感）
  const gridRows = Array.from({ length: height }, (_, r) =>
    Array.from({ length: width }, (_, c) =>
      (grid[r]?.[c] ?? base).toUpperCase(),
    ),
  );

  /**
   * 指定偏移下的差异格总数（仅可比较行参与）。
   * limit 用于提前放弃：部分差异已达 limit 时该方案绝无可能胜出，
   * 返回值不再精确（保证 ≥ limit），调用方只取严格小于当前最优的结果。
   */
  function scoreAt(dr: number, dc: number, limit: number): number {
    let total = 0;
    for (let r = 0; r < height; r += 1) {
      const src = candRows[mod(r - dr, height)];
      if (src === null) continue; // 针数错误/缺失行不参与评分
      const g = gridRows[r];
      for (let c = 0; c < width; c += 1) {
        if (g[c] !== src[mod(c - dc, width)]) {
          total += 1;
          if (total >= limit) return total;
        }
      }
    }
    return total;
  }

  // 原始对齐（零偏移）必定精确计算
  const originalDiffs = scoreAt(0, 0, Number.POSITIVE_INFINITY);
  let best: AlignCandidate = { dr: 0, dc: 0, diffs: originalDiffs };

  if (best.diffs > 0 && maxShift > 0) {
    // 其余偏移按决胜顺序枚举；同分时先枚举者胜出，故仅在严格更小时替换
    const offsets: AlignOffset[] = [];
    for (let dr = -maxShift; dr <= maxShift; dr += 1) {
      for (let dc = -maxShift; dc <= maxShift; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        offsets.push({ dr, dc });
      }
    }
    offsets.sort(alignTieBreak);

    for (const off of offsets) {
      const diffs = scoreAt(off.dr, off.dc, best.diffs);
      if (diffs < best.diffs) best = { dr: off.dr, dc: off.dc, diffs };
    }
  }

  return { maxShift, comparableRows, originalDiffs, best };
}
