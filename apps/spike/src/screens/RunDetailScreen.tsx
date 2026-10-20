import { Button, EmptyState, LogStream, MetricCard, MetricChart, ExamplesTable, ProvenanceList, RunTimeline, StatusBadge, Tabs, Tooltip } from "@frontedge/ui";
import { ArrowLeft, Download, GitCompareArrows, Pause, Play, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { makeExamples, makeLogs } from "../data/mock";
import type { Run } from "@frontedge/ui";

export function RunDetailScreen({
  run,
  baseline,
  onBack,
}: {
  run: Run;
  baseline?: Run;
  onBack: () => void;
}) {
  const [tab, setTab] = useState("metrics");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const examples = useMemo(() => makeExamples(32), []);
  const logs = useMemo(() => makeLogs(80), []);

  const accuracySeries = run.series.accuracy ?? [];
  const lossSeries = run.series.loss ?? [];
  const baselineAccuracy = baseline?.series.accuracy ?? [];

  const items = [
    {
      value: "metrics",
      label: "Метрики",
      content: (
        <div className="fe-detail__stack">
          <div className="fe-metric-cards">
            <MetricCard
              label="Accuracy"
              value={run.metrics.accuracy}
              baseline={baseline?.metrics.accuracy}
              direction={run.metricDirection.accuracy}
              series={accuracySeries.map((point) => point.value)}
              color="var(--data-series-1)"
            />
            <MetricCard
              label="Loss"
              value={run.metrics.loss}
              baseline={baseline?.metrics.loss}
              direction={run.metricDirection.loss}
              series={lossSeries.map((point) => point.value)}
              color="var(--data-series-2)"
            />
            <MetricCard
              label="F1"
              value={run.metrics.f1}
              baseline={baseline?.metrics.f1}
              direction={run.metricDirection.f1}
              series={(run.series.f1 ?? []).map((point) => point.value)}
              color="var(--data-series-3)"
            />
            <MetricCard
              label="Токены"
              value={run.metrics.tokens}
              baseline={baseline?.metrics.tokens}
              direction="none"
              digits={0}
            />
          </div>

          <div className="fe-detail__grid">
            <MetricChart
              label="Accuracy по шагам"
              series={accuracySeries}
              baselineSeries={baselineAccuracy}
              color="var(--data-series-1)"
            />
            <MetricChart
              label="Loss по шагам"
              series={lossSeries}
              baselineSeries={baseline?.series.loss ?? []}
              color="var(--data-series-2)"
            />
          </div>

          <p className="fe-note">
            Показан один сид. Полосы других сидов и доверительные интервалы появятся в Phase 3 —
            среднее по двум сидам скрывает выбросы.
          </p>
        </div>
      ),
    },
    {
      value: "examples",
      label: "Примеры",
      count: examples.length,
      content: (
        <div className="fe-detail__stack">
          <div className="fe-detail__toolbar">
            <label className="fe-checkline">
              <input
                type="checkbox"
                checked={onlyDiff}
                onChange={(event) => setOnlyDiff(event.target.checked)}
              />
              Только различия
            </label>
            <span className="fe-note fe-note--inline">
              Score считается как доля совпадений; дельта — к baseline.
            </span>
          </div>
          <ExamplesTable examples={examples} onlyDiff={onlyDiff} />
        </div>
      ),
    },
    {
      value: "logs",
      label: "Логи",
      count: logs.length,
      content: <LogStream lines={logs} live={run.status === "running"} height={360} />,
    },
    {
      value: "artifacts",
      label: "Артефакты",
      count: run.artifacts.length,
      content: (
        <ul className="fe-artifacts">
          {run.artifacts.map((artifact) => (
            <li key={artifact.id} className="fe-artifacts__row">
              <span className="fe-artifacts__name mono">{artifact.name}</span>
              <span className="fe-artifacts__kind">{artifact.kind}</span>
              <span className="fe-artifacts__size num">
                {(artifact.sizeBytes / 1_000_000).toFixed(1)} МБ
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      value: "provenance",
      label: "Провенанс",
      content: <ProvenanceList entries={run.provenance} />,
    },
  ];

  return (
    <div className="fe-detail">
      <div className="fe-detail__crumbs">
        <button type="button" className="fe-linkbtn" onClick={onBack}>
          <ArrowLeft size={13} aria-hidden />
          Runs
        </button>
      </div>

      <header className="fe-detail__head">
        <div className="fe-detail__title">
          <h1 className="mono">{run.name}</h1>
          <StatusBadge status={run.status} />
          {run.freshness === "live" ? (
            <span className="fe-freshness fe-freshness--live">
              <span className="fe-freshness__dot" aria-hidden />
              live
            </span>
          ) : null}
        </div>
        <div className="fe-detail__actions">
          <Tooltip label="Сравнить с baseline">
            <button type="button" className="fe-btn fe-btn--secondary fe-btn--sm">
              <GitCompareArrows size={13} aria-hidden />
              Сравнить
            </button>
          </Tooltip>
          <Tooltip label="Скачать артефакты прогона">
            <button type="button" className="fe-btn fe-btn--secondary fe-btn--sm">
              <Download size={13} aria-hidden />
              Экспорт
            </button>
          </Tooltip>
          {run.status === "running" ? (
            <Button variant="ghost" size="sm" icon={<Pause size={13} aria-hidden />}>
              Остановить
            </Button>
          ) : (
            <Button variant="ghost" size="sm" icon={<Play size={13} aria-hidden />}>
              Перезапустить
            </Button>
          )}
        </div>
      </header>

      <div className="fe-detail__meta">
        <span className="fe-detail__meta-item">
          <span className="muted">Dataset</span> <span className="mono">{run.dataset}</span>
        </span>
        <span className="fe-detail__meta-item">
          <span className="muted">Git</span> <span className="mono">{run.gitSha}</span>
        </span>
        <span className="fe-detail__meta-item">
          <span className="muted">Baseline</span>{" "}
          <span className="mono">{baseline?.name ?? "не выбран"}</span>
        </span>
        <span className="fe-detail__meta-item">
          <span className="muted">Seed</span> <span className="mono num">{run.seed}</span>
        </span>
      </div>

      <RunTimeline stages={run.stages} />

      <Tabs items={items} value={tab} onValueChange={setTab} ariaLabel="Разделы прогона" />
    </div>
  );
}

export function RunDetailPlaceholder() {
  return (
    <EmptyState
      icon={<RefreshCw size={20} aria-hidden />}
      title="Прогон не выбран"
      text="Откройте прогон в списке слева, чтобы увидеть метрики, примеры и логи."
    />
  );
}
