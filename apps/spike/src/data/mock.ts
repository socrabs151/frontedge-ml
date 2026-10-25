import type { Example, LogLine, MetricPoint, Run, RunStatus, Stage, StageName } from "@frontedge/ui";

/** Deterministic generator: the same seed always gives the same data. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The mock is generated relative to the moment it loads, like a live backend.
const NOW = Date.now();

const SUFFIXES = ["lr3e-4", "bs256", "warm", "ft", "xlm-r", "s1", "lora", "quant8", "d40", "h7"];
const OWNERS = ["socrabs", "m.ivanova", "d.kim", "svc-train"];
const DATASETS = ["squad-v2-ru", "wiki-2024-qa", "code-repair-v3", "support-2025", "math-verify"];
const GIT_SHAS = ["a3f19c2", "7b0e4d1", "c92a8f5", "41d7bb0", "e5c3092", "0b6a1d8"];

const STATUS_WEIGHTS: Array<[RunStatus, number]> = [
  ["succeeded", 0.72],
  ["failed", 0.11],
  ["running", 0.06],
  ["queued", 0.05],
  ["cancelled", 0.03],
  ["lost", 0.03],
];

const STAGE_ORDER: StageName[] = ["prepare", "train", "eval", "publish"];

function pickStatus(random: () => number): RunStatus {
  const roll = random();
  let acc = 0;
  for (const [status, weight] of STATUS_WEIGHTS) {
    acc += weight;
    if (roll < acc) return status;
  }
  return "succeeded";
}

function makeSeries(random: () => number, start: number, end: number, steps: number): MetricPoint[] {
  const points: MetricPoint[] = [];
  let value = start;
  for (let step = 0; step <= steps; step += 1) {
    const noise = (random() - 0.5) * 0.04;
    value = value + (end - start) / steps + noise;
    points.push({ step, value: Number(value.toFixed(4)) });
  }
  return points;
}

function makeStages(
  random: () => number,
  startedAt: number,
  status: RunStatus,
): Stage[] {
  const stages: Stage[] = [];
  let cursor = startedAt;
  const weights = [0.12, 0.55, 0.25, 0.08];

  STAGE_ORDER.forEach((name, index) => {
    const duration = (20 + random() * 200) * 1000 * weights[index]! * 4;
    const isLast = index === STAGE_ORDER.length - 1;
    const stageStatus: RunStatus =
      status === "running" && isLast
        ? "running"
        : status === "queued"
          ? "queued"
          : status === "failed" && index === 2
            ? "failed"
            : status === "lost" && index === 2
              ? "lost"
              : status === "cancelled" && index === 2
                ? "cancelled"
                : "succeeded";
    stages.push({
      name,
      status: stageStatus,
      startedAt: new Date(cursor).toISOString(),
      endedAt: stageStatus === "running" || stageStatus === "queued" ? null : new Date(cursor + duration).toISOString(),
    });
    cursor += duration;
  });

  return stages;
}

export function makeRuns(count = 200): Run[] {
  const random = mulberry32(20261020);
  const runs: Run[] = [];

  for (let index = 0; index < count; index += 1) {
    const status = pickStatus(random);
    const ageMinutes = Math.floor(random() * 60 * 24 * 9);
    const startedAt = NOW - ageMinutes * 60_000;
    const accuracyBase = 0.79 + random() * 0.13;
    const lossBase = 0.24 + random() * 1.1;
    const steps = 60;
    const accuracySeries = makeSeries(random, accuracyBase - 0.06, accuracyBase, steps);
    const lossSeries = makeSeries(random, lossBase + 0.9, lossBase, steps);
    const durationMs = Math.max(
      45_000,
      accuracySeries.length * 1000 * (3 + random() * 6),
    );

    const stages = makeStages(random, startedAt, status);
    const events: Run["events"] = [];
    if (random() > 0.72) {
      events.push({
        stage: "train",
        step: Math.floor(steps * (0.3 + random() * 0.5)),
        label: "Delta against the baseline",
        kind: "regression",
      });
    }
    if (random() > 0.55) {
      events.push({
        stage: "eval",
        step: Math.floor(steps * 0.8),
        label: "Metric direction",
        kind: "checkpoint",
      });
    }

    const tags = ["experiment"];
    if (index % 3 === 0) tags.push("production");
    if (index % 5 === 0) tags.push("nightly");
    if (status === "failed") tags.push("regression");

    runs.push({
      id: `run-${index.toString().padStart(3, "0")}`,
      name: `exp-${String(index).padStart(3, "0")}-${SUFFIXES[index % SUFFIXES.length]}`,
      status,
      freshness: status === "running" ? "live" : ageMinutes > 180 ? "stale" : "fresh",
      dataset: DATASETS[index % DATASETS.length]!,
      gitSha: GIT_SHAS[index % GIT_SHAS.length]!,
      startedAt: new Date(startedAt).toISOString(),
      durationMs,
      owner: OWNERS[index % OWNERS.length]!,
      tags,
      seed: 1000 + index * 7,
      metrics: {
        accuracy: Number(accuracyBase.toFixed(4)),
        loss: Number(lossBase.toFixed(4)),
        f1: Number((accuracyBase - 0.03 + random() * 0.05).toFixed(4)),
        tokens: Math.round(1_200_000 + random() * 4_000_000),
      },
      series: {
        accuracy: accuracySeries,
        loss: lossSeries,
        f1: makeSeries(random, accuracyBase - 0.09, accuracyBase - 0.03, steps),
      },
      baselineSeries: {
        accuracy: accuracySeries.map((point) => ({
          step: point.step,
          value: Number((point.value - 0.014).toFixed(4)),
        })),
        loss: lossSeries.map((point) => ({
          step: point.step,
          value: Number((point.value + 0.09).toFixed(4)),
        })),
      },
      metricDirection: { accuracy: "maximize", loss: "minimize", f1: "maximize" },
      stages,
      events,
      artifacts: [
        {
          id: `art-${index}-1`,
          name: "checkpoint-2400.bin",
          kind: "checkpoint",
          sizeBytes: 1_483_000_000,
          createdAt: new Date(startedAt + durationMs * 0.8).toISOString(),
        },
        {
          id: `art-${index}-2`,
          name: "eval-report.html",
          kind: "report",
          sizeBytes: 84_000,
          createdAt: new Date(startedAt + durationMs * 0.95).toISOString(),
        },
        {
          id: `art-${index}-3`,
          name: "train.log",
          kind: "log",
          sizeBytes: 1_240_000,
          createdAt: new Date(startedAt + durationMs).toISOString(),
        },
      ],
      provenance: [
        { label: "Code", value: `a3f19c2 (${GIT_SHAS[index % GIT_SHAS.length]})`, mono: true },
        { label: "Dataset", value: DATASETS[index % DATASETS.length]!, mono: true },
        { label: "Dataset version", value: "v3.1.0", mono: true },
        { label: "Started by", value: OWNERS[index % OWNERS.length]! },
        { label: "Environment", value: "python 3.12 · cuda 12.4 · A10G", mono: true },
        { label: "Reviewed by", value: index % 3 === 0 ? "socrabs" : "not reviewed" },
      ],
    });
  }

  return runs;
}

const INPUTS = [
  "What is the difference between RAG and fine-tuning?",
  "Sum: 12 packs of 250 g",
  "Fix the loop: while i < n: total += arr[i]; i += 1",
  "Who wrote War and Peace, and when?",
  "Find every mention of the model in the text and list the context",
  "Compare an accuracy of 0.91 and 0.88 on different samples",
];

const OUTPUTS = [
  "RAG pulls context from an external store, fine-tuning changes the weights.",
  "Total 3000 g.",
  "The loop is correct, but it reads only the elements up to n-1.",
  "Leo Tolstoy, 1869.",
  "Found 4 mentions in three paragraphs.",
  "The difference is not significant on this sample.",
];

export function makeExamples(count = 32): Example[] {
  const random = mulberry32(4242);
  const examples: Example[] = [];
  for (let index = 0; index < count; index += 1) {
    const score = Number((0.4 + random() * 0.6).toFixed(2));
    const baselineScore = Number(
      Math.min(1, Math.max(0, score + (random() - 0.62) * 0.3)).toFixed(2),
    );
    examples.push({
      id: `ex-${String(index).padStart(3, "0")}`,
      input: INPUTS[index % INPUTS.length]!,
      output: OUTPUTS[index % OUTPUTS.length]!,
      expected: "—",
      score,
      baselineScore,
    });
  }
  return examples;
}

export function makeLogs(count = 80): LogLine[] {
  const random = mulberry32(777);
  const lines: LogLine[] = [];
  let at = NOW - 42 * 60_000;
  for (let index = 0; index < count; index += 1) {
    const roll = random();
    const level: LogLine["level"] =
      roll > 0.94 ? "error" : roll > 0.86 ? "warning" : roll > 0.55 ? "progress" : "info";
    const text =
      level === "error"
        ? "CUDA out of memory at batch 4096 - lower it to 2048"
        : level === "warning"
        ? "loss grew for 3 steps in a row, best value was at step 14"
          : level === "progress"
            ? `epoch ${(index % 8) + 1}/8 · step ${index * 120} · loss ${(0.9 - index * 0.008).toFixed(4)}`
            : [
        "loading the checkpoint from s3://models/llm-base",
        "dataset squad-v2-ru: 48,271 examples",
        "computing embeddings for the batch",
        "saved an intermediate checkpoint",
        "evaluating on the eval set: 1,024 examples",
        "batch size 2048, grad accumulation 4",
              ][index % 6]!;
    lines.push({ id: index, at: new Date(at).toISOString(), level, text });
    at += 20_000 + random() * 40_000;
  }
  return lines;
}

export const NOW_TIME = NOW;
export const DATASET_NAMES = DATASETS;

/* --- Evaluations ------------------------------------------------------ */

