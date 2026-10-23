"""Synthetic ML backend: runs, examples and logs.

The same generator as in the spike, only in Python: it shows that the front and
the backend describe the same objects.
"""

from __future__ import annotations

import hashlib
import random
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from frontedge import (
    Artifact,
    DatasetDetail,
    DatasetInfo,
    EvalComparison,
    EvalSummary,
    ExampleResult,
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
                    label="loss grew above baseline",
                    kind="regression",
                )
            )
        if random_.random() > 0.55:
            events.append(
                MetricEvent(
                    stage=StageName.eval,
                    step=48,
                    label="checkpoint saved",
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
                    ProvenanceEntry(label="Code", value=f"a3f19c2 ({GIT_SHAS[index % len(GIT_SHAS)]})", mono=True),
                    ProvenanceEntry(label="Dataset", value=DATASETS[index % len(DATASETS)], mono=True),
                    ProvenanceEntry(label="Dataset version", value="v3.1.0", mono=True),
                    ProvenanceEntry(label="Started by", value=OWNERS[index % len(OWNERS)]),
                    ProvenanceEntry(label="Environment", value="python 3.12 · cuda 12.4 · A10G", mono=True),
                    ProvenanceEntry(
                        label="Reviewed by",
                        value="socrabs" if index % 3 == 0 else "not reviewed",
                    ),
                ],
            )
        )

    return runs


INPUTS = [
    "What is the difference between RAG and fine-tuning?",
    "Summation: 12 packs of 250 g",
    "Fix the loop: while i < n: total += arr[i]; i += 1",
    "Who wrote \"War and Peace\" and when was it written?",
]

