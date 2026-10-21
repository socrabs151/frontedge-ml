import {
  Button,
  EmptyState,
  ExamplesTable,
  LoadingRows,
  LogStream,
  MetricCard,
  MetricChart,
  ProvenanceList,
  RunTimeline,
  StatusBadge,
  Tabs,
} from "@frontedge/ui";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { Example, LogLine, Run, UiConfig } from "@frontedge/ui";
import { errorMessage, source } from "../data/source";

export function RunDetailScreen({
  runId,
  baseline,
  config,
  onBack,
}: {
  runId: string;
  baseline?: Run;
  config: UiConfig | null;
  onBack: () => void;
}) {
  const [run, setRun] = useState<Run | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("metrics");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const runActions = (config?.actions ?? []).filter((action) => action.placement === "run");

  const onAction = async (actionId: string) => {
    setPendingAction(actionId);
    setActionNote(null);
    try {
      const result = await source.runAction(actionId, { runId });
      setActionNote(result.message ?? (result.ok ? "Готово" : "Не выполнено"));
    } catch (cause) {
      setActionNote(errorMessage(cause));
    } finally {
      setPendingAction(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setRun(null);

    source
      .getRun(runId)
      .then((loaded) => {
        if (cancelled) return;
        setRun(loaded);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      });

    source
      .examples(runId)
      .then((loaded) => {
        if (!cancelled) setExamples(loaded);
      })
      .catch(() => undefined);

    const stream = source.streamLogs(runId);
    void (async () => {
      try {
        for await (const line of stream) {
          if (cancelled) return;
          setLogs((current) => [...current, line]);
        }
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (error) {
    return (
      <div className="fe-detail">
        <div className="fe-detail__crumbs">
          <button type="button" className="fe-linkbtn" onClick={onBack}>
            <ArrowLeft size={13} aria-hidden />
            Runs
          </button>
        </div>
        <div className="fe-panel">
          <EmptyState
            icon={<RefreshCw size={20} aria-hidden />}
            title="Не удалось загрузить прогон"
            text={`Источник данных не ответил: ${error}. Вернитесь к списку и попробуйте снова.`}
            action={
              <Button variant="secondary" size="sm" onClick={onBack}>
                К списку прогонов
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="fe-detail">
        <div className="fe-detail__crumbs">
          <button type="button" className="fe-linkbtn" onClick={onBack}>
            <ArrowLeft size={13} aria-hidden />
            Runs
          </button>
        </div>
        <LoadingRows rows={6} height={40} label="Загружаем прогон" />
      </div>
    );
  }

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
              direction={run.metricDirection?.accuracy ?? "none"}
              series={accuracySeries.map((point) => point.value)}
              color="var(--data-series-1)"
            />
            <MetricCard
              label="Loss"
              value={run.metrics.loss}
              baseline={baseline?.metrics.loss}
              direction={run.metricDirection?.loss ?? "none"}
              series={lossSeries.map((point) => point.value)}
              color="var(--data-series-2)"
            />
            <MetricCard
              label="F1"
              value={run.metrics.f1}
              baseline={baseline?.metrics.f1}
              direction={run.metricDirection?.f1 ?? "none"}
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
            Показан один сид. Другие сиды появятся, когда провайдер отдаст
            их в series: среднее по двум сидам скрывает выбросы.
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
          {examples.length === 0 ? (
            <p className="fe-note">
              Эндпоинт примеров ещё не подключён: добавьте в провайдера
              <span className="mono"> GET /api/runs/&lt;id&gt;/examples</span> — и вкладка
              наполнится.
            </p>
          ) : (
            <ExamplesTable examples={examples} onlyDiff={onlyDiff} />
          )}
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
      count: (run.artifacts ?? []).length,
      content: (
        <ul className="fe-artifacts">
          {(run.artifacts ?? []).map((artifact) => (
            <li key={artifact.id} className="fe-artifacts__row">
              <span className="fe-artifacts__name mono">{artifact.name}</span>
              <span className="fe-artifacts__kind">{artifact.kind}</span>
              <span className="fe-artifacts__size num">
                {(artifact.sizeBytes / 1_000_000).toFixed(1)} МБ
              </span>
              <a
                className="fe-artifacts__download"
                href={source.artifactUrl(artifact.id)}
                download={artifact.name}
              >
                <Download size={13} aria-hidden />
                Скачать
              </a>
            </li>
          ))}
        </ul>
      ),
    },
    {
      value: "provenance",
      label: "Провенанс",
      content: <ProvenanceList entries={run.provenance ?? []} />,
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
          {runActions.map((action) => (
            <Button
              key={action.id}
              variant={action.danger ? "danger" : "secondary"}
              size="sm"
              disabled={pendingAction !== null}
              onClick={() => onAction(action.id)}
              title={action.description ?? undefined}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </header>

      {actionNote ? (
        <p className="fe-note fe-note--action" role="status">
          {actionNote}
        </p>
      ) : null}

      {run.error ? (
        <p className="fe-run-error" role="note">
          <span className="fe-run-error__label">Причина</span>
          <span className="fe-run-error__text">{run.error}</span>
          {run.exitCode !== null && run.exitCode !== undefined ? (
            <span className="fe-run-error__code mono">код выхода {run.exitCode}</span>
          ) : null}
        </p>
      ) : null}

      <div className="fe-detail__meta">
        <span className="fe-detail__meta-item">
          <span className="muted">Dataset</span> <span className="mono">{run.dataset}</span>
        </span>
        <span className="fe-detail__meta-item">
          <span className="muted">Git</span> <span className="mono">{run.gitSha}</span>
        </span>
        <span className="fe-detail__meta-item">
          <span className="muted">Baseline</span> <span className="mono">{baseline?.name ?? "не выбран"}</span>
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
