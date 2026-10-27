import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Columns3 } from "lucide-react";
import type { VisibilityState } from "@tanstack/react-table";
import { useT } from "../i18n/I18nProvider";

export interface ColumnOption {
  id: string;
  label: string;
}

export function ColumnsMenu({
  columns,
  visibility,
  onVisibilityChange,
  onResetWidths,
}: {
  columns: ColumnOption[];
  visibility: VisibilityState;
  onVisibilityChange: (visibility: VisibilityState) => void;
  /** Offered only when the user has changed a width. */
  onResetWidths?: () => void;
}) {
  const t = useT();
  const hiddenCount = columns.filter((column) => visibility[column.id] === false).length;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="fe-btn fe-btn--secondary fe-btn--sm">
          <Columns3 size={13} aria-hidden />
          {t("menu.columns")}
          {hiddenCount > 0 ? (
            <span className="fe-menu__hint">
              {hiddenCount} {t("menu.hidden")}
            </span>
          ) : null}
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
                <span
                  className="fe-checkbox"
                  data-state={visible ? "checked" : "unchecked"}
                  aria-hidden
                >
                  {visible ? <Check size={11} aria-hidden /> : null}
                </span>
                <span className="fe-menu__label">{column.label}</span>
              </DropdownMenu.CheckboxItem>
            );
          })}
          {onResetWidths ? (
            <>
              <DropdownMenu.Separator className="fe-menu__separator" />
              <DropdownMenu.Item className="fe-menu__item" onSelect={onResetWidths}>
                {t("menu.resetWidths")}
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