OUTPUTS = [
    "RAG pulls context from an external store, fine-tuning changes the model weights.",
    "Total 3000 g.",
    "The loop is correct, but it only reads the elements up to n-1.",
    "Leo Tolstoy, 1869.",
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
    ("info", "loading checkpoint from s3://models/llm-base"),
    ("info", "dataset squad-v2-ru: 48,271 examples"),
    ("progress", "epoch {step}/8 · loss {loss:.4f}"),
    ("info", "computing embeddings for the batch"),
    ("info", "intermediate checkpoint saved"),
    ("warning", "loss growing for 3 steps in a row"),
    ("error", "CUDA out of memory with batch 4096 — reduce to 2048"),
    ("info", "eval on the eval set: 1024 examples"),
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


# --- Evals and datasets ---------------------------------------------------

EVALS: list[dict[str, Any]] = [
    {
        "id": "eval-squad-exact",
        "name": "Exact match",
        "dataset": "squad-v2-ru",
        "scorer": "exact_match",
        "metric": "accuracy",
        "direction": "maximize",
        "aggregate": "fraction",
    },
    {
        "id": "eval-squad-f1",
        "name": "Token F1",
        "dataset": "squad-v2-ru",
        "scorer": "token_f1",
        "metric": "f1",
        "direction": "maximize",
        "aggregate": "mean",
    },
    {
        "id": "eval-support-judge",
        "name": "LLM judge: helpfulness",
        "dataset": "support-2025",
        "scorer": "llm_judge",
        "metric": "helpfulness",
        "direction": "maximize",
        "aggregate": "mean",
    },
]

DATASHEETS: dict[str, list[tuple[str, str]]] = {
    "squad-v2-ru": [
        ("Motivation", "Checking answer extraction from Russian Wikipedia articles"),
        ("Composition", "48,271 short-answer questions, 3–4 annotators per example"),
        ("Collection", "SQuAD v2 translation and manual proofreading, 2024-11"),
        ("Applications", "RAG, fact extraction, fine-tuning on short answers"),
        ("Limitations", "Only the English annotations were translated automatically"),
    ],
    "wiki-2024-qa": [
        ("Motivation", "Long context: questions over whole articles"),
        ("Composition", "12,400 question-article pairs, articles up to 8,000 words"),
        ("Collection", "2024 Wikipedia dumps, deduplicated by title"),
        ("Applications", "Testing long context and citability"),
    ],
    "code-repair-v3": [
        ("Motivation", "Fixing short functions from an error description"),
        ("Composition", "8,120 tasks from issue trackers, 3 languages"),
        ("Collection", "Open issues and pull requests, filtered by reproducibility"),
        ("Applications", "Code LLM, auto-fix, review"),
    ],
    "support-2025": [
        ("Motivation", "Quality of support replies in a customer conversation"),
        ("Composition", "31,500 dialogs, LLM-judge rating on a 1–5 scale"),
        ("Collection", "Anonymized tickets from the ticketing system, 2025 H1"),
        ("Applications", "Helpfulness scoring, refusal detection"),
    ],
    "math-verify": [
        ("Motivation", "Checking arithmetic and reasoning"),
        ("Composition", "5,600 tasks with a step-by-step solution"),
        ("Collection", "Curated selection, 2025-02"),
        ("Applications", "Mathematics, reasoning traces"),
    ],
}

DATASET_EXAMPLES = 64


def _hash_value(*parts: str) -> float:
    digest = hashlib.sha256("|".join(parts).encode()).digest()
    return int.from_bytes(digest[:4], "big") / 0xFFFFFFFF


def make_evals() -> list[EvalSummary]:
    return [
        EvalSummary(
            id=item["id"],
            name=item["name"],
            dataset=item["dataset"],
            scorer=item["scorer"],
            metric=item["metric"],
            direction=MetricDirection(item["direction"]),
            aggregate=item["aggregate"],
            runs=24,
            updated_at=NOW - timedelta(hours=3),
        )
        for item in EVALS
    ]


def _score(eval_id: str, run_id: str, example_id: str) -> float:
    value = _hash_value(eval_id, run_id, example_id)
    if eval_id.endswith("exact"):
        return 1.0 if value > 0.32 else 0.0
    if eval_id.endswith("judge"):
        return round(2.5 + value * 2.5, 3)
    return round(0.45 + value * 0.5, 3)


def make_comparison(
    eval_id: str,
    reference_run: str,
    comparison_run: str,
    reference_name: str,
    comparison_name: str,
    count: int = 32,
) -> EvalComparison:
    spec = next(item for item in EVALS if item["id"] == eval_id)
    examples: list[ExampleResult] = []
    reference_total = 0.0
    comparison_total = 0.0
    changed = 0

    for index in range(count):
        example_id = f"ex-{index:03d}"
        reference_score = _score(eval_id, reference_run, example_id)
        comparison_score = _score(eval_id, comparison_run, example_id)
        reference_total += reference_score
        comparison_total += comparison_score
        is_changed = reference_score != comparison_score
        if is_changed:
            changed += 1
        examples.append(
            ExampleResult(
                id=example_id,
                input=INPUTS[index % len(INPUTS)],
                output=OUTPUTS[index % len(OUTPUTS)],
                expected="—",
                reference_score=reference_score,
                comparison_score=comparison_score,
                changed=is_changed,
            )
        )

    return EvalComparison(
        eval_id=eval_id,
        name=spec["name"],
        dataset=spec["dataset"],
        scorer=spec["scorer"],
        metric=spec["metric"],
        direction=MetricDirection(spec["direction"]),
        aggregate=spec["aggregate"],
        reference_run=reference_run,
        comparison_run=comparison_run,
        reference_name=reference_name,
        comparison_name=comparison_name,
        examples=examples,
        reference_aggregate=round(reference_total / count, 4),
        comparison_aggregate=round(comparison_total / count, 4),
        changed=changed,
    )


def make_datasets() -> list[DatasetInfo]:
    datasets: list[DatasetInfo] = []
    for index, name in enumerate(DATASETS):
        datasheet = [
            ProvenanceEntry(label=label, value=value)
            for label, value in DATASHEETS.get(name, [])
        ]
        datasets.append(
            DatasetInfo(
                id=name,
                name=name,
                version="v3.1.0",
                examples_count=[48_271, 12_400, 8_120, 31_500, 5_600][index],
                created_at=NOW - timedelta(days=90 - index * 11),
                tags=["production" if index < 3 else "research"],
                datasheet=datasheet,
                provenance=[
                    ProvenanceEntry(label="Version", value="v3.1.0", mono=True),
                    ProvenanceEntry(label="Owner", value="socrabs"),
                    ProvenanceEntry(label="Collected", value="2025-11-04", mono=True),
                ],
            )
        )
    return datasets


def make_dataset_detail(dataset_id: str) -> DatasetDetail | None:
    info = next((item for item in make_datasets() if item.id == dataset_id), None)
    if info is None:
        return None

    examples = [
        ExampleResult(
            id=f"ex-{index:03d}",
            input=INPUTS[index % len(INPUTS)],
            output=OUTPUTS[index % len(OUTPUTS)],
            expected="—",
            reference_score=round(_hash_value(dataset_id, f"ex-{index:03d}") * 0.5 + 0.45, 3),
            comparison_score=None,
            changed=False,
        )
        for index in range(DATASET_EXAMPLES)
    ]
    return DatasetDetail(**info.model_dump(), examples=examples)
