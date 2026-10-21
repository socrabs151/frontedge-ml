/**
 * Доменные типы приходят из Python-моделей: файл сгенерирован командой
 * `frontedge gen` (см. python/frontedge/src/frontedge/gen/typescript.py).
 * Правим модель в Python и перегенерируем — руками типы не меняем.
 */
export type {
  ActionResult,
  ActionSpec,
  Artifact,
  DatasetDetail,
  DatasetInfo,
  EvalComparison,
  EvalSummary,
  Example,
  ExampleResult,
  Freshness,
  LogLine,
  MetricDirection,
  MetricEvent,
  MetricPoint,
  ProvenanceEntry,
  Run,
  RunStatus,
  Stage,
  StageName,
  UiConfig,
} from "./generated/types";

export { frontedgeRoles } from "./generated/types";
