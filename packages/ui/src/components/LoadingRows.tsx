import { useT } from "../i18n/I18nProvider";

export function LoadingRows({
  rows = 8,
  height = 32,
  label,
}: {
  rows?: number;
  height?: number;
  label?: string;
}) {
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
