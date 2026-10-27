import {
  Boxes,
  Database,
  GitBranch,
  GitCompareArrows,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  FrontedgeMeta,
  Run,
  RunOption,
  UiConfig,
  VisibilityState,
} from "@frontedge-ml/ui";
import { I18nProvider, Segmented, TooltipProvider, useI18n } from "@frontedge-ml/ui";
import { errorMessage, source, type RunsQuery } from "./data/source";
import { useAppT } from "./i18n";
import { RunsScreen } from "./screens/RunsScreen";
import { CompareScreen } from "./screens/CompareScreen";
import { RunDetailScreen } from "./screens/RunDetailScreen";
import { EvalDiffScreen } from "./screens/EvalDiffScreen";
import { DatasetScreen } from "./screens/DatasetScreen";

type Theme = "light" | "dark";
type Density = "compact" | "default" | "comfortable";
type Route =
  | { name: "runs" }
  | { name: "run"; id: string }
  | { name: "compare"; ids: string[] }
  | { name: "evals" }
  | { name: "datasets" };

/** Routes and the run filters live in the hash: the whole view is linkable. */
function splitHash(hash: string): { route: Route; params: URLSearchParams } {
  const [path = "", search = ""] = hash.replace(/^#\/?/, "").split("?");
  const [name, id] = path.split("/");
  let route: Route;
  if (name === "runs" && id) route = { name: "run", id: decodeURIComponent(id) };
  else if (name === "compare") {
    route = {
      name: "compare",
      ids: (new URLSearchParams(search).get("runs") ?? "").split(",").filter(Boolean),
    };
  } else if (name === "evals") route = { name: "evals" };
  else if (name === "datasets") route = { name: "datasets" };
  else route = { name: "runs" };
  return { route, params: new URLSearchParams(search) };
}

function queryFromParams(params: URLSearchParams): RunsQuery {
  const offset = Number(params.get("offset") ?? 0);
  const order = params.get("order");
  return {
    search: params.get("search") ?? undefined,
    status: params.get("status") ?? undefined,
    dataset: params.get("dataset") ?? undefined,
    tag: params.get("tag") ?? undefined,
    sort: params.get("sort") ?? undefined,
    order: order === "asc" ? "asc" : order === "desc" ? "desc" : undefined,
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
  };
}

function paramsFromState(query: RunsQuery, baselineId?: string): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ["search", "status", "dataset", "tag", "sort", "order"] as const) {
    const value = query[key];
    if (value) params.set(key, String(value));
  }
  if (query.offset) params.set("offset", String(query.offset));
  if (baselineId) params.set("baseline", baselineId);
  return params;
}

function hashOfRoute(route: Route, params?: URLSearchParams): string {
  if (route.name === "compare") {
    return `#/compare?runs=${route.ids.map(encodeURIComponent).join(",")}`;
  }
  const base =
    route.name === "run" ? `#/runs/${encodeURIComponent(route.id)}` : `#/${route.name}`;
  const search = params?.toString();
  return search ? `${base}?${search}` : base;
}

const ROW_HEIGHT: Record<Density, number> = { compact: 28, default: 32, comfortable: 40 };