export interface MockEval {
  id: string;
  name: string;
  dataset: string;
  scorer: string;
  metric: string;
  direction: "maximize" | "minimize" | "none";
  aggregate: "mean" | "fraction";
  runs: number;
  updatedAt: string;
}

const EVAL_SPECS: MockEval[] = [
  {
    id: "eval-squad-exact",
    name: "Exact match",
    dataset: "squad-v2-ru",
    scorer: "exact_match",
    metric: "accuracy",
    direction: "maximize",
    aggregate: "fraction",
    runs: 24,
    updatedAt: new Date(NOW - 3 * 3600_000).toISOString(),
  },
  {
    id: "eval-squad-f1",
    name: "Token F1",
    dataset: "squad-v2-ru",
    scorer: "token_f1",
    metric: "f1",
    direction: "maximize",
    aggregate: "mean",
    runs: 24,
    updatedAt: new Date(NOW - 5 * 3600_000).toISOString(),
  },
  {
    id: "eval-support-judge",
    name: "LLM judge: helpfulness",
    dataset: "support-2025",
    scorer: "llm_judge",
    metric: "helpfulness",
    direction: "maximize",
    aggregate: "mean",
    runs: 11,
    updatedAt: new Date(NOW - 26 * 3600_000).toISOString(),
  },
];

