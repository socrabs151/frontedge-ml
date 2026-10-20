import {
  Button,
  EmptyState,
  EvalCompareTable,
  LoadingRows,
  Segmented,
  type DeltaFormat,
} from "@frontedge/ui";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { EvalComparison, EvalSummary, Run } from "@frontedge/ui";
import { errorMessage, source } from "../data/source";

const FORMAT_OPTIONS: Array<{ value: DeltaFormat; label: string; title: string }> = [
  { value: "value", label: "0.73", title: "Значение как есть" },
  { value: "percent", label: "73%", title: "Процент" },
  { value: "relative", label: "×1.04", title: "Множитель относительно эталона" },
];

export function EvalDiffScreen({
  runs,
  baselineId,
}: {
  runs: Run[] | null;
  baselineId?: string;
}) {
  const [evals, setEvals] = useState<EvalSummary[] | null>(null);
  const [evalId, setEvalId] = useState("");
  const [reference, setReference] = useState(baselineId ?? "");
  const [comparisonRun, setComparisonRun] = useState("");
  const [comparison, setComparison] = useState<EvalComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [format, setFormat] = useState<DeltaFormat>("value");

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
    if (!runs || runs.length === 0) return;
    setReference((current) => current || baselineId || runs[0]!.id);
    setComparisonRun((current) => {
      if (current) return current;
      const candidate = runs.find((run) => run.id !== (baselineId ?? runs[0]!.id));
      return candidate?.id ?? runs[0]!.id;
    });
  }, [runs, baselineId]);

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

  const runOptions = useMemo(
    () =>
      (runs ?? []).map((run) => (
        <option key={run.id} value={run.id}>
          {run.name}
        </option>
      )),
    [runs],
  );

  return (
    <div className="fe-runs">
      <header className="fe-runs__head">
        <div>
          <h1 className="fe-runs__title">Eval diff</h1>
          <p className="fe-runs__subtitle">
            Примеры как строки, эталонный прогон слева. Дельта считается к эталону.
          </p>
        </div>
      </header>

      <div className="fe-toolbar">
        <select
          className="fe-select"
          value={evalId}
          onChange={(event) => setEvalId(event.target.value)}
          aria-label="Оценка"
        >
          {(evals ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.scorer}
            </option>
          ))}
        </select>
        <label className="fe-field">
          <span className="fe-field__label">Эталон</span>
          <select
            className="fe-select"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            aria-label="Эталонный прогон"
          >
            {runOptions}
          </select>
        </label>
        <label className="fe-field">
          <span className="fe-field__label">Прогон</span>
          <select
            className="fe-select"
            value={comparisonRun}
            onChange={(event) => setComparisonRun(event.target.value)}
            aria-label="Сравниваемый прогон"
          >
            {runOptions}
          </select>
        </label>
        <label className="fe-checkline">
          <input
            type="checkbox"
            checked={onlyDiff}
            onChange={(event) => setOnlyDiff(event.target.checked)}
          />
          Только различия
        </label>
        <div className="fe-toolbar__spacer" />
        <Segmented
          ariaLabel="Формат числа"
          value={format}
          onChange={setFormat}
          options={FORMAT_OPTIONS}
        />
      </div>

      {error ? (
        <div className="fe-panel">
          <EmptyState
            icon={<RefreshCw size={20} aria-hidden />}
            title="Не удалось сравнить прогоны"
            text={`Источник данных не ответил: ${error}. Попробуйте другую пару прогонов.`}
          />
        </div>
      ) : !comparison ? (
        <LoadingRows rows={10} height={32} label="Сравниваем прогоны" />
      ) : (
        <>
          <EvalCompareTable comparison={comparison} onlyDiff={onlyDiff} format={format} />
          <p className="fe-note">
            {comparison.aggregate === "fraction"
              ? "Агрегат — доля верных ответов."
              : "Агрегат — среднее по примерам."}{" "}
            Направление «{comparison.direction === "maximize" ? "больше — лучше" : "меньше — лучше"}»
            задаёт владелец метрики.
          </p>
        </>
      )}
    </div>
  );
}

export function EvalDiffPlaceholder() {
  return (
    <EmptyState
      icon={<RefreshCw size={20} aria-hidden />}
      title="Оценки не подключены"
      text="Передайте провайдера оценок в frontedge.mount(..., evals=...), чтобы увидеть этот экран."
      action={<Button variant="secondary" size="sm">Документация</Button>}
    />
  );
}
