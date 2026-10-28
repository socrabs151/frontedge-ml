import { createClient } from "@frontedge-ml/ui";
import type {
  ActionResult,
  DatasetDetail,
  DatasetInfo,
  EvalComparison,
  EvalSummary,
  Example,
  ExampleResult,
  FrontedgeMeta,
  LogLine,
  Run,
  RunOption,
  UiConfig,
} from "@frontedge-ml/ui";
import {
  makeComparison,
  makeDatasets,
  makeDatasetDetail,
  makeEvals,
  makeExamples,
  makeLogs,
  makeRuns,
} from "./mock";

/** Parameters of the runs list query. */
export interface RunsQuery {
  limit?: number;
  offset?: number;
  search?: string;
  status?: string;
  dataset?: string;
  tag?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export interface RunsPage {
  items: Run[];
  total: number;
}

/**
 * The same interface works against the mock (spike, dev) and against the API
 *
 * (the built application, served by FastAPI). Only the implementation differs.
 *
 */
export interface RunsSource {
  readonly kind: "mock" | "api";
  /** What this installation supports: screens, actions, query, logs, artifacts. */
  meta(): Promise<FrontedgeMeta>;
  listRuns(query?: RunsQuery): Promise<RunsPage>;
  /** Compact list for the baseline and comparison pickers. */
  runOptions(query?: { search?: string }): Promise<RunOption[]>;
  getRun(runId: string): Promise<Run>;
  examples(
    runId: string,
    query?: { offset?: number; limit?: number; changed?: boolean },
  ): Promise<{ items: Example[]; total: number }>;
  datasetExamples(
    datasetId: string,
    query?: { offset?: number; limit?: number; search?: string },
  ): Promise<{ items: ExampleResult[]; total: number }>;
  streamLogs(runId: string): AsyncGenerator<LogLine>;
  listEvals(): Promise<EvalSummary[]>;
  compareEval(
    evalId: string,
    referenceRun: string,
    comparisonRun: string,
  ): Promise<EvalComparison>;
  listDatasets(): Promise<DatasetInfo[]>;
  getDataset(datasetId: string): Promise<DatasetDetail>;
/** Configuration of the interface: columns, tabs, declared actions. */
  config(): Promise<UiConfig>;
/** Run an action of the project on the backend. */
  runAction(actionId: string, payload: Record<string, unknown>): Promise<ActionResult>;
/** The address of the artifact content. */
  artifactUrl(artifactId: string): string;
}

const mockRuns = makeRuns(200);
const mockExamples = makeExamples(32);
const mockLogs = makeLogs(80);

function sortValue(run: Run, key: string): string | number | null {
  if (key === "startedAt") return run.startedAt ? Date.parse(run.startedAt) : null;
  if (key === "durationMs") return run.durationMs ?? null;
  if (key === "name" || key === "status" || key === "owner") return run[key] ?? null;
  if (key === "dataset") return run.dataset ?? null;
  const metric = run.metrics?.[key];
  return typeof metric === "number" ? metric : null;
}

export const mockSource: RunsSource = {
  kind: "mock",
  async meta() {
    return {
      name: "frontedge",
      version: "0.0.0-mock",
      statuses: ["queued", "running", "succeeded", "failed", "cancelled", "lost"],
      freshness: ["live", "fresh", "stale", "partial"],
      metricDirections: ["maximize", "minimize", "none"],
      capabilities: {
        screens: ["runs", "run", "evals", "datasets"],
        actions: [],
        runs: { query: false, logs: true, artifacts: false, examples: true },
        evals: true,
        datasets: true,
      },
    };
  },
  async listRuns(query: RunsQuery = {}) {
    let runs = mockRuns;
    if (query.search) {
      const needle = query.search.trim().toLowerCase();
      runs = runs.filter((run) => run.name.toLowerCase().includes(needle));
    }
    if (query.status) {
      const wanted = new Set(query.status.split(","));
      runs = runs.filter((run) => wanted.has(run.status));
    }
    if (query.dataset) {
      runs = runs.filter((run) => run.dataset === query.dataset);
    }
    if (query.tag) {
      runs = runs.filter((run) => run.tags?.includes(query.tag!));
    }
    if (query.sort) {
      const key = query.sort;
      const desc = query.order !== "asc";
      runs = [...runs].sort((a, b) => {
        const left = sortValue(a, key);
        const right = sortValue(b, key);
        if (left === null) return right === null ? 0 : 1;
        if (right === null) return -1;
        const cmp =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right));
        return desc ? -cmp : cmp;
      });
    }
    const total = runs.length;
    const offset = query.offset ?? 0;
    const page = query.limit === undefined ? runs.slice(offset) : runs.slice(offset, offset + query.limit);
    return { items: page, total };
  },
  async runOptions(query = {}) {
    const needle = query.search?.trim().toLowerCase();
    const found = needle
      ? mockRuns.filter((run) => run.name.toLowerCase().includes(needle))
      : mockRuns;
    return found.slice(0, 500).map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      dataset: run.dataset ?? "",
      startedAt: run.startedAt,
      tags: run.tags ?? [],
    }));
  },
  async getRun(runId) {
    const run = mockRuns.find((candidate) => candidate.id === runId);
    if (!run) throw new Error(`Run ${runId} was not found`);
    return run;
  },
  async examples(_runId, query = {}) {
    const items = query.changed
      ? mockExamples.filter((example) => example.score !== example.baselineScore)
      : mockExamples;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? items.length;
    return { items: items.slice(offset, offset + limit), total: items.length };
  },
  async *streamLogs() {
    for (const line of mockLogs) {
      yield line;
    }
  },
  async listEvals() {
    return makeEvals() as unknown as EvalSummary[];
  },
  async compareEval(evalId, referenceRun, comparisonRun) {
    return makeComparison(evalId, referenceRun, comparisonRun) as unknown as EvalComparison;
  },
  async listDatasets() {
    return makeDatasets() as unknown as DatasetInfo[];
  },
  async getDataset(datasetId) {
    return makeDatasetDetail(datasetId) as unknown as DatasetDetail;
  },
  async datasetExamples(datasetId, query = {}) {
    const detail = makeDatasetDetail(datasetId) as unknown as DatasetDetail;
    let items = detail.examples ?? [];
    if (query.search) {
      const needle = query.search.trim().toLowerCase();
      items = items.filter(
        (example) =>
          example.input.toLowerCase().includes(needle) ||
          example.output.toLowerCase().includes(needle),
      );
    }
    const offset = query.offset ?? 0;
    const limit = query.limit ?? items.length;
    return { items: items.slice(offset, offset + limit), total: items.length };
  },
  async config() {
    return {
      project: "squad-ru-eval",
      density: "default",
      theme: "light",
      runColumns: ["name", "status", "ribbon", "dataset", "startedAt", "durationMs", "accuracy", "loss"],
      evalTabs: [],
      actions: [
        {
          id: "stop",
          label: "Stop",
          placement: "run",
          statuses: ["running", "queued"],
          danger: true,
        },
        { id: "export", label: "Export CSV", placement: "run" },
        {
          id: "rerun",
          label: "Restart",
          placement: "runs",
          statuses: ["succeeded", "failed", "cancelled", "lost"],
        },
      ],
    };
  },
  async runAction(actionId) {
    return { ok: true, message: `Action "${actionId}" done (mock)`, data: {} };
  },
  artifactUrl(artifactId) {
    return `/frontedge/api/artifacts/${encodeURIComponent(artifactId)}/content`;
  },
};

