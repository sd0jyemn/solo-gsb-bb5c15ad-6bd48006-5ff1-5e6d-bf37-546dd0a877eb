import type { CompareResult, DiffCell, DiffRowSummary } from '@jacquard/shared';

interface DiffPanelProps {
  /** 对版结果（随候选口令 / 当前网格实时重算） */
  result: CompareResult;
  /** 当前定位选中的差异格 */
  selected: DiffCell | null;
  /** 点击行条目：定位该行首个差异 */
  onSelect: (cell: DiffCell) => void;
  /** 一键清除对版状态 */
  onClear: () => void;
  /** 跳转到「游程口令」页编辑候选 */
  onEditCommand: () => void;
  /** 候选口令是否为空（空时给出引导） */
  hasCandidateText: boolean;
}

/** 单条行汇总 */
function RowEntry({
  summary,
  firstCell,
  selected,
  onSelect,
}: {
  summary: DiffRowSummary;
  firstCell: DiffCell | null;
  selected: DiffCell | null;
  onSelect: (cell: DiffCell) => void;
}) {
  const { row, status } = summary;

  if (status === 'diff' && firstCell) {
    const isSelected = selected !== null && selected.row === row;
    return (
      <button
        type="button"
        className={`diff-item diff-item-diff${isSelected ? ' selected' : ''}`}
        onClick={() => onSelect(firstCell)}
        title="点击定位该行首个差异"
      >
        <span className="diff-loc">第 {row} 行</span>
        <span className="diff-counts">
          {summary.added > 0 && (
            <em className="diff-count added">新增 {summary.added}</em>
          )}
          {summary.missing > 0 && (
            <em className="diff-count missing">缺失 {summary.missing}</em>
          )}
          {summary.replaced > 0 && (
            <em className="diff-count replaced">替换 {summary.replaced}</em>
          )}
          <span className="diff-first">首个差异第 {summary.firstDiffCol} 列</span>
        </span>
      </button>
    );
  }

  if (status === 'same') {
    return (
      <div className="diff-item diff-item-same">
        <span className="diff-loc">第 {row} 行</span>
        <span className="diff-counts">✓ 与候选一致</span>
      </div>
    );
  }

  return (
    <div
      className={`diff-item diff-item-${status}`}
      title={summary.reason ?? undefined}
    >
      <span className="diff-loc">第 {row} 行</span>
      <span className="diff-counts">
        不可比较：{status === 'missing' ? '无候选口令' : (summary.reason ?? '')}
      </span>
    </div>
  );
}

/**
 * 对版侧栏：按行汇总新增/缺失/替换数量，点击条目定位首个差异。
 * 差异列恒为视觉坐标，不随偶数行镜像；不可比较行（针数错误 /
 * 无法解析 / 无候选）不参与差异。
 */
export default function DiffPanel({
  result,
  selected,
  onSelect,
  onClear,
  onEditCommand,
  hasCandidateText,
}: DiffPanelProps) {
  const { totals, rows, comparableRows, issues } = result;
  const diffRows = rows.filter((r) => r.status === 'diff').length;
  // 行号冲突 / 越界等无法落到图案行的候选问题（行内校验问题已在行条目里体现）
  const mappingIssues = issues.filter(
    (i) => i.code === 'DUPLICATE_ROW' || i.code === 'ROW_OUT_OF_RANGE',
  );

  return (
    <aside className="diff-panel" aria-label="对版结果">
      <div className="diff-head">
        <span className="diff-title">对版结果</span>
        <button type="button" className="diff-clear" onClick={onClear}>
          清除对版
        </button>
      </div>

      <div className="diff-summary">
        <em className="diff-count added">新增 {totals.added}</em>
        <em className="diff-count missing">缺失 {totals.missing}</em>
        <em className="diff-count replaced">替换 {totals.replaced}</em>
        <span className="diff-meta">
          {comparableRows} 行可比较 · {diffRows} 行有差异
        </span>
      </div>

      {!hasCandidateText && (
        <div className="diff-empty">
          候选口令为空——请先在「游程口令」页输入或生成候选口令，
          对版只读比较、绝不回写当前网格。
          <button type="button" className="diff-goto" onClick={onEditCommand}>
            去编辑候选口令
          </button>
        </div>
      )}

      <ul className="diff-list">
        {rows.map((summary) => (
          <li key={summary.row}>
            <RowEntry
              summary={summary}
              firstCell={
                summary.status === 'diff'
                  ? (result.cells.find((c) => c.row === summary.row) ?? null)
                  : null
              }
              selected={selected}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>

      {mappingIssues.length > 0 && (
        <div className="diff-mapping-issues">
          候选口令另有 {mappingIssues.length} 处行号冲突/越界，未参与对版：
          {mappingIssues.map((i, idx) => (
            <span key={idx} className="diff-mapping-issue">
              口令第 {i.line} 行（
              {i.code === 'DUPLICATE_ROW' ? '行号冲突' : '行号越界'}）
            </span>
          ))}
        </div>
      )}
    </aside>
  );
}
