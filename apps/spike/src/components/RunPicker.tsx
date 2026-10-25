import { useEffect, useId, useRef, useState } from "react";
import type { RunOption } from "@frontedge-ml/ui";

/**
 * A searchable select for a run. The options come from the compact endpoint: typing asks the
 * server for a new set instead of filtering a page that is already in memory.
 */
export function RunPicker({
  value,
  options,
  onSearch,
  onChange,
  label,
  placeholder,
}: {
  value?: string;
  options: RunOption[];
  onSearch?: (query: string) => Promise<RunOption[]>;
  onChange: (id: string) => void;
  label: string;
  placeholder: string;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<RunOption[]>(options);
  const [active, setActive] = useState(0);

  // Closed: forget the search and show the initial set again.
  useEffect(() => {
    if (open) return;
    setQuery("");
    setItems(options);
    setActive(0);
  }, [open, options]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setItems(options);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!onSearch) {
        const needle = query.trim().toLowerCase();
        setItems(options.filter((option) => option.name.toLowerCase().includes(needle)));
        return;
      }
      onSearch(query.trim())
        .then((found) => {
          if (!cancelled) setItems(found);
        })
        .catch(() => undefined);
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [onSearch, open, options, query]);

  const selected =
    options.find((option) => option.id === value) ?? items.find((option) => option.id === value);
  const display = selected?.name ?? value ?? "—";

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className="fe-runpicker__wrap" ref={wrapRef}>
      <button
        type="button"
        className="fe-select fe-runpicker__trigger"
        aria-label={`${label}: ${display}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {display}
      </button>
      {open ? (
        <div className="fe-runpicker">
          <input
            className="fe-input fe-runpicker__search"
            value={query}
            placeholder={placeholder}
            aria-label={placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
            autoFocus
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, items.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              }
              if (event.key === "Enter" && items[active]) {
                event.preventDefault();
                choose(items[active]!.id);
              }
            }}
          />
          <ul id={listId} role="listbox" className="fe-runpicker__list" aria-label={label}>
            {items.map((option, index) => (
              <li
                key={option.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.id === value}
                data-active={index === active}
                className="fe-runpicker__option"
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option.id)}
              >
                <span>{option.name}</span>
                <span className="fe-runpicker__meta">{option.status}</span>
              </li>
            ))}
            {items.length === 0 ? <li className="fe-runpicker__empty">—</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