/**
 * The server injects the mount path into the page (window.__FRONTEDGE_MOUNT__),
 * so the interface finds its own API under whatever prefix it is served from.
 */
function apiBasePath(): string {
  // The server writes the mount path into the document meta tag; the global is the fallback for
  // an older build. No inline script, so a strict CSP works without 'unsafe-inline'.
  const meta = document.querySelector('meta[name="frontedge-mount"]')?.getAttribute("content");
  const mount = meta || (globalThis as { __FRONTEDGE_MOUNT__?: string }).__FRONTEDGE_MOUNT__;
  if (mount && mount !== "@@FRONTEDGE_MOUNT@@") {
    return `${mount.replace(/\/$/, "")}/api`;
  }
  return "/frontedge/api";
}

const client = createClient({ basePath: apiBasePath() });

export const apiSource: RunsSource = {
  kind: "api",
  meta: () => client.meta(),
  listRuns: (query) => client.listRuns(query ?? {}),
  runOptions: (query) => client.runOptions({ limit: 500, search: query?.search }),
  getRun: (runId) => client.getRun(runId),
  examples: (runId, query) => client.examples(runId, query),
  datasetExamples: (datasetId, query) => client.datasetExamples(datasetId, query),
  streamLogs: (runId) => client.streamLogs(runId),
  listEvals: () => client.listEvals(),
  compareEval: (evalId, reference, comparison) => client.compareEval(evalId, reference, comparison),
  listDatasets: () => client.listDatasets(),
  getDataset: (datasetId) => client.getDataset(datasetId),
  config: () => client.config(),
  runAction: (actionId, payload) => client.runAction(actionId, payload),
  artifactUrl: (artifactId) => client.artifactUrl(artifactId),
};

export const source: RunsSource =
  import.meta.env.VITE_DATA_SOURCE === "api" ? apiSource : mockSource;

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
