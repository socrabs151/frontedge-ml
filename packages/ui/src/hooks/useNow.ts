import { useEffect, useState } from "react";

/**
 * A ticking clock for relative times ("5 min ago"). A frozen `Date.now()` passed once
 * never updates; this hook re-renders the caller on an interval instead.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
