import {
  EmptyState,
  EvalCompareTable,
  LoadingRows,
  MetricCard,
  Segmented,
  Tabs,
  type DeltaFormat,
} from "@frontedge/ui";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { EvalComparison, EvalSummary, RunOption, UiConfig } from "@frontedge/ui";
import { useAppT } from "../i18n";
import { RunPicker } from "../components/RunPicker";
import { errorMessage, source } from "../data/source";

type EvalTab = "examples" | "summary";

export function EvalDiffScreen({
  runChoices,
  baselineId,
  config,
}: {
  /** The runs the pickers offer: the whole project, not just the current page. */
  runChoices: RunOption[];
  baselineId?: string;
  config: UiConfig | null;
}) {
  const t = useAppT();
  const [evals, setEvals] = useState<EvalSummary[] | null>(null);
  const [evalId, setEvalId] = useState("");
  const [reference, setReference] = useState(baselineId ?? "");
  const [comparisonRun, setComparisonRun] = useState("");
  const [comparison, setComparison] = useState<EvalComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [format, setFormat] = useState<DeltaFormat>("value");
  const [tab, setTab] = useState<EvalTab>("examples");
  const formatOptions: Array<{ value: DeltaFormat; label: string; title: string }> = [
    { value: "value", label: "0.73", title: t("evals.formatValue") },
    { value: "percent", label: "73%", title: t("evals.formatPercent") },
    { value: "relative", label: "×1.04", title: t("evals.formatRelative") },
  ];

  useEffect(() => {
    let cancelled = false;
    source
      .listEvals()
      .then((list) => {
        if (cancelled) return;
        setEvals(list);
        if (list.length > 0) setEvalId((current) => current || list[0]!.id);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (runChoices.length === 0) return;
    setReference((current) => current || baselineId || runChoices[0]!.id);
    setComparisonRun((current) => {
      if (current) return current;
      const candidate = runChoices.find((run) => run.id !== (baselineId ?? runChoices[0]!.id));
      return candidate?.id ?? runChoices[0]!.id;
    });
  }, [runChoices, baselineId]);

  useEffect(() => {
    if (!evalId || !reference || !comparisonRun) return;
    let cancelled = false;
    setError(null);
    setComparison(null);
    source
      .compareEval(evalId, reference, comparisonRun)
      .then((result) => {
        if (!cancelled) setComparison(result);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [evalId, reference, comparisonRun]);

  const configuredTabs: EvalTab[] =
    config?.evalTabs && config.evalTabs.length > 0
      ? config.evalTabs
      : ["examples", "summary"];
  const activeTab: EvalTab = configuredTabs.includes(tab) ? tab : configuredTabs[0]!;

  const examplesContent = (current: EvalComparison) => (
    <>
      <div className="fe-toolbar">
        <label className="fe-checkline">
          <input
            type="checkbox"
            checked={onlyDiff}
            onChange={(event) => setOnlyDiff(event.target.checked)}
          />
          {t("evals.onlyDiff")}
        </label>
        <div className="fe-toolbar__spacer" />
        <Segmented
          ariaLabel={t("evals.numberFormat")}
          value={format}
          onChange={setFormat}
          options={formatOptions}
        />
      </div>

      <EvalCompareTable comparison={current} onlyDiff={onlyDiff} format={format} />
      <p className="fe-note">
        {t("evals.aggregateNote", {
          aggregate:
            current.aggregate === "fraction" ? t("aggregate.accuracy") : t("aggregate.mean"),
        })}{" "}
        {current.direction === "maximize"
          ? t("evals.directionMax")
          : current.direction === "minimize"
            ? t("evals.directionMin")
            : ""}
      </p>
    </>
  );

  const summaryContent = (current: EvalComparison) => {
    const direction = current.direction;
    let improved = 0;
    let worsened = 0;
    let unchanged = 0;
    for (const example of current.examples) {
      const before = example.referenceScore;
      const after = example.comparisonScore;
      if (before == null || after == null || before === after) {
        unchanged += 1;
        continue;
      }
      const better = direction === "minimize" ? after < before : after > before;
      if (better) improved += 1;
      else worsened += 1;
    }

    return (
      <div className="fe-detail__stack">
        <div className="fe-metric-cards">
          <MetricCard
            label={current.referenceName}
            value={current.referenceAggregate}
            digits={3}
          />
          <MetricCard
            label={current.comparisonName}
            value={current.comparisonAggregate}
            baseline={current.referenceAggregate}
            baselineLabel={t("evals.reference")}
            direction={direction}
            digits={3}
          />
          <MetricCard
            label={t("evals.summary.changed")}
            value={current.changed}
            digits={0}
          />
        </div>
        <p className="fe-note">
          {direction === "none"
            ? t("evals.summary.noDirection", { unchanged })
            : t("evals.summary.breakdown", { improved, worsened, unchanged })}
        </p>
      </div>
    );
  };

  const items = comparison
    ? configuredTabs.map((value) =>
        value === "examples"
          ? {
              value,
              label: t("evals.tab.examples"),
              count: comparison.examples.length,
              content: examplesContent(comparison),
            }
          : {
              value,
              label: t("evals.tab.summary"),
              content: summaryContent(comparison),
            },
      )
    : [];

  return (
    <div className="fe-runs">
      <header className="fe-runs__head">
        <div>
          <h1 className="fe-runs__title">{t("evals.title")}</h1>
          <p className="fe-runs__subtitle">{t("evals.subtitle")}</p>
        </div>
      </header>

      <div className="fe-toolbar">
        <select
          className="fe-select"
          value={evalId}
          onChange={(event) => setEvalId(event.target.value)}
          aria-label={t("evals.evaluation")}
        >
          {(evals ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.scorer}
            </option>
          ))}
        </select>
        <label className="fe-field">
          <span className="fe-field__label">{t("evals.reference")}</span>
          <RunPicker
            value={reference}
            options={runChoices}
            onSearch={(search) => source.runOptions({ search })}
            onChange={setReference}
            label={t("evals.reference")}
            placeholder={t("runs.searchPlaceholder")}
          />
        </label>
        <label className="fe-field">
          <span className="fe-field__label">{t("evals.run")}</span>
          <RunPicker
            value={comparisonRun}
            options={runChoices}
            onSearch={(search) => source.runOptions({ search })}
            onChange={setComparisonRun}
            label={t("evals.run")}
            placeholder={t("runs.searchPlaceholder")}
          />
        </label>
      </div>

      {error ? (
        <div className="fe-panel">
          <EmptyState
            icon={<RefreshCw size={20} aria-hidden />}
            title={t("evals.compareError")}
            text={t("evals.compareErrorHint", { error })}
          />
        </div>
      ) : !comparison ? (
        <LoadingRows rows={10} height={32} label={t("loading.default")} />
      ) : (
        <Tabs
          items={items}
          value={activeTab}
          onValueChange={(next) => setTab(next as EvalTab)}
          ariaLabel={t("evals.title")}
        />
      )}
    </div>
  );
}
