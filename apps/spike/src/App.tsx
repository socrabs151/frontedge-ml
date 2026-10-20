import { RunsScreen } from "./screens/RunsScreen";
import { RunDetailScreen, RunDetailPlaceholder } from "./screens/RunDetailScreen";
import { DATASET_NAMES, makeRuns, NOW_TIME } from "./data/mock";
import { useEffect, useMemo, useState } from "react";
import type { RunStatus, VisibilityState } from "@frontedge/ui";
import { Segmented } from "@frontedge/ui";
import { Boxes, Database, GitBranch, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
type Density = "compact" | "default" | "comfortable";
type Route = { name: "runs" } | { name: "run"; id: string };

const ROW_HEIGHT: Record<Density, number> = { compact: 28, default: 32, comfortable: 40 };

const RUNS = makeRuns(200);
const BASELINE_ID = "run-039";

export function App() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("fe-theme") as Theme | null) ?? "light",
  );
  const [density, setDensity] = useState<Density>(
    () => (localStorage.getItem("fe-density") as Density | null) ?? "default",
  );
  const [route, setRoute] = useState<Route>({ name: "runs" });
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

  const selectedRun = useMemo(
    () => (route.name === "run" ? RUNS.find((run) => run.id === route.id) : undefined),
    [route],
  );
  const baseline = useMemo(() => RUNS.find((run) => run.id === BASELINE_ID), []);

  return (
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
            className="sidebar__item sidebar__item--active"
            aria-current="page"
            onClick={() => setRoute({ name: "runs" })}
          >
            <Boxes size={14} aria-hidden />
            Runs
          </button>
          <button type="button" className="sidebar__item" disabled>
            <Database size={14} aria-hidden />
            Datasets
            <span className="sidebar__hint">скоро</span>
          </button>
          <button type="button" className="sidebar__item" disabled>
            <Boxes size={14} aria-hidden />
            Evals
            <span className="sidebar__hint">скоро</span>
          </button>
        </div>
        <div className="sidebar__foot">
          <p className="sidebar__note">
            Фронтенд для ML-инжиниринга. Phase 1 — синтетические данные.
          </p>
        </div>
      </nav>

      <main className="content">
        {route.name === "runs" ? (
          <RunsScreen
            runs={RUNS}
            baselineId={BASELINE_ID}
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
        ) : selectedRun ? (
          <RunDetailScreen
            run={selectedRun}
            baseline={baseline}
            onBack={() => setRoute({ name: "runs" })}
          />
        ) : (
          <RunDetailPlaceholder />
        )}
      </main>
    </div>
  );
}
