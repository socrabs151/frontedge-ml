import {
  Button,
  ColumnsMenu,
  EmptyState,
  RunsTable,
  Search,
  type ColumnOption,
  type VisibilityState,
} from "@frontedge/ui";
import { Download, Inbox, SlidersHorizontal, X } from "lucide-react";
import { useMemo } from "react";
import type { Run, RunStatus } from "@frontedge/ui";

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
  runs: Run[];
  baselineId: string;
  datasets: string[];
  now: number;
  rowHeight: number;
  search: string;
  onSearchChange: (value: string) => void;
  status: RunStatus | "all";
  onStatusChange: (value: RunStatus | "all") => void;
  dataset: string;
  onDatasetChange: (value: string) => void;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
  onOpenRun: (run: Run) => void;
  onResetFilters: () => void;
}

export function RunsScreen({
  runs,
  baselineId,
  datasets,
  now,
  rowHeight,
  search,
  onSearchChange,
  status,
  onStatusChange,
  dataset,
  onDatasetChange,
  columnVisibility,
  onColumnVisibilityChange,
  onOpenRun,
  onResetFilters,
}: RunsScreenProps) {
  const filtered = useMemo(
    () =>
      runs.filter((run) => {
        if (status !== "all" && run.status !== status) return false;
        if (dataset !== "all" && run.dataset !== dataset) return false;
        if (search.trim() && !run.name.includes(search.trim().toLowerCase())) return false;
        return true;
      }),
    [runs, status, dataset, search],
  );

  const activeFilters =
    (status !== "all" ? 1 : 0) + (dataset !== "all" ? 1 : 0) + (search.trim() ? 1 : 0);

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
          <Button variant="secondary" size="sm" icon={<Download size={13} aria-hidden />}>
            Экспорт CSV
          </Button>
        </div>
      </header>

      <div className="fe-toolbar">
        <Search
          value={search}
          onValueChange={onSearchChange}
          placeholder="Найти по имени прогона"
          ariaLabel="Поиск по прогонам"
        />
        <div className="fe-toolbar__group" role="group" aria-label="Фильтр по статусу">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="fe-chip"
              aria-pressed={status === option.value}
              onClick={() => onStatusChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <select
          className="fe-select"
          value={dataset}
          onChange={(event) => onDatasetChange(event.target.value)}
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
          <button type="button" className="fe-filterchip" onClick={onResetFilters}>
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

      {filtered.length === 0 ? (
        <div className="fe-panel">
          <EmptyState
            icon={<Inbox size={20} aria-hidden />}
            title="Под фильтр ничего не попало"
            text="Снимите фильтры или измените запрос — показываем только то, что подходит под условия."
            action={
              <Button variant="secondary" size="sm" onClick={onResetFilters}>
                Сбросить фильтры
              </Button>
            }
          />
        </div>
      ) : (
        <RunsTable
          runs={filtered}
          baselineId={baselineId}
          now={now}
          rowHeight={rowHeight}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={onColumnVisibilityChange}
          onOpenRun={onOpenRun}
        />
      )}
    </div>
  );
}
