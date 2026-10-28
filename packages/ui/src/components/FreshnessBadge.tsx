import { useI18n } from "../i18n/I18nProvider";

const KEYS = {
  live: "freshness.live",
  fresh: "freshness.fresh",
  stale: "freshness.stale",
  partial: "freshness.partial",
} as const;

export interface FreshnessBadgeProps {
  value: string;
}

/** A dot plus the word: freshness is never colour alone. */
export function FreshnessBadge({ value }: FreshnessBadgeProps) {
  const { t } = useI18n();
  const key = KEYS[value as keyof typeof KEYS];
  return (
    <span className={`fe-freshness fe-freshness--${value}`}>
      <span className="fe-freshness__dot" aria-hidden />
      {key ? t(key) : value}
    </span>
  );
}
