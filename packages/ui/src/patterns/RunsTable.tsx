import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
  type ColumnSizingState,
  type SortingState,
  type Updater,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { StatusBadge } from "../components/StatusBadge";
import { useI18n } from "../i18n/I18nProvider";
import {
  EMPTY,
  formatAbsoluteTime,
  formatDuration,
  formatRelativeTime,
  toTime,
} from "../format";
import { MetricCell } from "./MetricCell";
import { RunRibbon } from "./RunRibbon";
import type { ColumnSpec, MetricSpec, Run } from "../types";

const columnHelper = createColumnHelper<Run>();

export interface RowAction {
  id: string;
  label: string;
  danger?: boolean;
  onClick: (run: Run) => void;
}

export interface RunsTableProps {
  runs: Run[];
  baselineId?: string;
  /** The baseline when it is not on the loaded page: deltas must not silently disappear. */
  baselineRun?: Run;
  now: number;
  rowHeight: number;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
  onOpenRun: (run: Run) => void;
  /** Actions in a row - declared by the project, not by the library. */
  rowActions?: RowAction[];
  /** Column order and set: known ids or metric names. */
  columnIds?: string[];
  /** The project's metric metadata: labels, digits, direction. */
  metricSpecs?: MetricSpec[];
  /** Starting widths and per-column resize locks. */
  columnSpecs?: ColumnSpec[];
  /** Controlled sorting: when set, the table does not sort locally (the server does). */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /** Whether the user may resize columns at all. */
  resizable?: boolean;
  /** Widths picked by the user. Omit to keep them in the table's own state. */
  columnSizing?: ColumnSizingState;
  onColumnSizingChange?: (sizing: ColumnSizingState) => void;
  /** Compare mode: a click or Enter toggles the run instead of opening it. */
  comparing?: boolean;
  selectedIds?: string[];
  onToggleCompare?: (run: Run) => void;
  /** A bounded scroll area for a host that is not a flex column. */
  height?: number | string;
  /** A host-owned loading state, shown instead of the table. */
  loading?: ReactNode;
  /** A host-owned empty state, shown instead of the table. */
  empty?: ReactNode;
  /** Replace a cell's content; the column keeps its width, resize and sorting. */
  cellRenderers?: Record<string, (run: Run) => ReactNode>;
  /** Replace a header's content. */
  headerRenderers?: Record<string, () => ReactNode>;
}

const KNOWN_COLUMNS = [
  "name",
  "status",
  "ribbon",
  "dataset",
  "tags",
  "gitSha",
  "startedAt",
  "durationMs",
  "accuracy",
  "loss",
] as const;

/** Columns that hold text. Everything else is a number and aligns to the right, like its cells. */
const TEXT_COLUMNS = new Set([
  "name",
  "status",
  "ribbon",
  "dataset",
  "tags",
  "gitSha",
  "startedAt",
  "actions",
]);
const isNumericColumn = (id: string) => !TEXT_COLUMNS.has(id);

