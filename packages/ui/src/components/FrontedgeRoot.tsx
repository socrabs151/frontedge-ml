import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

export type FrontedgeTheme = "light" | "dark";
export type FrontedgeDensity = "compact" | "default" | "comfortable";

export interface FrontedgeRootProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  theme?: FrontedgeTheme;
  density?: FrontedgeDensity;
}

/**
 * The scope every screen expects: `.fe-root`, theme and density on one element.
 * A host can mount this instead of remembering the three attributes by hand.
 */
export function FrontedgeRoot({
  children,
  theme = "light",
  density = "default",
  className,
  ...rest
}: FrontedgeRootProps) {
  return (
    <div
      {...rest}
      className={clsx("fe-root", className)}
      data-theme={theme}
      data-density={density}
    >
      {children}
    </div>
  );
}
