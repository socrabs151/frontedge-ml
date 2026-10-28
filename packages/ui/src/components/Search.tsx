import { Search as SearchIcon, X } from "lucide-react";
import { useT } from "../i18n/I18nProvider";

export interface SearchProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
}

export function Search({ value, onValueChange, placeholder, ariaLabel }: SearchProps) {
  const t = useT();
  return (
    <div className="fe-search">
      <SearchIcon size={13} className="fe-search__icon" aria-hidden />
      <input
        className="fe-search__input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="fe-search__clear"
          onClick={() => onValueChange("")}
          aria-label={t("search.clear")}
        >
          <X size={12} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
