import { Button } from "@frontedge/ui";
import { useAppT } from "../i18n";

/** Prev/Next over a server-side page; hidden when everything fits on one page. */
export function Pager({
  offset,
  total,
  pageSize,
  onChange,
}: {
  offset: number;
  total: number;
  pageSize: number;
  onChange: (offset: number) => void;
}) {
  const t = useAppT();
  if (total <= pageSize) return null;
  return (
    <div className="fe-toolbar fe-toolbar--pagination">
      <span className="fe-note fe-note--inline">
        {t("runs.showing", {
          from: Math.min(offset + 1, total),
          to: Math.min(offset + pageSize, total),
          total,
        })}
      </span>
      <div className="fe-toolbar__spacer" />
      <Button
        variant="ghost"
        size="sm"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - pageSize))}
      >
        {t("runs.prev")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={offset + pageSize >= total}
        onClick={() => onChange(offset + pageSize)}
      >
        {t("runs.next")}
      </Button>
    </div>
  );
}
