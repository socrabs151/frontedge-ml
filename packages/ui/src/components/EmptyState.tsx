import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div className="fe-empty">
      {icon ? <div className="fe-empty__icon">{icon}</div> : null}
      <p className="fe-empty__title">{title}</p>
      {text ? <p className="fe-empty__text">{text}</p> : null}
      {action}
    </div>
  );
}