export function makeEvals(): MockEval[] {
  return EVAL_SPECS;
}

function hashValue(...parts: string[]): number {
  const input = parts.join("|");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

export interface MockExampleResult {
  id: string;
  input: string;
  output: string;
  expected: string | null;
  referenceScore: number | null;
  comparisonScore: number | null;
  changed: boolean;
}

export function makeComparison(
  evalId: string,
  referenceRun: string,
  comparisonRun: string,
  count = 32,
) {
  const spec = EVAL_SPECS.find((item) => item.id === evalId) ?? EVAL_SPECS[0]!;
  const score = (runId: string, exampleId: string) => {
    const value = hashValue(evalId, runId, exampleId);
    if (evalId.endsWith("exact")) return value > 0.32 ? 1 : 0;
    if (evalId.endsWith("judge")) return Number((2.5 + value * 2.5).toFixed(3));
    return Number((0.45 + value * 0.5).toFixed(3));
  };

  const examples: MockExampleResult[] = [];
  let referenceTotal = 0;
  let comparisonTotal = 0;
  let changed = 0;

  for (let index = 0; index < count; index += 1) {
    const id = `ex-${String(index).padStart(3, "0")}`;
    const referenceScore = score(referenceRun, id);
    const comparisonScore = score(comparisonRun, id);
    referenceTotal += referenceScore;
    comparisonTotal += comparisonScore;
    const isChanged = referenceScore !== comparisonScore;
    if (isChanged) changed += 1;
    examples.push({
      id,
      input: INPUTS[index % INPUTS.length]!,
      output: OUTPUTS[index % OUTPUTS.length]!,
      expected: "—",
      referenceScore,
      comparisonScore,
      changed: isChanged,
    });
  }

  return {
    evalId: spec.id,
    name: spec.name,
    dataset: spec.dataset,
    scorer: spec.scorer,
    metric: spec.metric,
    direction: spec.direction,
    aggregate: spec.aggregate,
    referenceRun,
    comparisonRun,
    referenceName: referenceRun,
    comparisonName: comparisonRun,
    examples,
    referenceAggregate: Number((referenceTotal / count).toFixed(4)),
    comparisonAggregate: Number((comparisonTotal / count).toFixed(4)),
    changed,
  };
}

const DATASHEETS: Record<string, Array<[string, string]>> = {
  "squad-v2-ru": [
    ["Motivation", "Extracting answers from Russian Wikipedia articles"],
    ["Composition", "48,271 questions with a short answer, 3-4 annotators per example"],
    ["Collection", "SQuAD v2 translation and manual proofreading, 2024-11"],
    ["Intended use", "RAG, fact extraction, fine-tuning on short answers"],
    ["Limitations", "Only the English annotations were translated automatically"],
  ],
  "wiki-2024-qa": [
    ["Motivation", "Long context: questions over whole articles"],
    ["Composition", "12,400 question-article pairs, articles up to 8,000 words"],
    ["Collection", "Wikipedia dumps of 2024, deduplicated by title"],
    ["Intended use", "Testing long context and citability"],
  ],
  "code-repair-v3": [
    ["Motivation", "Fixing short functions from an error message"],
    ["Composition", "8,120 tasks from issue trackers, 3 languages"],
    ["Collection", "Open issues and pull requests, filtered by reproducibility"],
    ["Intended use", "Code LLMs, auto-repair, review"],
  ],
  "support-2025": [
    ["Motivation", "Quality of support answers in a customer conversation"],
    ["Composition", "31,500 dialogues, scored by an LLM judge on a 1-5 scale"],
    ["Collection", "Anonymised tickets from the help desk, first half of 2025"],
    ["Intended use", "Helpfulness scoring, refusal detection"],
  ],
  "math-verify": [
    ["Motivation", "Checking arithmetic and reasoning"],
    ["Composition", "5,600 tasks with a step-by-step solution"],
    ["Collection", "Curated selection, 2025-02"],
    ["Intended use", "Mathematics, reasoning traces"],
  ],
};

export interface MockDataset {
  id: string;
  name: string;
  version: string;
  examplesCount: number;
  createdAt: string;
  tags: string[];
  datasheet: Array<{ label: string; value: string }>;
  provenance: Array<{ label: string; value: string; mono: boolean }>;
}

export function makeDatasets(): MockDataset[] {
  const counts = [48_271, 12_400, 8_120, 31_500, 5_600];
  return DATASETS.map((name, index) => ({
    id: name,
    name,
    version: "v3.1.0",
    examplesCount: counts[index] ?? 0,
    createdAt: new Date(NOW - (90 - index * 11) * 86_400_000).toISOString(),
    tags: [index < 3 ? "production" : "research"],
    datasheet: (DATASHEETS[name] ?? []).map(([label, value]) => ({ label, value })),
    provenance: [
      { label: "Version", value: "v3.1.0", mono: true },
      { label: "Owner", value: "socrabs", mono: false },
      { label: "Collected", value: "2025-11-04", mono: true },
    ],
  }));
}

export function makeDatasetDetail(datasetId: string) {
  const info = makeDatasets().find((item) => item.id === datasetId);
  if (!info) return undefined;
  const examples = Array.from({ length: 64 }, (_, index) => {
    const id = `ex-${String(index).padStart(3, "0")}`;
    return {
      id,
      input: INPUTS[index % INPUTS.length]!,
      output: OUTPUTS[index % OUTPUTS.length]!,
      expected: "—",
      referenceScore: Number((0.45 + hashValue(datasetId, id) * 0.5).toFixed(3)),
      comparisonScore: null,
      changed: false,
    };
  });
  return { ...info, examples };
}
