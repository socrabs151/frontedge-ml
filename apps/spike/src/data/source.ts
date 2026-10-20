import { createClient } from "@frontedge/ui";
import type {
  DatasetDetail,
  DatasetInfo,
  EvalComparison,
  EvalSummary,
  Example,
  LogLine,
  Run,
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

/**
 * Источник данных для экранов.
 *
 * Один и тот же интерфейс работает против мока (спайк, dev) и против API
 * (собранное приложение, отдаваемое FastAPI). Разница только в реализации.
 */
export interface RunsSource {
  readonly kind: "mock" | "api";
  listRuns(): Promise<Run[]>;
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
}

const mockRuns = makeRuns(200);
const mockExamples = makeExamples(32);
const mockLogs = makeLogs(80);

export const mockSource: RunsSource = {
  kind: "mock",
  async listRuns() {
    return mockRuns;
  },
  async getRun(runId) {
    const run = mockRuns.find((candidate) => candidate.id === runId);
    if (!run) throw new Error(`Прогон ${runId} не найден`);
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
};

const client = createClient({ basePath: import.meta.env.VITE_API_BASE ?? "/frontedge/api" });

export const apiSource: RunsSource = {
  kind: "api",
  listRuns: () => client.listRuns(),
  getRun: (runId) => client.getRun(runId),
  async examples() {
    return [];
  },
  streamLogs: (runId) => client.streamLogs(runId),
  listEvals: () => client.listEvals(),
  compareEval: (evalId, reference, comparison) => client.compareEval(evalId, reference, comparison),
  listDatasets: () => client.listDatasets(),
  getDataset: (datasetId) => client.getDataset(datasetId),
};

export const source: RunsSource =
  import.meta.env.VITE_DATA_SOURCE === "api" ? apiSource : mockSource;

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