/** A preference from localStorage: a broken value must not break the screen. */
function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function Shell() {
  const t = useAppT();
  const { lang, setLang } = useI18n();
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("fe-theme") as Theme | null) ?? "light",
  );
  const [density, setDensity] = useState<Density>(
    () => (localStorage.getItem("fe-density") as Density | null) ?? "default",
  );
  const initialHash = splitHash(window.location.hash);
  const [route, setRouteState] = useState<Route>(initialHash.route);
  const [query, setQuery] = useState<RunsQuery>(() => queryFromParams(initialHash.params));
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [config, setConfig] = useState<UiConfig | null>(null);
  const [runChoices, setRunChoices] = useState<RunOption[]>([]);
  // Relative times must follow the real clock, not a date frozen in the demo data.
  const [now, setNow] = useState(() => Date.now());
  const [capabilities, setCapabilities] = useState<FrontedgeMeta["capabilities"] | null>(null);
  const [baselineId, setBaselineId] = useState<string | undefined>(
    () => initialHash.params.get("baseline") ?? undefined,
  );
  const setRoute = useCallback(
    (next: Route) => {
      const params =
        next.name === "runs" || next.name === "run"
          ? paramsFromState(query, baselineId)
          : undefined;
      const hash = hashOfRoute(next, params);
      if (window.location.hash !== hash) window.location.hash = hash;
      setRouteState(next);
    },
    [baselineId, query],
  );
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    stored<VisibilityState>("fe-columns", { gitSha: false }),
  );
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>(() =>
    stored<Record<string, number>>("fe-column-widths", {}),
  );
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("fe-sidebar") === "collapsed");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("fe-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("fe-columns", JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  useEffect(() => {
    localStorage.setItem("fe-column-widths", JSON.stringify(columnSizing));
  }, [columnSizing]);

  useEffect(() => {
    localStorage.setItem("fe-sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    localStorage.setItem("fe-density", density);
  }, [density]);

  const pageSize = config?.pageSize ?? 50;

  const load = useCallback(() => {
    setError(null);
    source
      .listRuns({ ...query, limit: pageSize })
      .then((page) => {
        setRuns(page.items);
        setTotal(page.total);
        setUpdatedAt(Date.now());
      })
      .catch((cause) => setError(errorMessage(cause)));
  }, [pageSize, query]);

  useEffect(() => {
    load();
  }, [load]);

  // The pickers cover the project, not only the visible page. They are small: id, name, status.
  useEffect(() => {
    source
      .runOptions()
      .then(setRunChoices)
      .catch(() => setRunChoices([]));
  }, []);

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

  // The back button, a pasted link and a reload all arrive here.
  useEffect(() => {
    const onHashChange = () => {
      const parsed = splitHash(window.location.hash);
      setRouteState(parsed.route);
      if (parsed.route.name === "runs" || parsed.route.name === "run") {
        setQuery(queryFromParams(parsed.params));
        setBaselineId(parsed.params.get("baseline") ?? undefined);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Keep the address bar in step with the filters: a reload or a shared link restores the view.
  useEffect(() => {
    if (route.name !== "runs" && route.name !== "run") return;
    const hash = hashOfRoute(route, paramsFromState(query, baselineId));
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
  }, [route, query, baselineId]);

  // What this installation supports: the sidebar shows only the screens the server mounts.
  useEffect(() => {
    source
      .meta()
      .then((loaded) => setCapabilities(loaded.capabilities))
      .catch(() => setCapabilities(null));
  }, []);

  useEffect(() => {
    if (route.name === "evals" && capabilities && !capabilities.evals) {
      setRoute({ name: "runs" });
    }
    if (route.name === "datasets" && capabilities && !capabilities.datasets) {
      setRoute({ name: "runs" });
    }
  }, [capabilities, route.name]);

  // Live refresh: while the tab is visible, the list refreshes itself.
  useEffect(() => {
    const seconds = config?.liveRefreshSeconds ?? 0;
    if (!seconds) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [config, load]);

  const pageBaseline = useMemo(() => {
    if (!runs) return undefined;
    return runs.find((run) => run.id === baselineId) ?? runs.find((run) => run.status === "succeeded");
  }, [runs, baselineId]);

  // The baseline may be outside the current page: fetch it once so the deltas stay honest.
  const [baselineRun, setBaselineRun] = useState<Run | undefined>(undefined);
  useEffect(() => {
    if (!baselineId) {
      setBaselineRun(undefined);
      return;
    }
    let cancelled = false;
    source
      .getRun(baselineId)
      .then((run) => {
        if (!cancelled) setBaselineRun(run);
      })
      .catch(() => {
        if (!cancelled) setBaselineRun(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [baselineId]);

  const baseline = baselineRun ?? pageBaseline;

  // The dataset filter lists what the project has, not the demo's fixture names.
  const datasetNames = useMemo(
    () =>
      [...new Set(runChoices.map((run) => run.dataset).filter((name): name is string => !!name))].sort(),
    [runChoices],
  );

  return (
    <TooltipProvider>
      <div className={`shell${collapsed ? " shell--collapsed" : ""}`}>
        <header className="topbar">
          <div className="topbar__brand">
            <button
              type="button"
              className="fe-icon-btn"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={t(collapsed ? "nav.expand" : "nav.collapse")}
              title={t(collapsed ? "nav.expand" : "nav.collapse")}
            >
              {collapsed ? (
                <PanelLeftOpen size={15} aria-hidden />
              ) : (
                <PanelLeftClose size={15} aria-hidden />
              )}
            </button>
            <span className="topbar__name">frontedge</span>
            {config?.project ? (
              <span className="topbar__project">
                <GitBranch size={12} aria-hidden />
                {config.project}
              </span>
            ) : null}
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
              ariaLabel={t("topbar.density")}
              value={density}
              onChange={setDensity}
              options={[
                { value: "compact", label: "28", ariaLabel: t("density.compact") },
                { value: "default", label: "32", ariaLabel: t("density.default") },
                { value: "comfortable", label: "40", ariaLabel: t("density.comfortable") },
              ]}
            />
            <button
              type="button"
              className="fe-icon-btn"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={t(theme === "light" ? "topbar.themeToDark" : "topbar.themeToLight")}
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
              className={`sidebar__item${
                route.name === "runs" || route.name === "run" || route.name === "compare"
                  ? " sidebar__item--active"
                  : ""
              }`}
              aria-current={
                route.name === "runs" || route.name === "run" || route.name === "compare"
                  ? "page"
                  : undefined
              }
              onClick={() => setRoute({ name: "runs" })}
              title={t("nav.runs")}
            >
              <Boxes size={14} aria-hidden />
              <span className="sidebar__label">{t("nav.runs")}</span>
            </button>
            {capabilities?.evals !== false ? (
              <button
                type="button"
                className={`sidebar__item${route.name === "evals" ? " sidebar__item--active" : ""}`}
                aria-current={route.name === "evals" ? "page" : undefined}
                onClick={() => setRoute({ name: "evals" })}
                title={t("nav.evals")}
              >
                <GitCompareArrows size={14} aria-hidden />
                <span className="sidebar__label">{t("nav.evals")}</span>
              </button>
            ) : null}
            {capabilities?.datasets !== false ? (
              <button
                type="button"
                className={`sidebar__item${route.name === "datasets" ? " sidebar__item--active" : ""}`}
                aria-current={route.name === "datasets" ? "page" : undefined}
                onClick={() => setRoute({ name: "datasets" })}
                title={t("nav.datasets")}
              >
                <Database size={14} aria-hidden />
                <span className="sidebar__label">{t("nav.datasets")}</span>
              </button>
            ) : null}
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
              baselineId={baselineId ?? pageBaseline?.id}
              baselineRun={baselineRun}
              onBaselineChange={setBaselineId}
              config={config}
              datasets={datasetNames}
              now={now}
              rowHeight={ROW_HEIGHT[density]}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              columnSizing={columnSizing}
              onColumnSizingChange={setColumnSizing}
              runChoices={runChoices}
              onOpenRun={(run) => setRoute({ name: "run", id: run.id })}
              onCompare={(ids) => setRoute({ name: "compare", ids })}
            />
          ) : route.name === "compare" ? (
            <CompareScreen
              ids={route.ids}
              config={config}
              onBack={() => setRoute({ name: "runs" })}
            />
          ) : route.name === "evals" ? (
            <EvalDiffScreen runChoices={runChoices} baselineId={baseline?.id} config={config} />
          ) : route.name === "datasets" ? (
            <DatasetScreen />
          ) : (
            <RunDetailScreen
              runId={route.id}
              baseline={baseline}
              config={config}
              canReadArtifacts={capabilities?.runs.artifacts !== false}
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
