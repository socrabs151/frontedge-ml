import {
  Button,
  ColumnsMenu,
  EmptyState,
  LoadingRows,
  RunsTable,
  Search,
  type ColumnOption,
  type VisibilityState,
} from "@frontedge-ml/ui";
import { GitCompare, Inbox, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Run, RunOption, RunStatus, SortingState, UiConfig } from "@frontedge-ml/ui";
import { useAppT } from "../i18n";
import { RunPicker } from "../components/RunPicker";
import { errorMessage, source, type RunsQuery } from "../data/source";

const STATUS_FILTERS: Array<{
  value: RunStatus | "all";
  label: "status.queued" | "status.succeeded" | "status.failed" | "status.running" | "status.lost" | "all";
}> = [
  { value: "all", label: "all" },
  { value: "succeeded", label: "status.succeeded" },
  { value: "failed", label: "status.failed" },
  { value: "running", label: "status.running" },
  { value: "queued", label: "status.queued" },
  { value: "lost", label: "status.lost" },
];

const COLUMN_OPTIONS: ColumnOption[] = [
  { id: "name", label: "Run" },
  { id: "status", label: "Status" },
  { id: "freshness", label: "Freshness" },
  { id: "ribbon", label: "Stages" },
  { id: "dataset", label: "Dataset" },
  { id: "gitSha", label: "Git" },
  { id: "startedAt", label: "Started" },
  { id: "durationMs", label: "Duration" },
  { id: "accuracy", label: "Accuracy" },
  { id: "loss", label: "Loss" },
];

export interface RunsScreenProps {
  runs: Run[] | null;
  total: number;
  error: string | null;
  onRetry: () => void;
  onRefresh: () => void;
  updatedAt: number | null;
  query: RunsQuery;
  onQueryChange: (query: RunsQuery) => void;
  baselineId?: string;
  /** The baseline run when it is not on the current page. */
  baselineRun?: Run;
  onBaselineChange: (runId: string | undefined) => void;
  config: UiConfig | null;
  datasets: string[];
  now: number;
  rowHeight: number;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
  columnSizing: Record<string, number>;
  onColumnSizingChange: (sizing: Record<string, number>) => void;
  /** The runs the baseline picker offers: the whole project, not just the page. */
  runChoices: RunOption[];
  onOpenRun: (run: Run) => void;
  onCompare: (ids: string[]) => void;
}

