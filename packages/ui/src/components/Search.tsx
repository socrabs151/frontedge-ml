import { Search as SearchIcon, X } from "lucide-react";

interface SearchProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
}

export function Search({ value, onValueChange, placeholder, ariaLabel }: SearchProps) {
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
          aria-label="Очистить поиск"
        >
          <X size={12} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
