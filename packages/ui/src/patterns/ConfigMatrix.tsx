import { EMPTY } from "../format";
import { useI18n } from "../i18n/I18nProvider";
import { equalParam, formatParam } from "./ConfigTable";

export interface ConfigMatrixRun {
  id: string;
  name: string;
  params: Record<string, unknown>;
}

export interface ConfigMatrixProps {
  runs: ConfigMatrixRun[];
  onlyDiff?: boolean;
}

function has(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * The configuration of two to four runs side by side.
 *
 * A row that differs carries the word "differs": the difference is information, not a colour.
 * A parameter missing from one run is an en dash, so an added key is visible.
 */
export function ConfigMatrix({ runs, onlyDiff = false }: ConfigMatrixProps) {
  const { t } = useI18n();
  const keys = Array.from(
    new Set(runs.flatMap((run) => Object.keys(run.params))),
  ).sort();
  const rows = keys
    .map((key) => {
      const values = runs.map((run) => (has(run.params, key) ? run.params[key] : undefined));
      const differs = values.some((value) => !equalParam(value, values[0]));
      return { key, values, differs };
    })
    .filter((row) => !onlyDiff || row.differs);

  if (rows.length === 0) {
    return <p className="fe-note">{t("compare.noDifferences")}</p>;
  }

  return (
    <div className="fe-config">
      <table className="fe-config__table">
        <caption className="sr-only">{t("config.caption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("config.param")}</th>
            {runs.map((run) => (
              <th key={run.id} scope="col">
                {run.name}
              </th>
            ))}
            <th scope="col">{t("compare.change")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="fe-config__param fe-mono">{row.key}</td>
              {row.values.map((value, index) => (
                <td key={runs[index]?.id ?? index}>
                  <span className="fe-config__value fe-mono">
                    {value === undefined ? EMPTY : formatParam(value)}
                  </span>
                </td>
              ))}
              <td>
                {row.differs ? (
                  <span className="fe-config__flag">{t("compare.differs")}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
