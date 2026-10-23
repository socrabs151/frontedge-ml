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
import { useAppT } from "../i18n";
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
  const t = useAppT();
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
      setActionNote(result.message ?? (result.ok ? t("detail.actionDone") : t("detail.actionFailed")));
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
    setLogs([]);
    setExamples([]);

    source
      .getRun(runId)
      .then((loaded) => {
        if (!cancelled) setRun(loaded);
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
            {t("detail.back")}
          </button>
        </div>
        <div className="fe-panel">
          <EmptyState
            icon={<RefreshCw size={20} aria-hidden />}
            title={t("runs.loadError")}
            text={t("runs.loadErrorHint", { error })}
            action={
              <Button variant="secondary" size="sm" onClick={onBack}>
                {t("runs.resetFilters")}
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
            {t("detail.back")}
          </button>
        </div>
        <LoadingRows rows={6} height={40} label={t("loading.default")} />
      </div>
    );
  }

  const accuracySeries = run.series.accuracy ?? [];
  const lossSeries = run.series.loss ?? [];
  const baselineAccuracy = baseline?.series.accuracy ?? [];

  const items = [
    {
      value: "metrics",
      label: t("detail.metrics"),
      content: (
        <div className="fe-detail__stack">
          <div className="fe-metric-cards">
            <MetricCard
              label={t("metric.accuracy")}
              value={run.metrics.accuracy}
              baseline={baseline?.metrics.accuracy}
              direction={run.metricDirection?.accuracy ?? "none"}
              series={accuracySeries.map((point) => point.value)}
              color="var(--fe-data-series-1)"
            />
            <MetricCard
              label={t("metric.loss")}
              value={run.metrics.loss}
              baseline={baseline?.metrics.loss}
              direction={run.metricDirection?.loss ?? "none"}
              series={lossSeries.map((point) => point.value)}
              color="var(--fe-data-series-2)"
            />
            <MetricCard
              label={t("metric.f1")}
              value={run.metrics.f1}
              baseline={baseline?.metrics.f1}
              direction={run.metricDirection?.f1 ?? "none"}
              series={(run.series.f1 ?? []).map((point) => point.value)}
              color="var(--fe-data-series-3)"
            />
            <MetricCard
              label={t("metric.tokens")}
              value={run.metrics.tokens}
              baseline={baseline?.metrics.tokens}
              direction="none"
              digits={0}
            />
          </div>

          <div className="fe-detail__grid">
            <MetricChart
              label={t("metric.accuracy")}
              series={accuracySeries}
              baselineSeries={baselineAccuracy}
              color="var(--fe-data-series-1)"
            />
            <MetricChart
              label={t("metric.loss")}
              series={lossSeries}
              baselineSeries={baseline?.series.loss ?? []}
              color="var(--fe-data-series-2)"
            />
          </div>

          <p className="fe-note">{t("detail.seedsNote")}</p>
        </div>
      ),
    },
    {
      value: "examples",
      label: t("detail.examples"),
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
              {t("evals.onlyDiff")}
            </label>
              <span className="fe-note fe-note--inline">{t("detail.scoreNote")}</span>
          </div>
          {examples.length === 0 ? (
            <p className="fe-note">{t("detail.examplesMissing")}</p>
          ) : (
            <ExamplesTable examples={examples} onlyDiff={onlyDiff} />
          )}
        </div>
      ),
    },
    {
      value: "logs",
      label: t("detail.logs"),
      count: logs.length,
      content: <LogStream lines={logs} live={run.status === "running"} height={360} />,
    },
    {
      value: "artifacts",
      label: t("detail.artifacts"),
      count: (run.artifacts ?? []).length,
      content: (
        <ul className="fe-artifacts">
          {(run.artifacts ?? []).map((artifact) => (
            <li key={artifact.id} className="fe-artifacts__row">
              <span className="fe-artifacts__name fe-mono">{artifact.name}</span>
              <span className="fe-artifacts__kind">{artifact.kind}</span>
              <span className="fe-artifacts__size fe-num">
                {(artifact.sizeBytes / 1_000_000).toFixed(1)} MB
              </span>
              <a
                className="fe-artifacts__download"
                href={source.artifactUrl(artifact.id)}
                download={artifact.name}
              >
                <Download size={13} aria-hidden />
                {t("detail.download")}
              </a>
            </li>
          ))}
        </ul>
      ),
    },
    {
      value: "provenance",
      label: t("detail.provenance"),
      content: <ProvenanceList entries={run.provenance ?? []} />,
    },
  ];

  return (
    <div className="fe-detail">
      <div className="fe-detail__crumbs">
        <button type="button" className="fe-linkbtn" onClick={onBack}>
          <ArrowLeft size={13} aria-hidden />
          {t("detail.back")}
        </button>
      </div>

      <header className="fe-detail__head">
        <div className="fe-detail__title">
          <h1 className="fe-mono">{run.name}</h1>
          <StatusBadge status={run.status} />
          {run.freshness === "live" ? (
            <span className="fe-freshness fe-freshness--live">
              <span className="fe-freshness__dot" aria-hidden />
              {t("freshness.live")}
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
          <span className="fe-run-error__label">{t("detail.reason")}</span>
          <span className="fe-run-error__text">{run.error}</span>
          {run.exitCode !== null && run.exitCode !== undefined ? (
            <span className="fe-run-error__code fe-mono">
              {t("detail.exitCode", { code: run.exitCode })}
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="fe-detail__meta">
        <span className="fe-detail__meta-item">
          <span className="fe-muted">{t("detail.dataset")}</span>{" "}
          <span className="fe-mono">{run.dataset}</span>
        </span>
        <span className="fe-detail__meta-item">
          <span className="fe-muted">{t("detail.git")}</span> <span className="fe-mono">{run.gitSha}</span>
        </span>
        <span className="fe-detail__meta-item">
          <span className="fe-muted">{t("tag.baseline")}</span>{" "}
          <span className="fe-mono">{baseline?.name ?? t("detail.notSelected")}</span>
        </span>
        <span className="fe-detail__meta-item">
          <span className="fe-muted">{t("detail.seed")}</span>{" "}
          <span className="fe-mono fe-num">{run.seed}</span>
        </span>
      </div>

      <RunTimeline stages={run.stages} />

      <Tabs items={items} value={tab} onValueChange={setTab} ariaLabel={t("detail.metrics")} />
    </div>
  );
}