export function RunsScreen({
  runs,
  total,
  error,
  onRetry,
  onRefresh,
  updatedAt,
  query,
  onQueryChange,
  baselineId,
  baselineRun,
  onBaselineChange,
  config,
  datasets,
  now,
  rowHeight,
  columnVisibility,
  onColumnVisibilityChange,
  columnSizing,
  onColumnSizingChange,
  runChoices,
  onOpenRun,
  onCompare,
}: RunsScreenProps) {
  const [comparing, setComparing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const toggleCompare = (run: Run) => {
    setSelected((previous) => {
      if (previous.includes(run.id)) return previous.filter((id) => id !== run.id);
      return previous.length >= 4 ? previous : [...previous, run.id];
    });
  };
  const t = useAppT();
  const [search, setSearch] = useState(query.search ?? "");
  const pageSize = config?.pageSize ?? 50;
  const offset = query.offset ?? 0;

  // Search must not hit the server on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = search.trim();
      if ((query.search ?? "") !== next) {
        onQueryChange({ ...query, search: next || undefined, offset: 0 });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, query, onQueryChange]);

  const activeFilters =
    (query.status ? 1 : 0) +
    (query.dataset ? 1 : 0) +
    (query.search ? 1 : 0) +
    (query.tag ? 1 : 0);

  // Sorting is the server's: the table only reports which header was clicked.
  const sorting: SortingState = useMemo(
    () => [{ id: query.sort ?? "startedAt", desc: query.order !== "asc" }],
    [query.sort, query.order],
  );
  const onSortingChange = (next: SortingState) => {
    const first = next[0];
    onQueryChange({
      ...query,
      sort: first?.id ?? "startedAt",
      order: first && first.desc === false ? "asc" : "desc",
      offset: 0,
    });
  };

  const tagOptions = useMemo(() => {
    const found = new Set<string>();
    for (const run of runChoices) {
      for (const tag of run.tags ?? []) found.add(tag);
    }
    return [...found].sort();
  }, [runChoices]);

  const rowActions = useMemo(
    () =>
      (config?.actions ?? [])
        .filter((action) => action.placement === "runs")
        .map((action) => ({
          id: action.id,
          label: action.label,
          danger: action.danger,
          onClick: (run: Run) => {
            void source
              .runAction(action.id, { runId: run.id })
              .catch((cause) => console.error(errorMessage(cause)));
          },
        })),
    [config],
  );

  return (
    <div className="fe-runs">
      <header className="fe-runs__head">
        <div>
          <h1 className="fe-runs__title">{t("runs.title")}</h1>
          <p className="fe-runs__subtitle">
            {config?.project
              ? t("runs.subtitle", { project: config.project })
              : t("runs.subtitleNoProject")}
          </p>
        </div>
        <div className="fe-runs__actions">
          <label className="fe-field">
            <span className="fe-field__label">{t("runs.baseline")}</span>
            <RunPicker
              value={baselineId}
              options={runChoices}
              onSearch={(search) => source.runOptions({ search })}
              onChange={(id) => onBaselineChange(id || undefined)}
              label={t("runs.baseline")}
              placeholder={t("runs.searchPlaceholder")}
            />
          </label>
          <Button
            variant={comparing ? "secondary" : "ghost"}
            size="sm"
            icon={<GitCompare size={13} aria-hidden />}
            onClick={() => {
              setComparing((value) => !value);
              setSelected([]);
            }}
          >
            {t("compare.action")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={13} aria-hidden />}
            onClick={onRefresh}
            title={t("runs.refresh")}
          >
            {updatedAt
              ? t("runs.updatedAt", {
                  time: new Date(updatedAt).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  }),
                })
              : t("runs.refresh")}
          </Button>
        </div>
      </header>

      {comparing ? (
        <div className="fe-comparebar">
          <span className="fe-note fe-note--inline">{t("compare.select")}</span>
          <span className="fe-note fe-note--inline">{t("compare.limit")}</span>
          <div className="fe-toolbar__spacer" />
          <span className="fe-num">{t("compare.selectedCount", { count: selected.length })}</span>
          <Button
            size="sm"
            variant="primary"
            disabled={selected.length < 2}
            onClick={() => onCompare(selected)}
          >
            {t("compare.action")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setComparing(false);
              setSelected([]);
            }}
          >
            {t("compare.cancel")}
          </Button>
        </div>
      ) : null}

      <div className="fe-toolbar">
        <Search
          value={search}
          onValueChange={setSearch}
          placeholder={t("runs.searchPlaceholder")}
          ariaLabel={t("runs.searchPlaceholder")}
        />
        <div className="fe-toolbar__group" role="group" aria-label={t("runs.title")}>
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="fe-chip"
              aria-pressed={(query.status ?? "all") === option.value}
              onClick={() =>
                onQueryChange({
                  ...query,
                  status: option.value === "all" ? undefined : option.value,
                  offset: 0,
                })
              }
            >
              {option.label === "all" ? t("runs.all") : t(option.label)}
            </button>
          ))}
        </div>
        <select
          className="fe-select"
          value={query.dataset ?? "all"}
          onChange={(event) =>
            onQueryChange({
              ...query,
              dataset: event.target.value === "all" ? undefined : event.target.value,
              offset: 0,
            })
          }
          aria-label={t("runs.allDatasets")}
        >
          <option value="all">{t("runs.allDatasets")}</option>
          {datasets.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {tagOptions.length > 0 ? (
          <select
            className="fe-select"
            value={query.tag ?? "all"}
            onChange={(event) =>
              onQueryChange({
                ...query,
                tag: event.target.value === "all" ? undefined : event.target.value,
                offset: 0,
              })
            }
            aria-label={t("runs.allTags")}
          >
            <option value="all">{t("runs.allTags")}</option>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        ) : null}
        {activeFilters > 0 ? (
          <button
            type="button"
            className="fe-filterchip"
            onClick={() => {
              setSearch("");
              onQueryChange({ offset: 0 });
            }}
          >
            <SlidersHorizontal size={12} aria-hidden />
            {t("runs.filterCount", { count: activeFilters })}
            <X size={12} aria-hidden />
          </button>
        ) : null}
        <div className="fe-toolbar__spacer" />
        <ColumnsMenu
          columns={COLUMN_OPTIONS}
          visibility={columnVisibility}
          onVisibilityChange={onColumnVisibilityChange}
          onResetWidths={
            Object.keys(columnSizing).length > 0 ? () => onColumnSizingChange({}) : undefined
          }
        />
      </div>

      {error ? (
        <div className="fe-panel">
          <EmptyState
            icon={<RefreshCw size={20} aria-hidden />}
            title={t("runs.loadError")}
            text={t("runs.loadErrorHint", { error })}
            action={
              <Button variant="secondary" size="sm" onClick={onRetry}>
                {t("runs.retry")}
              </Button>
            }
          />
        </div>
      ) : !runs ? (
        <LoadingRows rows={12} height={rowHeight} label={t("loading.default")} />
      ) : runs.length === 0 ? (
        <div className="fe-panel">
          <EmptyState
            icon={<Inbox size={20} aria-hidden />}
            title={t("runs.emptyTitle")}
            text={t("runs.emptyText")}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  onQueryChange({ offset: 0 });
                }}
              >
                {t("runs.resetFilters")}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <RunsTable
            runs={runs}
            baselineId={baselineId}
            baselineRun={baselineRun}
            now={now}
            rowHeight={rowHeight}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={onColumnVisibilityChange}
            onOpenRun={onOpenRun}
            rowActions={rowActions}
            columnIds={config?.runColumns}
            metricSpecs={config?.metrics}
            columnSpecs={config?.columns}
            resizable={config?.columnResize !== false}
            columnSizing={columnSizing}
            onColumnSizingChange={onColumnSizingChange}
            sorting={sorting}
            onSortingChange={onSortingChange}
            comparing={comparing}
            selectedIds={selected}
            onToggleCompare={toggleCompare}
          />
          {total > runs.length || offset > 0 ? (
            <div className="fe-toolbar fe-toolbar--pagination">
              <span className="fe-note fe-note--inline">
                {t("runs.showing", {
                  from: offset + 1,
                  to: offset + runs.length,
                  total,
                })}
              </span>
              <div className="fe-toolbar__spacer" />
              <Button
                variant="ghost"
                size="sm"
                disabled={offset === 0}
                onClick={() => onQueryChange({ ...query, offset: Math.max(0, offset - pageSize) })}
              >
                {t("runs.prev")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={offset + runs.length >= total}
                onClick={() => onQueryChange({ ...query, offset: offset + pageSize })}
              >
                {t("runs.next")}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
