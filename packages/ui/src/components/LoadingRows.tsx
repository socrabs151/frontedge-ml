export function LoadingRows({
  rows = 8,
  height = 32,
  label = "Загрузка",
}: {
  rows?: number;
  height?: number;
  label?: string;
}) {
  return (
    <div className="fe-skeleton" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="fe-skeleton__row" style={{ height }} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