export function RunsTable({
  runs,
  baselineId,
  baselineRun,
  now,
  rowHeight,
  columnVisibility,
  onColumnVisibilityChange,
  onOpenRun,
  rowActions = [],
  columnIds,
  metricSpecs = [],
  columnSpecs = [],
  sorting: controlledSorting,
  onSortingChange,
  resizable = true,
  columnSizing,
  onColumnSizingChange,
  comparing = false,
  selectedIds = [],
  onToggleCompare,
  height,
  loading,
  empty,
  cellRenderers = {},
  headerRenderers = {},
}: RunsTableProps) {
  const { t, lang } = useI18n();
  const [ownSorting, setOwnSorting] = useState<SortingState>([
    { id: "startedAt", desc: true },
  ]);
  const sorting = controlledSorting ?? ownSorting;
  const updateSorting = (updater: Updater<SortingState>) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    if (onSortingChange) onSortingChange(next);
    else setOwnSorting(next);
  };
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [ownSizing, setOwnSizing] = useState<ColumnSizingState>({});
  const sizing = columnSizing ?? ownSizing;
  const scrollRef = useRef<HTMLDivElement>(null);

  const updateSizing = (updater: Updater<ColumnSizingState>) => {
    const next = typeof updater === "function" ? updater(sizing) : updater;
    if (onColumnSizingChange) onColumnSizingChange(next);
    else setOwnSizing(next);
  };

  const baseline = useMemo(
    () => runs.find((candidate) => candidate.id === baselineId) ?? baselineRun,
    [runs, baselineId, baselineRun],
  );

  const columns = useMemo(() => {
    const fixed: Record<string, ColumnDef<Run, unknown>> = {
      name: columnHelper.accessor("name", {
        id: "name",
        header: () => t("column.name"),
        size: 126,
        cell: (info) => (
          <span className="fe-run-name" title={info.getValue()}>
            {comparing ? (
              <>
                <span
                  className={clsx(
                    "fe-compare-check",
                    selectedIds.includes(info.row.original.id) && "fe-compare-check--on",
                  )}
                  aria-hidden
                >
                  {selectedIds.includes(info.row.original.id) ? (
                    <Check size={11} strokeWidth={3} />
                  ) : null}
                </span>
                {selectedIds.includes(info.row.original.id) ? (
                  <span className="sr-only">{t("compare.selected")}</span>
                ) : null}
              </>
            ) : null}
            <span className="fe-run-name__dot" aria-hidden />
            <span className="fe-mono fe-run-name__text">{info.getValue()}</span>
            {info.row.original.id === baselineId ? (
              <span className="sr-only">({t("tag.baseline")})</span>
            ) : null}
          </span>
        ),
      }) as ColumnDef<Run, unknown>,

      status: columnHelper.accessor("status", {
        id: "status",
        header: () => t("column.status"),
        size: 120,
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }) as ColumnDef<Run, unknown>,

      ribbon: columnHelper.display({
        id: "ribbon",
        header: () => t("column.stages"),
        size: 72,
        enableSorting: false,
        cell: (info) => (
          <RunRibbon stages={info.row.original.stages} events={info.row.original.events} height={6} />
        ),
      }) as ColumnDef<Run, unknown>,

      tags: columnHelper.accessor("tags", {
        id: "tags",
        header: () => t("column.tags"),
        size: 120,
        cell: (info) => {
          const tags = info.getValue() ?? [];
          if (tags.length === 0) return <span>{EMPTY}</span>;
          return (
            <span className="fe-tags">
              {tags.map((tag) => (
                <span key={tag} className="fe-tag">
                  {tag}
                </span>
              ))}
            </span>
          );
        },
      }) as ColumnDef<Run, unknown>,

      dataset: columnHelper.accessor("dataset", {
        id: "dataset",
        header: () => t("column.dataset"),
        size: 110,
        cell: (info) => {
          const value = info.getValue();
          return (
            <span className="fe-mono" title={value || undefined}>
              {value || EMPTY}
            </span>
          );
        },
      }) as ColumnDef<Run, unknown>,

      gitSha: columnHelper.accessor("gitSha", {
        id: "gitSha",
        header: () => t("column.git"),
        size: 70,
        cell: (info) => {
          const value = info.getValue();
          return (
            <span className="fe-mono fe-dim" title={value || undefined}>
              {value ? value.slice(0, 7) : EMPTY}
            </span>
          );
        },
      }) as ColumnDef<Run, unknown>,

      startedAt: columnHelper.accessor("startedAt", {
        id: "startedAt",
        header: () => t("column.started"),
        size: 98,
        cell: (info) => {
          const value = info.getValue();
          if (value == null) return <span>{EMPTY}</span>;
          return (
            <span title={formatAbsoluteTime(toTime(value), lang)}>
              {formatRelativeTime(toTime(value), now, lang)}
            </span>
          );
        },
      }) as ColumnDef<Run, unknown>,

      durationMs: columnHelper.accessor("durationMs", {
        id: "durationMs",
        header: () => t("column.duration"),
        size: 76,
        cell: (info) => {
          const value = info.getValue();
          return (
            <span className="fe-num">
              {value == null ? EMPTY : formatDuration(value, lang)}
            </span>
          );
        },
      }) as ColumnDef<Run, unknown>,
    };

    const specFor = (id: string) => metricSpecs.find((spec) => spec.id === id);

    const arrow = (direction: string) =>
      direction === "maximize" ? "↑" : direction === "minimize" ? "↓" : "·";

    const directionTitle = (direction: string) =>
      direction === "maximize"
        ? t("metric.higherBetter")
        : direction === "minimize"
          ? t("metric.lowerBetter")
          : t("column.directionOwned");

    // The built-in metrics: value, delta against the baseline, sparkline.
    const metric = (id: "accuracy" | "loss", color: string) =>
      columnHelper.accessor((row) => row.metrics[id] ?? -Infinity, {
        id,
        header: () => {
          const spec = specFor(id);
          const direction = spec?.direction ?? (id === "accuracy" ? "maximize" : "minimize");
          return (
            <span title={directionTitle(direction)}>
              {spec?.label ?? t(`metric.${id}`)}{" "}
              <span aria-hidden>{arrow(direction)}</span>
              <span className="sr-only">{directionTitle(direction)}</span>
            </span>
          );
        },
        size: 150,
        cell: (info) => {
          const run = info.row.original;
          const spec = specFor(id);
          return (
            <MetricCell
              value={run.metrics[id]}
              baseline={baseline?.metrics[id]}
              direction={run.metricDirection?.[id] ?? spec?.direction ?? "none"}
              series={run.series?.[id]?.map((point) => point.value)}
              digits={spec?.digits ?? undefined}
              color={color}
              label={spec?.label ?? id}
            />
          );
        },
      }) as ColumnDef<Run, unknown>;

    fixed.accuracy = metric("accuracy", "var(--fe-data-series-1)");
    fixed.loss = metric("loss", "var(--fe-data-series-2)");

    // Any other metric of the project: the column is built from the data and the spec.
    const custom = (id: string) =>
      columnHelper.accessor((row) => row.metrics[id] ?? -Infinity, {
        id,
        header: () => {
          const spec = specFor(id);
          return (
            <span title={directionTitle(spec?.direction ?? "none")}>
              {spec?.label ?? id} <span aria-hidden>{arrow(spec?.direction ?? "none")}</span>
              <span className="sr-only">{directionTitle(spec?.direction ?? "none")}</span>
            </span>
          );
        },
        size: 150,
        cell: (info) => {
          const run = info.row.original;
          const spec = specFor(id);
          return (
            <MetricCell
              value={run.metrics[id]}
              baseline={baseline?.metrics[id]}
              direction={run.metricDirection?.[id] ?? spec?.direction ?? "none"}
              series={run.series?.[id]?.map((point) => point.value)}
              digits={spec?.digits ?? undefined}
              color="var(--fe-data-series-3)"
              label={spec?.label ?? id}
            />
          );
        },
      }) as ColumnDef<Run, unknown>;

    const ids = columnIds && columnIds.length > 0 ? columnIds : [...KNOWN_COLUMNS];
    const canSort = (id: string) =>
      Boolean(fixed[id]) ||
      metricSpecs.some((spec) => spec.id === id) ||
      runs.some((run) => Object.prototype.hasOwnProperty.call(run.metrics, id));
    const built = ids.map((id) => {
      const def = fixed[id] ?? custom(id);
      const spec = columnSpecs.find((item) => item.id === id);
      const cell = cellRenderers[id];
      const header = headerRenderers[id];
      return {
        ...def,
        header: header ?? def.header,
        cell: cell
          ? (info: CellContext<Run, unknown>) => cell(info.row.original)
          : def.cell,
        enableSorting: cell && !canSort(id) ? false : def.enableSorting,
        size: spec?.width ?? def.size,
        enableResizing: resizable && spec?.resizable !== false,
      } as ColumnDef<Run, unknown>;
    });

    if (rowActions.length > 0) {
      built.push(
        columnHelper.display({
          id: "actions",
          header: () => t("column.actions"),
          size: 100,
          enableSorting: false,
          enableResizing: false,
          cell: (info) => (
            <span className="fe-table__actions">
              {rowActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={clsx("fe-table__action", action.danger && "fe-table__action--danger")}
                  aria-label={`${action.label}: ${info.row.original.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    action.onClick(info.row.original);
                  }}
                >
                  {action.label}
                </button>
              ))}
            </span>
          ),
        }) as ColumnDef<Run, unknown>,
      );
    }

    return built;
  }, [
    baseline,
    baselineId,
    cellRenderers,
    columnIds,
    columnSpecs,
    comparing,
    headerRenderers,
    lang,
    metricSpecs,
    now,
    resizable,
    rowActions,
    runs,
    selectedIds,
  ]);

  const table = useReactTable({
    data: runs,
    columns,
    state: { sorting, columnVisibility, columnSizing: sizing },
    columnResizeMode: "onChange",
    enableColumnResizing: resizable,
    manualSorting: Boolean(onSortingChange),
    onColumnSizingChange: updateSizing,
    onSortingChange: updateSorting,
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnVisibility) : updater;
      onColumnVisibilityChange(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  const onRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, index: number) => {
    const focusRow = (next: number) => {
      event.preventDefault();
      const clamped = Math.max(0, Math.min(rows.length - 1, next));
      setActiveRowIndex(clamped);
      virtualizer.scrollToIndex(clamped, { align: "auto" });
      window.setTimeout(() => {
        const node = scrollRef.current?.querySelector<HTMLTableRowElement>(
          `[data-row-index="${clamped}"]`,
        );
        node?.focus();
      }, 30);
    };

    switch (event.key) {
      case "ArrowDown":
        focusRow(index + 1);
        break;
      case "ArrowUp":
        focusRow(index - 1);
        break;
      case "Home":
        focusRow(0);
        break;
      case "End":
        focusRow(rows.length - 1);
        break;
      case "PageDown":
        focusRow(index + 10);
        break;
      case "PageUp":
        focusRow(index - 10);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const run = rows[index]?.original;
        if (!run) break;
        if (comparing && onToggleCompare) onToggleCompare(run);
        else onOpenRun(run);
        break;
      }
      default:
        break;
    }
  };

  if (loading !== undefined) {
    return <div className="fe-table">{loading}</div>;
  }
  if (runs.length === 0 && empty !== undefined) {
    return <div className="fe-table">{empty}</div>;
  }

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0]?.start ?? 0 : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;

  return (
    <div className={clsx("fe-table", height !== undefined && "fe-table--bounded")}>
      <div
        className="fe-table__scroll"
        ref={scrollRef}
        style={height === undefined ? undefined : { height }}
      >
        <table className="fe-table__table" style={{ minWidth: table.getTotalSize() }}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  const isNumeric = isNumericColumn(header.column.id);
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      style={{ width: header.getSize() }}
                      className={clsx(
                        "fe-table__th",
                        header.column.id === "name" && "fe-table__th--sticky",
                        isNumeric && "fe-table__th--num",
                      )}
                      aria-sort={
                        sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"
                      }
                    >
                      {canSort ? (
                        <button
                          type="button"
                          className="fe-table__sort"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp size={12} aria-hidden />
                          ) : sorted === "desc" ? (
                            <ArrowDown size={12} aria-hidden />
                          ) : (
                            <ChevronsUpDown size={12} className="fe-table__sort-idle" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                      {header.column.getCanResize() ? (
                        <span
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={t("table.resizeColumn", { column: header.column.id })}
                          aria-valuenow={Math.round(header.getSize())}
                          aria-valuemin={40}
                          aria-valuemax={800}
                          tabIndex={0}
                          className={clsx(
                            "fe-table__resizer",
                            header.column.getIsResizing() && "fe-table__resizer--active",
                          )}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onDoubleClick={() =>
                            updateSizing((previous) => {
                              const next = { ...previous };
                              delete next[header.column.id];
                              return next;
                            })
                          }
                          onKeyDown={(event) => {
                            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                            event.preventDefault();
                            const step = event.shiftKey ? 24 : 8;
                            const delta = event.key === "ArrowRight" ? step : -step;
                            const width = Math.min(800, Math.max(40, header.getSize() + delta));
                            updateSizing((previous) => ({ ...previous, [header.column.id]: width }));
                          }}
                        />
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 ? (
              <tr className="fe-table__spacer" aria-hidden style={{ height: paddingTop }}>
                <td colSpan={table.getVisibleLeafColumns().length} />
              </tr>
            ) : null}
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              const run = row.original;
              return (
                <tr
                  key={row.id}
                  data-row-index={virtualRow.index}
                  className={clsx(
                    "fe-table__row",
                    run.id === baselineId && "fe-table__row--baseline",
                  )}
                  tabIndex={virtualRow.index === activeRowIndex ? 0 : -1}
                  aria-selected={
                    comparing ? selectedIds.includes(run.id) : undefined
                  }
                  title={run.error ?? undefined}
                  onFocus={() => setActiveRowIndex(virtualRow.index)}
                  onClick={() => {
                    if (comparing && onToggleCompare) onToggleCompare(run);
                    else onOpenRun(run);
                  }}
                  onKeyDown={(event) => onRowKeyDown(event, virtualRow.index)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className={clsx(
                        "fe-table__td",
                        cell.column.id === "name" && "fe-table__td--sticky",
                        isNumericColumn(cell.column.id) && "fe-table__td--num",
                        cell.column.id === "ribbon" && "fe-table__td--ribbon",
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 ? (
              <tr className="fe-table__spacer" aria-hidden style={{ height: paddingBottom }}>
                <td colSpan={table.getVisibleLeafColumns().length} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="fe-table__footer">
        <span className="fe-num">{runs.length}</span> {t("footer.runs")}
        {baseline?.name ? (
          <span className="fe-table__footer-note">
            {t("footer.deltasToBaseline", { run: baseline.name })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
