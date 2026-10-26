import {
  Button,
  ConfigMatrix,
  EmptyState,
  LoadingRows,
  MetricCompareChart,
} from "@frontedge-ml/ui";
import type { CompareSeries, MetricSpec, Run, UiConfig } from "@frontedge-ml/ui";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAppT } from "../i18n";
import { errorMessage, source } from "../data/source";

const COLORS = [
  "var(--fe-data-series-1)",
  "var(--fe-data-series-2)",
  "var(--fe-data-series-3)",
  "var(--fe-data-series-4)",
];

const colorAt = (index: number) => COLORS[index] ?? "var(--fe-data-series-4)";

type Chart = { id: string; spec: MetricSpec | undefined; series: CompareSeries[] };

export function CompareScreen({
  ids,
  config,
  onBack,
}: {
  ids: string[];
  config: UiConfig | null;
  onBack: () => void;
}) {
  const t = useAppT();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const key = ids.join(",");

  useEffect(() => {
    let cancelled = false;
    setRuns(null);
    setError(null);
    Promise.all(ids.map((id) => source.getRun(id)))
      .then((loaded) => {
        if (!cancelled) setRuns(loaded);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const specById = useMemo(
    () => new Map((config?.metrics ?? []).map((spec) => [spec.id, spec])),
    [config],
  );

  const charts = useMemo(() => {
    if (!runs) return [];
    const idsInOrder = [
      ...(config?.metrics ?? []).map((spec) => spec.id),
      ...Array.from(
        new Set(
          runs.flatMap((run) => [
            ...Object.keys(run.metrics ?? {}),
            ...Object.keys(run.series ?? {}),
          ]),
        ),
      ).sort(),
    ];
    const unique = Array.from(new Set(idsInOrder));
    return unique
      .map((id) => {
        const series: CompareSeries[] = runs
          .map((run, index) => ({
            id: run.id,
            name: run.name,
            color: colorAt(index),
            points: run.series?.[id] ?? [],
          }))
          .filter((item) => item.points.length > 0);
        return series.length > 0 ? { id, spec: specById.get(id), series } : null;
      })
      .filter((item): item is Chart => item !== null);
  }, [config, runs, specById]);

  const crumbs = (
    <div className="fe-detail__crumbs">
      <button type="button" className="fe-linkbtn" onClick={onBack}>
        <ArrowLeft size={13} aria-hidden />
        {t("detail.back")}
      </button>
    </div>
  );

  if (ids.length < 2) {
    return (
      <div className="fe-detail">
        {crumbs}
        <div className="fe-panel">
          <EmptyState
            icon={<RefreshCw size={20} aria-hidden />}
            title={t("compare.empty")}
            text={t("compare.subtitle")}
            action={
              <Button variant="secondary" size="sm" onClick={onBack}>
                {t("nav.runs")}
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fe-detail">
        {crumbs}
        <div className="fe-panel">
          <EmptyState
            icon={<RefreshCw size={20} aria-hidden />}
            title={t("compare.missing")}
            text={error}
            action={
              <Button variant="secondary" size="sm" onClick={onBack}>
                {t("nav.runs")}
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (!runs) {
    return (
      <div className="fe-detail">
        {crumbs}
        <LoadingRows rows={6} height={40} label={t("loading.default")} />
      </div>
    );
  }

  return (
    <div className="fe-detail fe-compare">
      {crumbs}

      <header className="fe-detail__head">
        <div className="fe-detail__title">
          <h1>{t("compare.title")}</h1>
          <span className="fe-note fe-note--inline">{t("compare.subtitle")}</span>
        </div>
      </header>

      <div className="fe-compare__chips">
        {runs.map((run, index) => (
          <span key={run.id} className="fe-compare__chip">
            <span
              className="fe-chart__swatch"
              style={{ background: colorAt(index) }}
              aria-hidden
            />
            <span className="fe-mono">{run.name}</span>
          </span>
        ))}
      </div>

      <section className="fe-compare__section">
        <h2 className="fe-compare__heading">{t("compare.metrics")}</h2>
        {charts.length === 0 ? (
          <p className="fe-note">{t("compare.noSeries")}</p>
        ) : (
          <div className="fe-detail__grid">
            {charts.map((chart) => (
              <MetricCompareChart
                key={chart.id}
                label={chart.spec?.label ?? chart.id}
                series={chart.series}
                digits={chart.spec?.digits ?? 3}
              />
            ))}
          </div>
        )}
      </section>

      <section className="fe-compare__section">
        <div className="fe-compare__section-head">
          <h2 className="fe-compare__heading">{t("compare.config")}</h2>
          <label className="fe-checkline">
            <input
              type="checkbox"
              checked={onlyDiff}
              onChange={(event) => setOnlyDiff(event.target.checked)}
            />
            {t("compare.onlyDiff")}
          </label>
        </div>
        <ConfigMatrix
          runs={runs.map((run) => ({ id: run.id, name: run.name, params: run.params ?? {} }))}
          onlyDiff={onlyDiff}
        />
      </section>
    </div>
  );
}
