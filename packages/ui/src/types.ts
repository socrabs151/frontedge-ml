/* Типы домена Frontedge. Отражают модель §5 дизайн-документа. */

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "lost";

export type Freshness = "live" | "fresh" | "stale" | "partial";

export type StageName = "queued" | "prepare" | "train" | "eval" | "publish";

export type MetricDirection = "maximize" | "minimize" | "none";

export interface Stage {
  name: StageName;
  status: RunStatus;
  startedAt: number;
  endedAt: number | null;
}

export interface MetricPoint {
  step: number;
  value: number;
}

export interface MetricEvent {
  stage: StageName;
  step: number;
  label: string;
  kind: "regression" | "checkpoint" | "notice";
}

export interface Run {
  id: string;
  name: string;
  status: RunStatus;
  freshness: Freshness;
  dataset: string;
  gitSha: string;
  startedAt: number;
  durationMs: number;
  owner: string;
  seed: number;
  metrics: Record<string, number>;
  series: Record<string, MetricPoint[]>;
  baselineSeries: Record<string, MetricPoint[]>;
  metricDirection: Record<string, MetricDirection>;
  stages: Stage[];
  events: MetricEvent[];
  artifacts: Artifact[];
  provenance: ProvenanceEntry[];
}

export interface Artifact {
  id: string;
  name: string;
  kind: "checkpoint" | "log" | "report" | "dataset" | "figure";
  sizeBytes: number;
  createdAt: number;
}

export interface ProvenanceEntry {
  label: string;
  value: string;
  mono?: boolean;
}

export interface Example {
  id: string;
  input: string;
  output: string;
  expected: string;
  score: number;
  baselineScore: number;
}

export interface LogLine {
  id: number;
  at: number;
  level: "info" | "progress" | "warning" | "error";
  text: string;
}
