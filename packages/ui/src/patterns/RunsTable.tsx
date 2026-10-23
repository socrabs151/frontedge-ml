import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { StatusBadge } from "../components/StatusBadge";
import { useI18n } from "../i18n/I18nProvider";
import { formatAbsoluteTime, formatDuration, formatMetric, formatRelativeTime, toTime } from "../format";
import { MetricCell } from "./MetricCell";
import { RunRibbon } from "./RunRibbon";
import type { Run } from "../types";

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
  now: number;
  rowHeight: number;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
  onOpenRun: (run: Run) => void;
  /** Actions in a row - declared by the project, not by the library. */
  rowActions?: RowAction[];
  /** Column order and set: known ids or metric names. */
  columnIds?: string[];
}

const KNOWN_COLUMNS = [
  "name",
  "status",
  "ribbon",
  "dataset",
  "gitSha",
  "startedAt",
  "durationMs",
  "accuracy",
  "loss",
] as const;

export function RunsTable({
  runs,
  baselineId,
  now,
  rowHeight,
  columnVisibility,
  onColumnVisibilityChange,
  onOpenRun,
  rowActions = [],
  columnIds,
}: RunsTableProps) {
  const { t, lang } = useI18n();
  const [sorting, setSorting] = useState<SortingState>([{ id: "startedAt", desc: true }]);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const baseline = useMemo(
    () => runs.find((candidate) => candidate.id === baselineId),
    [runs, baselineId],
  );

  const columns = useMemo(() => {
    const fixed: Record<string, ColumnDef<Run, unknown>> = {
      name: columnHelper.accessor("name", {
        id: "name",
        header: "Run",
        size: 140,
        cell: (info) => (
          <span className="fe-run-name">
            <span className="fe-run-name__dot" aria-hidden />
            <span className="fe-mono">{info.getValue()}</span>
            {info.row.original.id === baselineId ? (
              <span className="fe-run-name__tag">{t("tag.baseline")}</span>
            ) : null}
          </span>
        ),
      }) as ColumnDef<Run, unknown>,

      status: columnHelper.accessor("status", {
        id: "status",
        header: () => t("column.status"),
        size: 110,
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }) as ColumnDef<Run, unknown>,

      ribbon: columnHelper.display({
        id: "ribbon",
        header: () => t("column.stages"),
        size: 85,
        enableSorting: false,
        cell: (info) => (
          <RunRibbon stages={info.row.original.stages} events={info.row.original.events} height={6} />
        ),
      }) as ColumnDef<Run, unknown>,

      dataset: columnHelper.accessor("dataset", {
        id: "dataset",
        header: "Dataset",
        size: 120,
        cell: (info) => <span className="fe-mono">{info.getValue()}</span>,
      }) as ColumnDef<Run, unknown>,

      gitSha: columnHelper.accessor("gitSha", {
        id: "gitSha",
        header: "Git",
        size: 70,
        cell: (info) => <span className="fe-mono fe-dim">{info.getValue().slice(0, 7)}</span>,
      }) as ColumnDef<Run, unknown>,

      startedAt: columnHelper.accessor("startedAt", {
        id: "startedAt",
        header: () => t("column.started"),
        size: 110,
        cell: (info) => (
          <span title={formatAbsoluteTime(toTime(info.getValue()), lang)}>
            {formatRelativeTime(toTime(info.getValue()), now, lang)}
          </span>
        ),
      }) as ColumnDef<Run, unknown>,

      durationMs: columnHelper.accessor("durationMs", {
        id: "durationMs",
        header: () => t("column.duration"),
        size: 85,
        cell: (info) => <span className="fe-num">{formatDuration(info.getValue(), lang)}</span>,
      }) as ColumnDef<Run, unknown>,
    };

    // The accuracy and loss metrics: value, delta against the baseline, sparkline.
    const metric = (id: "accuracy" | "loss", label: string, color: string) =>
      columnHelper.accessor((row) => row.metrics[id] ?? -Infinity, {
        id,
        header: () => (
          <span title={t(id === "accuracy" ? "metric.higherBetter" : "metric.lowerBetter")}>
            {label} <span aria-hidden>{id === "accuracy" ? "↑" : "↓"}</span>
          </span>
        ),
        size: 150,
        cell: (info) => {
          const run = info.row.original;
          return (
            <MetricCell
              value={run.metrics[id]}
              baseline={baseline?.metrics[id]}
              direction={run.metricDirection?.[id] ?? "none"}
              series={run.series?.[id]?.map((point) => point.value)}
              color={color}
              label={id}
            />
          );
        },
      }) as ColumnDef<Run, unknown>;

    fixed.accuracy = metric("accuracy", t("metric.accuracy"), "var(--fe-data-series-1)");
    fixed.loss = metric("loss", t("metric.loss"), "var(--fe-data-series-2)");

    // Any other metric of the project: the column is built from the data.
    const custom = (id: string) =>
      columnHelper.accessor((row) => row.metrics[id] ?? -Infinity, {
        id,
        header: () => (
          <span title={t("column.directionOwned")}>
            {id} <span aria-hidden>·</span>
          </span>
        ),
        size: 140,
        cell: (info) => {
          const run = info.row.original;
          return (
            <MetricCell
              value={run.metrics[id]}
              baseline={baseline?.metrics[id]}
              direction={run.metricDirection?.[id] ?? "none"}
              series={run.series?.[id]?.map((point) => point.value)}
              color="var(--fe-data-series-3)"
              label={id}
            />
          );
        },
      }) as ColumnDef<Run, unknown>;

    const ids = columnIds && columnIds.length > 0 ? columnIds : [...KNOWN_COLUMNS];
    const built = ids.map((id) => fixed[id] ?? custom(id));

    if (rowActions.length > 0) {
      built.push(
        columnHelper.display({
          id: "actions",
          header: () => t("column.actions"),
          size: 100,
          enableSorting: false,
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
  }, [baseline, baselineId, columnIds, lang, now, rowActions]);

  const table = useReactTable({
    data: runs,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
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
      case " ":
        event.preventDefault();
        onOpenRun(rows[index]?.original as Run);
        break;
      default:
        break;
    }
  };

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0]?.start ?? 0 : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;

  return (
    <div className="fe-table">
      <div className="fe-table__scroll" ref={scrollRef}>
        <table className="fe-table__table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  const isNumeric = ["accuracy", "loss", "durationMs"].includes(header.column.id);
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
                  className="fe-table__row"
                  tabIndex={virtualRow.index === activeRowIndex ? 0 : -1}
                  aria-selected={run.id === baselineId}
                  title={run.error ?? undefined}
                  onFocus={() => setActiveRowIndex(virtualRow.index)}
                  onClick={() => onOpenRun(run)}
                  onKeyDown={(event) => onRowKeyDown(event, virtualRow.index)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className={clsx(
                        "fe-table__td",
                        cell.column.id === "name" && "fe-table__td--sticky",
                        ["accuracy", "loss", "durationMs"].includes(cell.column.id) &&
                          "fe-table__td--num",
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
        {baselineId ? (
          <span className="fe-table__footer-note">
            {t("footer.deltasToBaseline")}
            {baseline ? ` · ${formatMetric(baseline.metrics.accuracy, 3, lang)}` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}
