import { Boxes, Database, GitBranch, GitCompareArrows, Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Run, RunStatus, VisibilityState } from "@frontedge/ui";
import { Segmented, TooltipProvider } from "@frontedge/ui";
import { DATASET_NAMES, NOW_TIME } from "./data/mock";
import { errorMessage, source } from "./data/source";
import { RunsScreen } from "./screens/RunsScreen";
import { RunDetailScreen, RunDetailPlaceholder } from "./screens/RunDetailScreen";
import { EvalDiffScreen } from "./screens/EvalDiffScreen";
import { DatasetScreen } from "./screens/DatasetScreen";

type Theme = "light" | "dark";
type Density = "compact" | "default" | "comfortable";
type Route = { name: "runs" } | { name: "run"; id: string } | { name: "evals" } | { name: "datasets" };

const ROW_HEIGHT: Record<Density, number> = { compact: 28, default: 32, comfortable: 40 };

const BASELINE_ID = "run-039";

export function App() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("fe-theme") as Theme | null) ?? "light",
  );
  const [density, setDensity] = useState<Density>(
    () => (localStorage.getItem("fe-density") as Density | null) ?? "default",
  );
  const [route, setRoute] = useState<Route>({ name: "runs" });
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RunStatus | "all">("all");
  const [dataset, setDataset] = useState("all");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    gitSha: false,
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("fe-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    localStorage.setItem("fe-density", density);
  }, [density]);

  const load = useMemo(
    () => () => {
      setError(null);
      source
        .listRuns()
        .then((list) => setRuns(list))
        .catch((cause) => setError(errorMessage(cause)));
    },
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const baseline = useMemo(() => {
    if (!runs) return undefined;
    return runs.find((run) => run.id === BASELINE_ID) ?? runs.find((run) => run.status === "succeeded");
  }, [runs]);

  return (
    <TooltipProvider>
      <div className="shell">
        <header className="topbar">
          <div className="topbar__brand">
            <span className="topbar__name">frontedge</span>
            <span className="topbar__project">
              <GitBranch size={12} aria-hidden />
              squad-ru-eval
            </span>
          </div>
          <div className="topbar__tools">
            <Segmented
              ariaLabel="Плотность таблицы"
              value={density}
              onChange={setDensity}
              options={[
                { value: "compact", label: "28" },
                { value: "default", label: "32" },
                { value: "comfortable", label: "40" },
              ]}
            />
            <button
              type="button"
              className="fe-icon-btn"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"}
            >
              {theme === "light" ? <Moon size={15} aria-hidden /> : <Sun size={15} aria-hidden />}
            </button>
          </div>
        </header>

        <nav className="sidebar" aria-label="Разделы проекта">
          <div className="sidebar__group">
            <p className="sidebar__title">Эксперименты</p>
            <button
              type="button"
              className={`sidebar__item${route.name === "runs" ? " sidebar__item--active" : ""}`}
              aria-current={route.name === "runs" ? "page" : undefined}
              onClick={() => setRoute({ name: "runs" })}
            >
              <Boxes size={14} aria-hidden />
              Runs
            </button>
            <button
              type="button"
              className={`sidebar__item${route.name === "evals" ? " sidebar__item--active" : ""}`}
              aria-current={route.name === "evals" ? "page" : undefined}
              onClick={() => setRoute({ name: "evals" })}
            >
              <GitCompareArrows size={14} aria-hidden />
              Evals
            </button>
            <button
              type="button"
              className={`sidebar__item${route.name === "datasets" ? " sidebar__item--active" : ""}`}
              aria-current={route.name === "datasets" ? "page" : undefined}
              onClick={() => setRoute({ name: "datasets" })}
            >
              <Database size={14} aria-hidden />
              Datasets
            </button>
          </div>
          <div className="sidebar__foot">
            <p className="sidebar__note">
              Фронтенд для ML-инжиниринга. Источник данных: {source.kind === "api" ? "API" : "мок"}.
            </p>
          </div>
        </nav>

        <main className="content">
          {route.name === "runs" ? (
            <RunsScreen
              runs={runs}
              error={error}
              onRetry={load}
              baselineId={baseline?.id}
              datasets={DATASET_NAMES}
              now={NOW_TIME}
              rowHeight={ROW_HEIGHT[density]}
              search={search}
              onSearchChange={setSearch}
              status={status}
              onStatusChange={setStatus}
              dataset={dataset}
              onDatasetChange={setDataset}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              onOpenRun={(run) => setRoute({ name: "run", id: run.id })}
              onResetFilters={() => {
                setSearch("");
                setStatus("all");
                setDataset("all");
              }}
            />
          ) : route.name === "evals" ? (
            <EvalDiffScreen runs={runs} baselineId={baseline?.id} />
          ) : route.name === "datasets" ? (
            <DatasetScreen />
          ) : (
            <RunDetailScreen
              runId={route.id}
              baseline={baseline}
              onBack={() => setRoute({ name: "runs" })}
            />
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}

export function RunListPlaceholder() {
  return <RunDetailPlaceholder />;
}
