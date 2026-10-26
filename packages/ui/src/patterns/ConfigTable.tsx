import clsx from "clsx";
import { EMPTY } from "../format";
import { useI18n } from "../i18n/I18nProvider";

const FLAGS = {
  changed: "config.changed",
  added: "config.added",
  removed: "config.removed",
} as const;

type Flag = keyof typeof FLAGS;

/** Deterministic JSON: object keys sorted, so equal configs look — and compare — equal. */
function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

/** A JSON value for a monospace cell: scalars as-is, containers as stable JSON. */
export function formatParam(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return stableJson(value);
  } catch {
    return String(value);
  }
}

function has(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function equal(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

export interface ConfigTableProps {
  params: Record<string, unknown> | null | undefined;
  /** When given, every row is compared with this configuration. */
  baseline?: Record<string, unknown> | null;
  baselineName?: string;
}

/**
 * The run configuration, optionally as a diff against the baseline.
 *
 * The values are data, not design: scalars render as-is and containers as JSON. A difference
 * carries a word ("changed", "added", "removed") rather than a colour alone.
 */
export function ConfigTable({ params, baseline, baselineName }: ConfigTableProps) {
  const { t } = useI18n();
  const values = params ?? {};
  const reference = baseline ?? {};
  const withBaseline = baseline !== undefined && baseline !== null;
  const keys = Array.from(
    new Set([...Object.keys(values), ...(withBaseline ? Object.keys(reference) : [])]),
  ).sort();

  if (keys.length === 0) {
    return (
      <p className="fe-note">
        {t("config.empty")} {t("config.emptyHint")}
      </p>
    );
  }

  return (
    <div className="fe-config">
      <table className="fe-config__table">
        <caption className="sr-only">{t("config.caption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("config.param")}</th>
            <th scope="col">{withBaseline ? t("config.thisRun") : t("config.value")}</th>
            {withBaseline ? (
              <th scope="col">
                {t("config.baseline")}
                {baselineName ? ` · ${baselineName}` : ""}
              </th>
            ) : null}
            {withBaseline ? <th scope="col">{t("config.status")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const here = has(values, key);
            const there = withBaseline && has(reference, key);
            let flag: Flag | null = null;
            if (withBaseline) {
              if (!there) flag = "added";
              else if (!here) flag = "removed";
              else if (!equal(values[key], reference[key])) flag = "changed";
            }
            return (
              <tr key={key}>
                <td className="fe-config__param fe-mono">{key}</td>
                <td>
                  <span className="fe-config__value fe-mono">
                    {here ? formatParam(values[key]) : EMPTY}
                  </span>
                </td>
                {withBaseline ? (
                  <td>
                    <span className="fe-config__value fe-mono">
                      {there ? formatParam(reference[key]) : EMPTY}
                    </span>
                  </td>
                ) : null}
                {withBaseline ? (
                  <td>
                    {flag ? (
                      <span className={clsx("fe-config__flag", `fe-config__flag--${flag}`)}>
                        {t(FLAGS[flag])}
                      </span>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
