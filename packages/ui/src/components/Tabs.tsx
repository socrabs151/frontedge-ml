import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

export interface TabItem {
  value: string;
  label: string;
  count?: number;
  content: ReactNode;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
}

export function Tabs({ items, value, onValueChange, ariaLabel }: TabsProps) {
  const active = items.find((item) => item.value === value) ?? items[0];
  return (
    <TabsPrimitive.Root
      value={active?.value}
      onValueChange={onValueChange}
      className="fe-tabs"
    >
      <TabsPrimitive.List className="fe-tabs__list" aria-label={ariaLabel}>
        {items.map((item) => (
          <TabsPrimitive.Trigger key={item.value} value={item.value} className="fe-tabs__trigger">
            {item.label}
            {item.count !== undefined ? (
              <span className="fe-tabs__count">{item.count}</span>
            ) : null}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content key={item.value} value={item.value} className="fe-tabs__panel">
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
