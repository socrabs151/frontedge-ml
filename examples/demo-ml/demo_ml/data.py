"""Синтетический ML-бэкенд: прогоны, примеры и логи.

Тот же генератор, что и в спайке, — только на Python: показывает, что фронт и бэкенд
описывают одни и те же объекты.
"""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from frontedge import (
    Artifact,
    Freshness,
    MetricDirection,
    MetricEvent,
    MetricPoint,
    ProvenanceEntry,
    Run,
    RunStatus,
    Stage,
    StageName,
)

NOW = datetime(2026, 10, 20, 18, 40, tzinfo=UTC)

SUFFIXES = ["lr3e-4", "bs256", "warm", "ft", "xlm-r", "s1", "lora", "quant8", "d40", "h7"]
OWNERS = ["socrabs", "m.ivanova", "d.kim", "svc-train"]
DATASETS = ["squad-v2-ru", "wiki-2024-qa", "code-repair-v3", "support-2025", "math-verify"]
GIT_SHAS = ["a3f19c2", "7b0e4d1", "c92a8f5", "41d7bb0", "e5c3092", "0b6a1d8"]

STATUS_WEIGHTS: list[tuple[RunStatus, float]] = [
    (RunStatus.succeeded, 0.72),
    (RunStatus.failed, 0.11),
    (RunStatus.running, 0.06),
    (RunStatus.queued, 0.05),
    (RunStatus.cancelled, 0.03),
    (RunStatus.lost, 0.03),
]

STAGE_ORDER = [StageName.prepare, StageName.train, StageName.eval, StageName.publish]


def _pick_status(random_: random.Random) -> RunStatus:
    roll = random_.random()
    acc = 0.0
    for status, weight in STATUS_WEIGHTS:
        acc += weight
        if roll < acc:
            return status
    return RunStatus.succeeded


def _series(random_: random.Random, start: float, end: float, steps: int = 60) -> list[MetricPoint]:
    points: list[MetricPoint] = []
    value = start
    for step in range(steps + 1):
        value += (end - start) / steps + (random_.random() - 0.5) * 0.04
        points.append(MetricPoint(step=step, value=round(value, 4)))
    return points


def _stages(random_: random.Random, started_at: datetime, status: RunStatus) -> list[Stage]:
    stages: list[Stage] = []
    cursor = started_at
    weights = [0.12, 0.55, 0.25, 0.08]

    for index, name in enumerate(STAGE_ORDER):
        duration = timedelta(seconds=(20 + random_.random() * 200) * weights[index] * 4)
        is_last = index == len(STAGE_ORDER) - 1
        if status is RunStatus.running and is_last:
            stage_status = RunStatus.running
        elif status is RunStatus.queued:
            stage_status = RunStatus.queued
        elif status is RunStatus.failed and index == 2:
            stage_status = RunStatus.failed
        elif status is RunStatus.lost and index == 2:
            stage_status = RunStatus.lost
        elif status is RunStatus.cancelled and index == 2:
            stage_status = RunStatus.cancelled
        else:
            stage_status = RunStatus.succeeded

        ended_at = None if stage_status in {RunStatus.running, RunStatus.queued} else cursor + duration
        stages.append(
            Stage(name=name, status=stage_status, started_at=cursor, ended_at=ended_at)
        )
        cursor += duration

    return stages


