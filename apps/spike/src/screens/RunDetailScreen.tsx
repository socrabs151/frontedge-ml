import {
  Button,
  ConfigTable,
  EMPTY,
  EmptyState,
  ExamplesTable,
  FrontedgeRequestError,
  FreshnessBadge,
  LoadingRows,
  LogStream,
  MetricCard,
  MetricChart,
  ProvenanceList,
  RunTimeline,
  StatusBadge,
  Tabs,
} from "@frontedge-ml/ui";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatAbsoluteTime, formatMetric, useI18n } from "@frontedge-ml/ui";
import type { Example, LogLine, Run, UiConfig } from "@frontedge-ml/ui";
import { useAppT } from "../i18n";
import { Pager } from "../components/Pager";
import { errorMessage, source } from "../data/source";

const EXAMPLE_PAGE = 20;

export function RunDetailScreen({
  runId,
  baseline,
  config,
  canReadArtifacts = true,
  onBack,
}: {
  runId: string;
  baseline?: Run;
  config: UiConfig | null;
  /** Whether the provider serves artifact content: otherwise the row has no dead link. */
  canReadArtifacts?: boolean;
  onBack: () => void;
}) {
  const t = useAppT();
  const { lang } = useI18n();
  const [run, setRun] = useState<Run | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [examplesTotal, setExamplesTotal] = useState(0);
  const [examplesOffset, setExamplesOffset] = useState(0);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [logAttempt, setLogAttempt] = useState(0);
  const lastLog = useRef<{ runId: string; id: number }>({ runId, id: 0 });
  const [tab, setTab] = useState("metrics");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const runActions = (config?.actions ?? []).filter((action) => action.placement === "run");
  const actionsFor = (status: Run["status"]) =>
    runActions.filter(
      (action) => !action.statuses?.length || action.statuses.includes(status),
    );

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
    setExamples([]);
    setExamplesTotal(0);
    setExamplesOffset(0);

    source
      .getRun(runId)
      .then((loaded) => {
        if (!cancelled) setRun(loaded);
      })
      .catch((cause) => {
        if (!cancelled) {
          const status = cause instanceof FrontedgeRequestError ? cause.status : undefined;
          setError({
            message: errorMessage(cause),
            notFound: status === 404 || /not found/i.test(errorMessage(cause)),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [runId, attempt]);

  // A log stream failure is a log-panel state, not a reason to replace the whole run.
  useEffect(() => {
    let cancelled = false;
    const resume =
      logAttempt > 0 && lastLog.current.runId === runId ? lastLog.current.id : 0;
    if (resume === 0) {
      setLogs([]);
      lastLog.current = { runId, id: 0 };
    }
    setLogError(null);
    const stream = source.streamLogs(runId, resume || undefined);
    void (async () => {
      try {
        for await (const line of stream) {
          if (cancelled) return;
          lastLog.current = { runId, id: line.id };
          setLogs((current) => [...current, line]);
        }
      } catch (cause) {
        if (!cancelled) setLogError(errorMessage(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, logAttempt]);

  useEffect(() => {
    let cancelled = false;
    source
      .examples(runId, { offset: examplesOffset, limit: EXAMPLE_PAGE, changed: onlyDiff })
      .then((page) => {
        if (cancelled) return;
        setExamples(page.items);
        setExamplesTotal(page.total);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [runId, examplesOffset, onlyDiff]);

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
            title={error.notFound ? t("detail.notFound") : t("runs.loadError")}
            text={
              error.notFound
                ? t("detail.notFoundHint", { id: runId })
                : t("runs.loadErrorHint", { error: error.message })
            }
            action={
              <div className="fe-empty__actions">
                {error.notFound ? null : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    {t("runs.retry")}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={onBack}>
                  {t("detail.back")}
                </Button>
              </div>
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

  const specs = config?.metrics ?? [];
  const specById = new Map(specs.map((spec) => [spec.id, spec]));
  const knownLabels: Record<string, string> = {
    accuracy: t("metric.accuracy"),
    loss: t("metric.loss"),
    f1: t("metric.f1"),
    tokens: t("metric.tokens"),
  };

  /*
   * The project's metrics come from the configuration; without it, everything the run returns.
   * Nothing here is specific to accuracy or loss: any metric gets a card, and a chart when it
   * has a series.
   */
  const metricIds =
    specs.length > 0 ? specs.map((spec) => spec.id) : Object.keys(run.metrics ?? {}).sort();
  const metrics = metricIds.map((id, index) => {
    const spec = specById.get(id);
    const series = run.series?.[id] ?? [];
    return {
      id,
      label: spec?.label ?? knownLabels[id] ?? id,
      value: run.metrics?.[id],
      baseline: baseline?.metrics?.[id],
      direction: run.metricDirection?.[id] ?? spec?.direction ?? "none",
      digits: spec?.digits ?? undefined,
      color: `var(--fe-data-series-${(index % 8) + 1})`,
      series,
      baselineSeries: baseline?.series?.[id] ?? [],
      chart: spec?.chart !== false && series.length > 1,
    };
  });
  const charted = metrics.filter((metric) => metric.chart);

  const items = [
    {
      value: "metrics",
      label: t("detail.metrics"),
      content: (
        <div className="fe-detail__stack">
          <div className="fe-metric-cards">
            {metrics.map((metric) => (
              <MetricCard
                key={metric.id}
                label={metric.label}
                value={metric.value}
                baseline={metric.baseline}
                direction={metric.direction}
                digits={metric.digits}
                series={metric.series.map((point) => point.value)}
                color={metric.color}
              />
            ))}
          </div>

          {charted.length > 0 ? (
            <div className="fe-detail__grid">
              {charted.map((metric) => (
                <MetricChart
                  key={metric.id}
                  label={metric.label}
                  series={metric.series}
                  baselineSeries={metric.baselineSeries}
                  color={metric.color}
                  digits={metric.digits}
                />
              ))}
            </div>
          ) : null}

          <p className="fe-note">{t("detail.seedsNote")}</p>
        </div>
      ),
    },
    {
      value: "config",
      label: t("detail.config"),
      content: (
        <ConfigTable
          params={run.params ?? {}}
          baseline={baseline?.params}
          baselineName={baseline?.name}
        />
      ),
    },
    {
      value: "examples",
      label: t("detail.examples"),
      count: examplesTotal,
      content: (
        <div className="fe-detail__stack">
          <div className="fe-detail__toolbar">
            <label className="fe-checkline">
              <input
                type="checkbox"
                checked={onlyDiff}
                onChange={(event) => {
                  setOnlyDiff(event.target.checked);
                  setExamplesOffset(0);
                }}
              />
              {t("detail.onlyDiff")}
            </label>
            <span className="fe-note fe-note--inline">{t("detail.scoreNote")}</span>
          </div>
          {examplesTotal === 0 && !onlyDiff ? (
            <p className="fe-note">{t("detail.examplesMissing")}</p>
          ) : (
            <>
              <ExamplesTable examples={examples} onlyDiff={onlyDiff} />
              <Pager
                offset={examplesOffset}
                total={examplesTotal}
                pageSize={EXAMPLE_PAGE}
                onChange={setExamplesOffset}
              />
            </>
          )}
        </div>
      ),
    },
    {
      value: "logs",
      label: t("detail.logs"),
      count: logs.length,
      content: (
        <div>
          {logError ? (
            <div className="fe-inline-error" role="alert">
              <span>{t("detail.logsError", { error: logError })}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setLogAttempt((value) => value + 1)}
              >
                {t("detail.reconnect")}
              </Button>
            </div>
          ) : null}
          <LogStream lines={logs} live={run.status === "running"} height={360} />
        </div>
      ),
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
                {formatMetric(artifact.sizeBytes / 1_000_000, 1, lang)} MB
              </span>
              {canReadArtifacts ? (
                <a
                  className="fe-artifacts__download"
                  href={source.artifactUrl(artifact.id)}
                  download={artifact.name}
                >
                  <Download size={13} aria-hidden />
                  {t("detail.download")}
                </a>
              ) : null}
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
          <FreshnessBadge value={run.freshness ?? "fresh"} />
        </div>
        <div className="fe-detail__actions">
          {actionsFor(run.status).map((action) => (
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
          <span className="fe-mono">{run.dataset || EMPTY}</span>
        </span>
        <span className="fe-detail__meta-item">
          <span className="fe-muted">{t("detail.git")}</span>{" "}
          <span className="fe-mono">{run.gitSha || EMPTY}</span>
        </span>
        <span className="fe-detail__meta-item">
          <span className="fe-muted">{t("tag.baseline")}</span>{" "}
          <span className="fe-mono">{baseline?.name ?? t("detail.notSelected")}</span>
        </span>
        <span className="fe-detail__meta-item">
          <span className="fe-muted">{t("detail.seed")}</span>{" "}
          <span className="fe-mono fe-num">{run.seed}</span>
        </span>
        {run.createdAt ? (
          <span className="fe-detail__meta-item">
            <span className="fe-muted">{t("detail.created")}</span>{" "}
            <span className="fe-num">{formatAbsoluteTime(Date.parse(run.createdAt), lang)}</span>
          </span>
        ) : null}
        {run.finishedAt ? (
          <span className="fe-detail__meta-item">
            <span className="fe-muted">{t("detail.finished")}</span>{" "}
            <span className="fe-num">{formatAbsoluteTime(Date.parse(run.finishedAt), lang)}</span>
          </span>
        ) : null}
        {run.tags && run.tags.length > 0 ? (
          <span className="fe-detail__meta-item">
            <span className="fe-muted">{t("column.tags")}</span>{" "}
            <span className="fe-tags">
              {run.tags.map((tag) => (
                <span key={tag} className="fe-tag">
                  {tag}
                </span>
              ))}
            </span>
          </span>
        ) : null}
      </div>

      <RunTimeline stages={run.stages ?? []} />

      <Tabs items={items} value={tab} onValueChange={setTab} ariaLabel={t("detail.metrics")} />
    </div>
  );
}
