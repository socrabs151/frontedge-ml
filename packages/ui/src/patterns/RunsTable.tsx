import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { StatusBadge } from "../components/StatusBadge";
import { formatAbsoluteTime, formatDuration, formatMetric, formatRelativeTime, toTime } from "../format";
import { MetricCell } from "./MetricCell";
import { RunRibbon } from "./RunRibbon";
import type { Run } from "../types";

const columnHelper = createColumnHelper<Run>();

export interface RunsTableProps {
  runs: Run[];
  baselineId?: string;
  now: number;
  rowHeight: number;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
  onOpenRun: (run: Run) => void;
}

export function RunsTable({
  runs,
  baselineId,
  now,
  rowHeight,
  columnVisibility,
  onColumnVisibilityChange,
  onOpenRun,
}: RunsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "startedAt", desc: true }]);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        id: "name",
        header: "Run",
        size: 165,
        cell: (info) => (
          <span className="fe-run-name">
            <span className="fe-run-name__dot" aria-hidden />
            <span className="mono">{info.getValue()}</span>
            {info.row.original.id === baselineId ? (
              <span className="fe-run-name__tag">baseline</span>
            ) : null}
          </span>
        ),
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: "Статус",
        size: 112,
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.display({
        id: "ribbon",
        header: "Ход",
        size: 100,
        enableSorting: false,
        cell: (info) => (
          <RunRibbon
            stages={info.row.original.stages}
            events={info.row.original.events}
            height={6}
          />
        ),
      }),
      columnHelper.accessor("dataset", {
        id: "dataset",
        header: "Dataset",
        size: 115,
        cell: (info) => <span className="mono">{info.getValue()}</span>,
      }),
      columnHelper.accessor("gitSha", {
        id: "gitSha",
        header: "Git",
        size: 76,
        cell: (info) => <span className="mono dim">{info.getValue().slice(0, 7)}</span>,
      }),
      columnHelper.accessor("startedAt", {
        id: "startedAt",
        header: "Начат",
        size: 95,
        cell: (info) => (
          <span title={formatAbsoluteTime(toTime(info.getValue()))}>
            {formatRelativeTime(toTime(info.getValue()), now)}
          </span>
        ),
      }),
      columnHelper.accessor("durationMs", {
        id: "durationMs",
        header: "Длительность",
        size: 85,
        cell: (info) => <span className="num">{formatDuration(info.getValue())}</span>,
      }),
      columnHelper.accessor((row) => row.metrics.accuracy ?? -Infinity, {
        id: "accuracy",
        header: () => (
          <span title="Больше — лучше">
            Accuracy <span aria-hidden>↑</span>
          </span>
        ),
        size: 165,
        cell: (info) => {
          const run = info.row.original;
          const baseline = runs.find((candidate) => candidate.id === baselineId);
          return (
            <MetricCell
              value={run.metrics.accuracy}
              baseline={baseline?.metrics.accuracy}
              direction={run.metricDirection?.accuracy ?? "none"}
              series={run.series.accuracy?.map((point) => point.value)}
              color="var(--data-series-1)"
              label="accuracy"
            />
          );
        },
      }),
      columnHelper.accessor((row) => row.metrics.loss ?? -Infinity, {
        id: "loss",
        header: () => (
          <span title="Меньше — лучше">
            Loss <span aria-hidden>↓</span>
          </span>
        ),
        size: 165,
        cell: (info) => {
          const run = info.row.original;
          const baseline = runs.find((candidate) => candidate.id === baselineId);
          return (
            <MetricCell
              value={run.metrics.loss}
              baseline={baseline?.metrics.loss}
              direction={run.metricDirection?.loss ?? "none"}
              series={run.series.loss?.map((point) => point.value)}
              color="var(--data-series-2)"
              label="loss"
            />
          );
        },
      }),
    ],
    [baselineId, runs],
  );

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
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      style={{ width: header.getSize() }}
                      className={clsx(
                        "fe-table__th",
                        header.column.id === "name" && "fe-table__th--sticky",
                        header.column.id === "accuracy" && "fe-table__th--num",
                        header.column.id === "loss" && "fe-table__th--num",
                        header.column.id === "durationMs" && "fe-table__th--num",
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
                        (cell.column.id === "accuracy" ||
                          cell.column.id === "loss" ||
                          cell.column.id === "durationMs") &&
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
        <span className="num">{runs.length}</span> прогонов
        {baselineId ? (
          <span className="fe-table__footer-note">
            дельты считаются к baseline · {formatMetric(runs.find((r) => r.id === baselineId)?.metrics.accuracy)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