def make_runs(count: int = 200) -> list[Run]:
    random_ = random.Random(20261020)
    runs: list[Run] = []

    for index in range(count):
        status = _pick_status(random_)
        age_minutes = int(random_.random() * 60 * 24 * 9)
        started_at = NOW - timedelta(minutes=age_minutes)
        accuracy = 0.79 + random_.random() * 0.13
        loss = 0.24 + random_.random() * 1.1
        duration_ms = int(max(45_000, 61 * 1000 * (3 + random_.random() * 6)))

        accuracy_series = _series(random_, accuracy - 0.06, accuracy)
        loss_series = _series(random_, loss + 0.9, loss)
        f1_series = _series(random_, accuracy - 0.09, accuracy - 0.03)

        events: list[MetricEvent] = []
        if random_.random() > 0.72:
            events.append(
                MetricEvent(
                    stage=StageName.train,
                    step=int(60 * (0.3 + random_.random() * 0.5)),
                    label="потеря выросла выше baseline",
                    kind="regression",
                )
            )
        if random_.random() > 0.55:
            events.append(
                MetricEvent(
                    stage=StageName.eval,
                    step=48,
                    label="сохранён чекпойнт",
                    kind="checkpoint",
                )
            )

        freshness = (
            Freshness.live
            if status is RunStatus.running
            else Freshness.stale
            if age_minutes > 180
            else Freshness.fresh
        )

        runs.append(
            Run(
                id=f"run-{index:03d}",
                name=f"exp-{index:03d}-{SUFFIXES[index % len(SUFFIXES)]}",
                status=status,
                freshness=freshness,
                dataset=DATASETS[index % len(DATASETS)],
                git_sha=GIT_SHAS[index % len(GIT_SHAS)],
                started_at=started_at,
                duration_ms=duration_ms,
                owner=OWNERS[index % len(OWNERS)],
                seed=1000 + index * 7,
                metrics={
                    "accuracy": round(accuracy, 4),
                    "loss": round(loss, 4),
                    "f1": round(accuracy - 0.03 + random_.random() * 0.05, 4),
                    "tokens": int(1_200_000 + random_.random() * 4_000_000),
                },
                series={"accuracy": accuracy_series, "loss": loss_series, "f1": f1_series},
                baseline_series={
                    "accuracy": [
                        MetricPoint(step=p.step, value=round(p.value - 0.014, 4))
                        for p in accuracy_series
                    ],
                    "loss": [
                        MetricPoint(step=p.step, value=round(p.value + 0.09, 4))
                        for p in loss_series
                    ],
                },
                metric_direction={
                    "accuracy": MetricDirection.maximize,
                    "loss": MetricDirection.minimize,
                    "f1": MetricDirection.maximize,
                },
                stages=_stages(random_, started_at, status),
                events=events,
                artifacts=[
                    Artifact(
                        id=f"art-{index}-1",
                        name="checkpoint-2400.bin",
                        kind="checkpoint",
                        size_bytes=1_483_000_000,
                        created_at=started_at + timedelta(milliseconds=duration_ms * 0.8),
                    ),
                    Artifact(
                        id=f"art-{index}-2",
                        name="eval-report.html",
                        kind="report",
                        size_bytes=84_000,
                        created_at=started_at + timedelta(milliseconds=duration_ms * 0.95),
                    ),
                    Artifact(
                        id=f"art-{index}-3",
                        name="train.log",
                        kind="log",
                        size_bytes=1_240_000,
                        created_at=started_at + timedelta(milliseconds=duration_ms),
                    ),
                ],
                provenance=[
                    ProvenanceEntry(label="Код", value=f"a3f19c2 ({GIT_SHAS[index % len(GIT_SHAS)]})", mono=True),
                    ProvenanceEntry(label="Dataset", value=DATASETS[index % len(DATASETS)], mono=True),
                    ProvenanceEntry(label="Версия датасета", value="v3.1.0", mono=True),
                    ProvenanceEntry(label="Запустил", value=OWNERS[index % len(OWNERS)]),
                    ProvenanceEntry(label="Окружение", value="python 3.12 · cuda 12.4 · A10G", mono=True),
                    ProvenanceEntry(
                        label="Проверил",
                        value="socrabs" if index % 3 == 0 else "не проверялось",
                    ),
                ],
            )
        )

    return runs


INPUTS = [
    "В чём разница между RAG и fine-tuning?",
    "Суммация: 12 пакетов по 250 г",
    "Исправь цикл: while i < n: total += arr[i]; i += 1",
    "Кто автор «Войны и мира» и когда написано?",
]

OUTPUTS = [
    "RAG подтягивает контекст из внешней базы, fine-tuning меняет веса модели.",
    "Итого 3000 г.",
    "Цикл корректен, но читает только элементы до n-1.",
    "Лев Толстой, 1869.",
]


def make_examples(count: int = 32) -> list[dict[str, Any]]:
    random_ = random.Random(4242)
    examples: list[dict[str, Any]] = []
    for index in range(count):
        score = round(0.4 + random_.random() * 0.6, 2)
        examples.append(
            {
                "id": f"ex-{index:03d}",
                "input": INPUTS[index % len(INPUTS)],
                "output": OUTPUTS[index % len(OUTPUTS)],
                "expected": "—",
                "score": score,
                "baselineScore": round(min(1.0, max(0.0, score + (random_.random() - 0.62) * 0.3)), 2),
            }
        )
    return examples


LOG_TEMPLATES: list[tuple[Literal["info", "progress", "warning", "error"], str]] = [
    ("info", "загрузка чекпойта из s3://models/llm-base"),
    ("info", "датасет squad-v2-ru: 48 271 пример"),
    ("progress", "epoch {step}/8 · loss {loss:.4f}"),
    ("info", "вычисляю embeddings для батча"),
    ("info", "сохранён промежуточный чекпойнт"),
    ("warning", "loss растёт 3 шага подряд"),
    ("error", "CUDA out of memory при батче 4096 — снизить до 2048"),
    ("info", "оценка на eval-наборе: 1024 примера"),
]


def make_log_lines(count: int = 80) -> list[dict[str, Any]]:
    random_ = random.Random(777)
    lines: list[dict[str, Any]] = []
    at = NOW - timedelta(minutes=42)
    for index in range(count):
        level, template = LOG_TEMPLATES[index % len(LOG_TEMPLATES)]
        text = template.format(step=(index % 8) + 1, loss=0.9 - index * 0.008)
        lines.append({"id": index, "at": at.isoformat(), "level": level, "text": text})
        at += timedelta(seconds=20 + random_.random() * 40)
    return lines
