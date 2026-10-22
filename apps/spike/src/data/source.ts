import { createClient } from "@frontedge/ui";
import type {
  ActionResult,
  DatasetDetail,
  DatasetInfo,
  EvalComparison,
  EvalSummary,
  Example,
  LogLine,
  Run,
  UiConfig,
} from "@frontedge/ui";
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
  listRuns(query?: RunsQuery): Promise<RunsPage>;
  getRun(runId: string): Promise<Run>;
  examples(runId: string): Promise<Example[]>;
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

export const mockSource: RunsSource = {
  kind: "mock",
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
    const total = runs.length;
    const offset = query.offset ?? 0;
    const page = query.limit === undefined ? runs.slice(offset) : runs.slice(offset, offset + query.limit);
    return { items: page, total };
  },
  async getRun(runId) {
    const run = mockRuns.find((candidate) => candidate.id === runId);
    if (!run) throw new Error(`Run ${runId} was not found`);
    return run;
  },
  async examples() {
    return mockExamples;
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
  async config() {
    return {
      density: "default",
      theme: "light",
      runColumns: ["name", "status", "ribbon", "dataset", "startedAt", "durationMs", "accuracy", "loss"],
      evalTabs: [],
      actions: [
        { id: "stop", label: "Stop", placement: "run", danger: true },
        { id: "export", label: "Export CSV", placement: "run" },
        { id: "rerun", label: "Restart", placement: "runs" },
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
  const mount = (globalThis as { __FRONTEDGE_MOUNT__?: string }).__FRONTEDGE_MOUNT__;
  if (mount && mount !== "@@FRONTEDGE_MOUNT@@") {
    return `${mount.replace(/\/$/, "")}/api`;
  }
  return "/frontedge/api";
}

const client = createClient({ basePath: apiBasePath() });

export const apiSource: RunsSource = {
  kind: "api",
  listRuns: (query) => client.listRuns(query ?? {}),
  getRun: (runId) => client.getRun(runId),
  async examples() {
    return [];
  },
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
