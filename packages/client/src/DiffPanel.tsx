import type {
  AlignSearchResult,
  CompareResult,
  DiffCell,
  DiffRowSummary,
} from '@jacquard/shared';
import { ALIGN_SHIFT_MAX, ALIGN_SHIFT_MIN } from '@jacquard/shared';

interface DiffPanelProps {
  /** 对版结果（随候选口令 / 当前网格实时重算；预览开启时为平移后结果） */
  result: CompareResult;
  /** 错位对齐搜索结果（原始/最佳差异数与最佳偏移） */
  align: AlignSearchResult;
  /** 用户限定的最大偏移（行、列方向相同） */
  maxShift: number;
  onMaxShiftChange: (maxShift: number) => void;
  /** 是否正在按最佳偏移预览对版 */
  alignPreview: boolean;
  /** 一键切换最佳对齐预览 */
  onToggleAlignPreview: () => void;
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

/** 带符号偏移展示：+2 / -1 / 0 */
function fmtOffset(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** 最大偏移输入收敛到允许范围 */
function clampShift(value: number): number {
  if (!Number.isFinite(value)) return ALIGN_SHIFT_MIN;
  return Math.max(ALIGN_SHIFT_MIN, Math.min(ALIGN_SHIFT_MAX, Math.trunc(value)));
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
  align,
  maxShift,
  onMaxShiftChange,
  alignPreview,
  onToggleAlignPreview,
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

  /** 最佳偏移非零且有可比较行时才值得开启预览；预览中始终允许退出 */
  const canPreview =
    align.comparableRows > 0 &&
    (align.best.dr !== 0 || align.best.dc !== 0);
  const previewDisabled = !alignPreview && !canPreview;
  const previewTitle = alignPreview
    ? '退出最佳对齐预览，恢复原始对齐比较'
    : canPreview
      ? '按最佳偏移循环平移候选图案后重新比较（只读，不回写网格）'
      : align.comparableRows === 0
        ? '没有可比较的候选行，无法预览'
        : '最佳对齐即原始对齐（零偏移），无需预览';

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
          {alignPreview && ' · 最佳对齐预览中'}
        </span>
      </div>

      <div className="align-box" aria-label="错位对齐搜索">
        <div className="align-head">
          <span className="align-title">错位对齐</span>
          <label className="align-max">
            最大偏移
            <input
              type="number"
              min={ALIGN_SHIFT_MIN}
              max={ALIGN_SHIFT_MAX}
              value={maxShift}
              onChange={(e) => onMaxShiftChange(clampShift(Number(e.target.value)))}
            />
          </label>
        </div>
        <div className="align-stats">
          <span>
            原始差异 <strong>{align.originalDiffs}</strong> 格
          </span>
          <span>
            最佳 <strong>{align.best.diffs}</strong> 格（行偏移{' '}
            {fmtOffset(align.best.dr)}，列偏移 {fmtOffset(align.best.dc)}）
          </span>
        </div>
        {align.best.diffs < align.originalDiffs && (
          <div className="align-gain">
            对齐后可减少 {align.originalDiffs - align.best.diffs} 格差异
          </div>
        )}
        {align.comparableRows === 0 && (
          <div className="align-note">没有可比较的候选行，未参与评分</div>
        )}
        <button
          type="button"
          className={`align-toggle${alignPreview ? ' active' : ''}`}
          disabled={previewDisabled}
          title={previewTitle}
          onClick={onToggleAlignPreview}
        >
          {alignPreview ? '退出最佳对齐预览' : '预览最佳对齐'}
        </button>
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
