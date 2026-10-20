import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Checkbox from "@radix-ui/react-checkbox";
import { Check, Columns3 } from "lucide-react";
import type { VisibilityState } from "@tanstack/react-table";

export interface ColumnOption {
  id: string;
  label: string;
}

export function ColumnsMenu({
  columns,
  visibility,
  onVisibilityChange,
}: {
  columns: ColumnOption[];
  visibility: VisibilityState;
  onVisibilityChange: (visibility: VisibilityState) => void;
}) {
  const hiddenCount = columns.filter((column) => visibility[column.id] === false).length;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="fe-btn fe-btn--secondary fe-btn--sm">
          <Columns3 size={13} aria-hidden />
          Колонки
          {hiddenCount > 0 ? <span className="fe-menu__hint">{hiddenCount} скрыто</span> : null}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="fe-menu" align="end" sideOffset={6}>
          {columns.map((column) => {
            const visible = visibility[column.id] !== false;
            return (
              <DropdownMenu.CheckboxItem
                key={column.id}
                className="fe-menu__item"
                checked={visible}
                onCheckedChange={(checked) =>
                  onVisibilityChange({ ...visibility, [column.id]: checked === true })
                }
                onSelect={(event) => event.preventDefault()}
              >
                <Checkbox.Root className="fe-checkbox" checked={visible}>
                  <Checkbox.Indicator>
                    <Check size={11} aria-hidden />
                  </Checkbox.Indicator>
                </Checkbox.Root>
                <span className="fe-menu__label">{column.label}</span>
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
