import { Boxes, Database, GitBranch, GitCompareArrows, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Run, UiConfig, VisibilityState } from "@frontedge/ui";
import { I18nProvider, Segmented, TooltipProvider, useI18n } from "@frontedge/ui";
import { DATASET_NAMES, NOW_TIME } from "./data/mock";
import { errorMessage, source, type RunsQuery } from "./data/source";
import { useAppT } from "./i18n";
import { RunsScreen } from "./screens/RunsScreen";
import { RunDetailScreen } from "./screens/RunDetailScreen";
import { EvalDiffScreen } from "./screens/EvalDiffScreen";
import { DatasetScreen } from "./screens/DatasetScreen";

type Theme = "light" | "dark";
type Density = "compact" | "default" | "comfortable";
type Route = { name: "runs" } | { name: "run"; id: string } | { name: "evals" } | { name: "datasets" };

const ROW_HEIGHT: Record<Density, number> = { compact: 28, default: 32, comfortable: 40 };

function Shell() {
  const t = useAppT();
  const { lang, setLang } = useI18n();
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("fe-theme") as Theme | null) ?? "light",
  );
  const [density, setDensity] = useState<Density>(
    () => (localStorage.getItem("fe-density") as Density | null) ?? "default",
  );
  const [route, setRoute] = useState<Route>({ name: "runs" });
  const [query, setQuery] = useState<RunsQuery>({});
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [config, setConfig] = useState<UiConfig | null>(null);
  const [baselineId, setBaselineId] = useState<string | undefined>(undefined);
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

  const load = useCallback(() => {
    setError(null);
    source
      .listRuns(query)
      .then((page) => {
        setRuns(page.items);
        setTotal(page.total);
        setUpdatedAt(Date.now());
      })
      .catch((cause) => setError(errorMessage(cause)));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    source
      .config()
      .then((loaded) => {
        setConfig(loaded);
        if (loaded.density) setDensity(loaded.density);
        if (loaded.theme) setTheme(loaded.theme);
        if (loaded.baselineRun) {
          setBaselineId((current) => current ?? loaded.baselineRun ?? undefined);
        }
      })
      .catch(() => setConfig(null));
  }, []);

  // Live refresh: while the tab is visible, the list refreshes itself.
  useEffect(() => {
    const seconds = config?.liveRefreshSeconds ?? 0;
    if (!seconds) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [config, load]);

  const baseline = useMemo(() => {
    if (!runs) return undefined;
    return runs.find((run) => run.id === baselineId) ?? runs.find((run) => run.status === "succeeded");
  }, [runs, baselineId]);

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
              ariaLabel={t("nav.language")}
              value={lang}
              onChange={setLang}
              options={[
                { value: "en", label: "EN" },
                { value: "ru", label: "RU" },
              ]}
            />
            <Segmented
              ariaLabel="Table density"
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
              aria-label={theme === "light" ? "Switch to the dark theme" : "Switch to the light theme"}
            >
              {theme === "light" ? <Moon size={15} aria-hidden /> : <Sun size={15} aria-hidden />}
            </button>
          </div>
        </header>

        <nav className="sidebar" aria-label={t("nav.experiments")}>
          <div className="sidebar__group">
            <p className="sidebar__title">{t("nav.experiments")}</p>
            <button
              type="button"
              className={`sidebar__item${route.name === "runs" ? " sidebar__item--active" : ""}`}
              aria-current={route.name === "runs" ? "page" : undefined}
              onClick={() => setRoute({ name: "runs" })}
            >
              <Boxes size={14} aria-hidden />
              {t("nav.runs")}
            </button>
            <button
              type="button"
              className={`sidebar__item${route.name === "evals" ? " sidebar__item--active" : ""}`}
              aria-current={route.name === "evals" ? "page" : undefined}
              onClick={() => setRoute({ name: "evals" })}
            >
              <GitCompareArrows size={14} aria-hidden />
              {t("nav.evals")}
            </button>
            <button
              type="button"
              className={`sidebar__item${route.name === "datasets" ? " sidebar__item--active" : ""}`}
              aria-current={route.name === "datasets" ? "page" : undefined}
              onClick={() => setRoute({ name: "datasets" })}
            >
              <Database size={14} aria-hidden />
              {t("nav.datasets")}
            </button>
          </div>
          <div className="sidebar__foot">
            <p className="sidebar__note">
              {t("runs.source", { kind: source.kind === "api" ? "API" : "mock" })}
            </p>
          </div>
        </nav>

        <main className="content">
          {route.name === "runs" ? (
            <RunsScreen
              runs={runs}
              total={total}
              error={error}
              onRetry={load}
              onRefresh={load}
              updatedAt={updatedAt}
              query={query}
              onQueryChange={setQuery}
              baselineId={baseline?.id}
              onBaselineChange={setBaselineId}
              config={config}
              datasets={DATASET_NAMES}
              now={NOW_TIME}
              rowHeight={ROW_HEIGHT[density]}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              onOpenRun={(run) => setRoute({ name: "run", id: run.id })}
            />
          ) : route.name === "evals" ? (
            <EvalDiffScreen runs={runs} baselineId={baseline?.id} />
          ) : route.name === "datasets" ? (
            <DatasetScreen />
          ) : (
            <RunDetailScreen
              runId={route.id}
              baseline={baseline}
              config={config}
              onBack={() => setRoute({ name: "runs" })}
            />
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}

export function App() {
  return (
    <I18nProvider defaultLang="en">
      <Shell />
    </I18nProvider>
  );
}
