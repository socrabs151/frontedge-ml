import {
  Button,
  ColumnsMenu,
  EmptyState,
  LoadingRows,
  RunsTable,
  Search,
  type ColumnOption,
  type VisibilityState,
} from "@frontedge/ui";
import { Download, Inbox, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Run, RunStatus, UiConfig } from "@frontedge/ui";
import { errorMessage, source, type RunsQuery } from "../data/source";

const STATUS_FILTERS: Array<{ value: RunStatus | "all"; label: string }> = [
  { value: "all", label: "Все" },
  { value: "succeeded", label: "Завершён" },
  { value: "failed", label: "Упал" },
  { value: "running", label: "Идёт" },
  { value: "queued", label: "В очереди" },
  { value: "lost", label: "Потерян" },
];

const COLUMN_OPTIONS: ColumnOption[] = [
  { id: "name", label: "Run" },
  { id: "status", label: "Статус" },
  { id: "ribbon", label: "Ход" },
  { id: "dataset", label: "Dataset" },
  { id: "gitSha", label: "Git" },
  { id: "startedAt", label: "Начат" },
  { id: "durationMs", label: "Длительность" },
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
  onBaselineChange: (runId: string | undefined) => void;
  config: UiConfig | null;
  datasets: string[];
  now: number;
  rowHeight: number;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
  onOpenRun: (run: Run) => void;
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
  onBaselineChange,
  config,
  datasets,
  now,
  rowHeight,
  columnVisibility,
  onColumnVisibilityChange,
  onOpenRun,
}: RunsScreenProps) {
  const [search, setSearch] = useState(query.search ?? "");
  const pageSize = config?.pageSize ?? 50;
  const offset = query.offset ?? 0;

  // Поиск не должен дёргать сервер на каждую букву.
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
    (query.status ? 1 : 0) + (query.dataset ? 1 : 0) + (query.search ? 1 : 0);

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

  const baselineOptions = useMemo(
    () =>
      (runs ?? []).map((run) => (
        <option key={run.id} value={run.id}>
          {run.name}
        </option>
      )),
    [runs],
  );

  return (
    <div className="fe-runs">
      <header className="fe-runs__head">
        <div>
          <h1 className="fe-runs__title">Runs</h1>
          <p className="fe-runs__subtitle">
            Прогоны проекта <span className="mono">squad-ru-eval</span> · базовая ветка{" "}
            <span className="mono">main</span>
          </p>
        </div>
        <div className="fe-runs__actions">
          <label className="fe-field">
            <span className="fe-field__label">Эталон</span>
            <select
              className="fe-select"
              value={baselineId ?? ""}
              onChange={(event) => onBaselineChange(event.target.value || undefined)}
              aria-label="Эталонный прогон"
            >
              {baselineOptions}
            </select>
          </label>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={13} aria-hidden />}
            onClick={onRefresh}
            title="Обновить список"
          >
            {updatedAt
              ? `обновлено ${new Date(updatedAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}`
              : "обновить"}
          </Button>
          <Button variant="secondary" size="sm" icon={<Download size={13} aria-hidden />}>
            Экспорт CSV
          </Button>
        </div>
      </header>

      <div className="fe-toolbar">
        <Search
          value={search}
          onValueChange={setSearch}
          placeholder="Найти по имени прогона"
          ariaLabel="Поиск по прогонам"
        />
        <div className="fe-toolbar__group" role="group" aria-label="Фильтр по статусу">
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
              {option.label}
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
          aria-label="Фильтр по датасету"
        >
          <option value="all">Все датасеты</option>
          {datasets.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
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
            {activeFilters} {activeFilters === 1 ? "фильтр" : "фильтра"}
            <X size={12} aria-hidden />
          </button>
        ) : null}
        <div className="fe-toolbar__spacer" />
        <ColumnsMenu
          columns={COLUMN_OPTIONS}
          visibility={columnVisibility}
          onVisibilityChange={onColumnVisibilityChange}
        />
      </div>

      {error ? (
        <div className="fe-panel">
          <EmptyState
            icon={<RefreshCw size={20} aria-hidden />}
            title="Не удалось загрузить прогоны"
            text={`Источник данных не ответил: ${error}. Проверьте, что API запущен, и повторите попытку.`}
            action={
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Повторить
              </Button>
            }
          />
        </div>
      ) : !runs ? (
        <LoadingRows rows={12} height={rowHeight} label="Загружаем прогоны" />
      ) : runs.length === 0 ? (
        <div className="fe-panel">
          <EmptyState
            icon={<Inbox size={20} aria-hidden />}
            title="Под фильтр ничего не попало"
            text="Снимите фильтры или измените запрос — показываем только то, что подходит под условия."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  onQueryChange({ offset: 0 });
                }}
              >
                Сбросить фильтры
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <RunsTable
            runs={runs}
            baselineId={baselineId}
            now={now}
            rowHeight={rowHeight}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={onColumnVisibilityChange}
            onOpenRun={onOpenRun}
            rowActions={rowActions}
            columnIds={config?.runColumns}
          />
          {total > runs.length || offset > 0 ? (
            <div className="fe-toolbar fe-toolbar--pagination">
              <span className="fe-note fe-note--inline">
                показано {offset + 1}–{offset + runs.length} из {total}
              </span>
              <div className="fe-toolbar__spacer" />
              <Button
                variant="ghost"
                size="sm"
                disabled={offset === 0}
                onClick={() => onQueryChange({ ...query, offset: Math.max(0, offset - pageSize) })}
              >
                Назад
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={offset + runs.length >= total}
                onClick={() => onQueryChange({ ...query, offset: offset + pageSize })}
              >
                Вперёд
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
