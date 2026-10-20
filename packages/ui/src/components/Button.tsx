import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "fe-btn",
        `fe-btn--${variant}`,
        size === "sm" && "fe-btn--sm",
        className,
      )}
      {...rest}
    >
      {icon ? <span className="fe-btn__icon">{icon}</span> : null}
      {children}
    </button>
  );
}
