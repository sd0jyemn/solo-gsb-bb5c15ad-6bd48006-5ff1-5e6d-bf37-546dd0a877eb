import type {
  CompareRequest,
  CompareResult,
  DiffCell,
  DiffKind,
  DiffRowSummary,
} from './types.js';
import { analyzeText, placeRuns } from './rle.js';

/** 对版底色符号（新增/缺失的判定基准） */
export const DIFF_BASE_SYMBOL = 'A';

/** 正取模（防御负偏移） */
function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/**
 * 对版：把候选口令解析为临时图案，与当前网格逐格比较（不回写网格）。
 *
 * - 候选行仍按实际编织方向落针：偶数行自右向左（←）铺回视觉坐标；
 * - 比较完全在视觉坐标上逐格进行，差异列号绝不随偶数行镜像；
 * - 以底色（默认 A）为基准分类：新增纹样 / 缺失纹样 / 颜色替换；
 * - 针数错误或无法解析的候选行整行不可比较——绝不用部分落针结果
 *   参与该行差异；没有候选口令的行同样不可比较；
 * - 可选 offset（错位对齐预览）：先把候选图案整体按视觉坐标循环平移
 *   （dr 向下、dc 向右），再逐格比较；平移只作用于候选图案，
 *   网格不动、不镜像。不可比较的候选行随平移一起循环换位，
 *   落到哪一行，哪一行就不可比较。
 */
export function compareCandidate(req: CompareRequest): CompareResult {
  const { text, width, height, grid, symbols } = req;
  const base = (req.baseSymbol ?? DIFF_BASE_SYMBOL).toUpperCase();
  const dr = req.offset?.dr ?? 0;
  const dc = req.offset?.dc ?? 0;
  const shifted = dr !== 0 || dc !== 0;

  const analysis = analyzeText({ text, width, height, symbols });
  const byRow = new Map(analysis.rows.map((r) => [r.row, r]));

  // 先把每个图案行的候选口令落针为视觉坐标行（合法行）；
  // 错位对齐时再按循环平移取相位——平移只作用于候选图案，网格不动。
  interface SourceRow {
    status: 'ok' | 'invalid' | 'missing';
    visual: string[] | null;
    reason: string | null;
    line: number | null;
    /** 候选来源的图案行（1 基），错位对齐时用于说明 */
    srcRow: number;
  }
  const sources: SourceRow[] = [];
  for (let row = 1; row <= height; row += 1) {
    const analyzed = byRow.get(row);
    if (!analyzed) {
      sources.push({
        status: 'missing',
        visual: null,
        reason: '该行没有对应的候选口令，无可比较',
        line: null,
        srcRow: row,
      });
    } else if (analyzed.runs === null) {
      sources.push({
        status: 'invalid',
        visual: null,
        reason: analyzed.issue?.message ?? '候选口令无法解析',
        line: analyzed.line,
        srcRow: row,
      });
    } else {
      sources.push({
        status: 'ok',
        visual: placeRuns(analyzed.runs, row, width),
        reason: null,
        line: analyzed.line,
        srcRow: row,
      });
    }
  }

  const rows: DiffRowSummary[] = [];
  const cells: DiffCell[] = [];
  const totals = { added: 0, missing: 0, replaced: 0 };

  for (let row = 1; row <= height; row += 1) {
    // 错位对齐：本行比较的是循环平移后落到本行的候选行（视觉坐标取相位）
    const src = sources[mod(row - 1 - dr, height)];

    if (src.status !== 'ok' || src.visual === null) {
      rows.push({
        row,
        status: src.status === 'missing' ? 'missing' : 'invalid',
        added: 0,
        missing: 0,
        replaced: 0,
        firstDiffCol: null,
        reason:
          shifted && src.reason !== null
            ? `${src.reason}（错位对齐：本行对应候选第 ${src.srcRow} 行）`
            : src.reason,
        line: src.line,
      });
      continue;
    }

    // 合法候选：按编织方向铺到视觉坐标（偶数行 ←），再逐格按视觉列比较
    const visual = src.visual;
    const current = grid[row - 1] ?? [];
    let added = 0;
    let missing = 0;
    let replaced = 0;
    let firstDiffCol: number | null = null;

    for (let c = 0; c < width; c += 1) {
      const g = (current[c] ?? base).toUpperCase();
      const cand = visual[mod(c - dc, width)];
      if (g === cand) continue;
      let kind: DiffKind;
      if (g === base) {
        kind = 'added';
        added += 1;
      } else if (cand === base) {
        kind = 'missing';
        missing += 1;
      } else {
        kind = 'replaced';
        replaced += 1;
      }
      if (firstDiffCol === null) firstDiffCol = c + 1;
      cells.push({
        row,
        col: c + 1,
        kind,
        gridSymbol: g,
        candidateSymbol: cand,
      });
    }

    totals.added += added;
    totals.missing += missing;
    totals.replaced += replaced;
    rows.push({
      row,
      status: added + missing + replaced === 0 ? 'same' : 'diff',
      added,
      missing,
      replaced,
      firstDiffCol,
      reason: null,
      line: src.line,
    });
  }

  const comparableRows = rows.filter(
    (r) => r.status === 'same' || r.status === 'diff',
  ).length;

  return { rows, cells, totals, comparableRows, issues: analysis.issues };
}
