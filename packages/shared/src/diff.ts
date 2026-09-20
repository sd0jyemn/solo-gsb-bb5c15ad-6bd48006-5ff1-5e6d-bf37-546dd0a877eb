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

/**
 * 对版：把候选口令解析为临时图案，与当前网格逐格比较（不回写网格）。
 *
 * - 候选行仍按实际编织方向落针：偶数行自右向左（←）铺回视觉坐标；
 * - 比较完全在视觉坐标上逐格进行，差异列号绝不随偶数行镜像；
 * - 以底色（默认 A）为基准分类：新增纹样 / 缺失纹样 / 颜色替换；
 * - 针数错误或无法解析的候选行整行不可比较——绝不用部分落针结果
 *   参与该行差异；没有候选口令的行同样不可比较。
 */
export function compareCandidate(req: CompareRequest): CompareResult {
  const { text, width, height, grid, symbols } = req;
  const base = (req.baseSymbol ?? DIFF_BASE_SYMBOL).toUpperCase();

  const analysis = analyzeText({ text, width, height, symbols });
  const byRow = new Map(analysis.rows.map((r) => [r.row, r]));

  const rows: DiffRowSummary[] = [];
  const cells: DiffCell[] = [];
  const totals = { added: 0, missing: 0, replaced: 0 };

  for (let row = 1; row <= height; row += 1) {
    const analyzed = byRow.get(row);

    if (!analyzed) {
      rows.push({
        row,
        status: 'missing',
        added: 0,
        missing: 0,
        replaced: 0,
        firstDiffCol: null,
        reason: '该行没有对应的候选口令，无可比较',
        line: null,
      });
      continue;
    }

    if (analyzed.runs === null) {
      rows.push({
        row,
        status: 'invalid',
        added: 0,
        missing: 0,
        replaced: 0,
        firstDiffCol: null,
        reason: analyzed.issue?.message ?? '候选口令无法解析',
        line: analyzed.line,
      });
      continue;
    }

    // 合法候选：按编织方向铺到视觉坐标（偶数行 ←），再逐格按视觉列比较
    const candidate = placeRuns(analyzed.runs, row, width);
    const current = grid[row - 1] ?? [];
    let added = 0;
    let missing = 0;
    let replaced = 0;
    let firstDiffCol: number | null = null;

    for (let c = 0; c < width; c += 1) {
      const g = (current[c] ?? base).toUpperCase();
      const cand = candidate[c];
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
      line: analyzed.line,
    });
  }

  const comparableRows = rows.filter(
    (r) => r.status === 'same' || r.status === 'diff',
  ).length;

  return { rows, cells, totals, comparableRows, issues: analysis.issues };
}
