import {
  DatasetTable,
  EmptyState,
  LoadingRows,
  ProvenanceList,
  Tabs,
  useI18n,
} from "@frontedge-ml/ui";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { DatasetDetail, DatasetInfo, ExampleResult } from "@frontedge-ml/ui";
import { useAppT } from "../i18n";
import { Pager } from "../components/Pager";
import { errorMessage, source } from "../data/source";

const EXAMPLE_PAGE = 20;

export function DatasetScreen() {
  const t = useAppT();
  const { lang } = useI18n();
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  const [datasets, setDatasets] = useState<DatasetInfo[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [examples, setExamples] = useState<ExampleResult[]>([]);
  const [examplesTotal, setExamplesTotal] = useState(0);
  const [examplesOffset, setExamplesOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("examples");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    source
      .listDatasets()
      .then((list) => {
        if (cancelled) return;
        setDatasets(list);
        setSelectedId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetail(null);
    source
      .getDataset(selectedId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setExamples([]);
      setExamplesTotal(0);
      return;
    }
    let cancelled = false;
    // A short debounce: typing in the search must not fire a request per keystroke.
    const timer = window.setTimeout(() => {
      source
        .datasetExamples(selectedId, {
          offset: examplesOffset,
          limit: EXAMPLE_PAGE,
          search: search.trim() || undefined,
        })
        .then((page) => {
          if (cancelled) return;
          setExamples(page.items);
          setExamplesTotal(page.total);
        })
        .catch((cause) => {
          if (!cancelled) setError(errorMessage(cause));
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedId, examplesOffset, search]);

  if (error) {
    return (
      <div className="fe-panel">
        <EmptyState
          icon={<RefreshCw size={20} aria-hidden />}
          title={t("datasets.loadError")}
          text={t("datasets.loadErrorHint", { error })}
        />
      </div>
    );
  }

  if (!datasets) {
    return <LoadingRows rows={8} height={40} label={t("loading.default")} />;
  }

  const items = [
    {
      value: "examples",
      label: t("detail.examples"),
      count: examplesTotal,
      content: (
        <div className="fe-detail__stack">
          <div className="fe-toolbar">
            <input
              className="fe-input"
              type="search"
              value={search}
              placeholder={t("datasets.examplesSearch")}
              aria-label={t("datasets.examplesSearch")}
              onChange={(event) => {
                setSearch(event.target.value);
                setExamplesOffset(0);
              }}
            />
          </div>
          {examplesTotal === 0 ? (
            <p className="fe-note">{t("datasets.noExamples", { query: search })}</p>
          ) : (
            <>
              <DatasetTable examples={examples} />
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
      value: "datasheet",
      label: t("datasets.datasheet"),
      content: detail ? (
        <dl className="fe-datasheet">
          {(detail.datasheet ?? []).map((entry) => (
            <div key={entry.label} style={{ display: "contents" }}>
              <dt className="fe-datasheet__term">{entry.label}</dt>
              <dd className="fe-datasheet__value">{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : null,
    },
    {
      value: "provenance",
      label: t("datasets.provenance"),
      content: detail ? <ProvenanceList entries={detail.provenance ?? []} /> : null,
    },
  ];

  return (
    <div className="fe-datasets">
      <div className="fe-datasets__list" role="list" aria-label={t("nav.datasets")}>
        {datasets.map((dataset) => (
          <div key={dataset.id} role="listitem">
            <button
              type="button"
              className="fe-datasets__item"
              aria-current={dataset.id === selectedId}
              onClick={() => {
                setSelectedId(dataset.id);
                setExamplesOffset(0);
              }}
            >
              <span className="fe-datasets__name">{dataset.name}</span>
              <span className="fe-datasets__meta">
                {dataset.version} · {dataset.examplesCount.toLocaleString(locale)}{" "}
                {t("datasets.examples")}
              </span>
            </button>
          </div>
        ))}
      </div>

      <div className="fe-datasets__detail">
        {detail ? (
          <>
            <header className="fe-runs__head">
              <div>
                <h2 className="fe-runs__title fe-runs__title--small">{detail.name}</h2>
                <p className="fe-runs__subtitle">
                  {t("datasets.version")} <span className="fe-mono">{detail.version}</span> ·{" "}
                  {detail.examplesCount.toLocaleString(locale)} {t("datasets.examples")} ·{" "}
                  {(detail.tags ?? []).join(", ")}
                </p>
              </div>
            </header>
            <Tabs
              items={items}
              value={tab}
              onValueChange={setTab}
              ariaLabel={t("nav.datasets")}
            />
          </>
        ) : (
          <LoadingRows rows={6} height={32} label={t("loading.default")} />
        )}
      </div>
    </div>
  );
}
