import { useT } from "../i18n/I18nProvider";

export interface LoadingRowsProps {
  rows?: number;
  height?: number;
  label?: string;
}

export function LoadingRows({ rows = 8, height = 32, label }: LoadingRowsProps) {
  const t = useT();
  return (
    <div className="fe-skeleton" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="fe-skeleton__row" style={{ height }} />
      ))}
      <span className="sr-only">{label ?? t("loading.default")}</span>
    </div>
  );
}
