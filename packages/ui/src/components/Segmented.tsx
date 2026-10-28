import clsx from "clsx";
import { useRef, type ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
  /** A spoken name when the visible label is a number or an abbreviation. */
  ariaLabel?: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const move = (from: number, delta: number) => {
    if (options.length === 0) return;
    const next = (from + delta + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    requestAnimationFrame(() => refs.current[next]?.focus());
  };

  return (
    <div className={clsx("fe-segmented", className)} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          aria-label={option.ariaLabel}
          title={option.title}
          className="fe-segmented__item"
          tabIndex={index === activeIndex ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              move(index, 1);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              move(index, -1);
            } else if (event.key === "Home") {
              event.preventDefault();
              const first = options[0];
              if (!first) return;
              onChange(first.value);
              requestAnimationFrame(() => refs.current[0]?.focus());
            } else if (event.key === "End") {
              event.preventDefault();
              const last = options.length - 1;
              const option = options[last];
              if (!option) return;
              onChange(option.value);
              requestAnimationFrame(() => refs.current[last]?.focus());
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
