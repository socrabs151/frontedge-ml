/**
 * Доменные типы приходят из Python-моделей: файл сгенерирован командой
 * `frontedge gen` (см. python/frontedge/src/frontedge/gen/typescript.py).
 * Правим модель в Python и перегенерируем — руками типы не меняем.
 */
export type {
  Artifact,
  Example,
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
} from "./generated/types";

export { frontedgeRoles } from "./generated/types";
