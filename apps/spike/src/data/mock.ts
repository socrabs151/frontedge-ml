import type { Example, LogLine, MetricPoint, Run, RunStatus, Stage, StageName } from "@frontedge/ui";

/** Детерминированный генератор — картинка не должна меняться между запусками. */
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

const NOW = new Date("2026-10-20T18:40:00Z").getTime();

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
        label: "потеря выросла выше baseline",
        kind: "regression",
      });
    }
    if (random() > 0.55) {
      events.push({
        stage: "eval",
        step: Math.floor(steps * 0.8),
        label: "сохранён чекпойнт",
        kind: "checkpoint",
      });
    }

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
        { label: "Код", value: `a3f19c2 (${GIT_SHAS[index % GIT_SHAS.length]})`, mono: true },
        { label: "Dataset", value: DATASETS[index % DATASETS.length]!, mono: true },
        { label: "Версия датасета", value: "v3.1.0", mono: true },
        { label: "Запустил", value: OWNERS[index % OWNERS.length]! },
        { label: "Окружение", value: "python 3.12 · cuda 12.4 · A10G", mono: true },
        { label: "Проверил", value: index % 3 === 0 ? "socrabs" : "не проверялось" },
      ],
    });
  }

  return runs;
}

const INPUTS = [
  "В чём разница между RAG и fine-tuning?",
  "Суммация: 12 пакетов по 250 г",
  "Исправь цикл: while i < n: total += arr[i]; i += 1",
  "Кто автор «Войны и мира» и когда написано?",
  "Найди в тексте все упоминания «модель» и выпиши контекст",
  "Сравни точность 0.91 и 0.88 на разных выборках",
];

const OUTPUTS = [
  "RAG подтягивает контекст из внешней базы, fine-tuning меняет веса модели.",
  "Итого 3000 г.",
  "Цикл корректен, но читает только элементы до n-1.",
  "Лев Толстой, 1869.",
  "Найдено 4 упоминания в трёх абзацах.",
  "Разница не значима при такой выборке.",
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
        ? "CUDA out of memory при батче 4096 — снизить до 2048"
        : level === "warning"
          ? "loss растёт 3 шага подряд, лучше значение на шаге 14"
          : level === "progress"
            ? `epoch ${(index % 8) + 1}/8 · step ${index * 120} · loss ${(0.9 - index * 0.008).toFixed(4)}`
            : [
                "загрузка чекпойта из s3://models/llm-base",
                "датасет squad-v2-ru: 48 271 пример",
                "вычисляю embeddings для батча",
                "сохранён промежуточный чекпойт",
                "оценка на eval-наборе: 1024 примера",
                "размер батча 2048, grad accumulation 4",
              ][index % 6]!;
    lines.push({ id: index, at: new Date(at).toISOString(), level, text });
    at += 20_000 + random() * 40_000;
  }
  return lines;
}

export const NOW_TIME = NOW;
export const DATASET_NAMES = DATASETS;
