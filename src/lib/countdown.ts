"use client";

// "5 hours 10 minutes until your lesson" — a countdown reads as an answer;
// a clock time makes the reader do the arithmetic themselves (and get it
// wrong across timezones). Used on both dashboards.

import { useEffect, useState } from "react";

/**
 * Human gap between now and an instant. Coarse on purpose: nobody needs
 * seconds, and a ticking seconds counter is a distraction on a dashboard.
 */
export function formatGap(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;

  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) {
    const h = `${hours} hour${hours === 1 ? "" : "s"}`;
    return rem === 0 ? h : `${h} ${rem} minute${rem === 1 ? "" : "s"}`;
  }

  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  const d = `${days} day${days === 1 ? "" : "s"}`;
  return remH === 0 ? d : `${d} ${remH} hour${remH === 1 ? "" : "s"}`;
}

/**
 * Milliseconds until `target`, re-rendering every 30s so the number stays
 * honest without spinning the CPU. Returns null when there's no target.
 */
export function useTimeUntil(target: Date | number | null | undefined): number | null {
  const targetMs =
    target == null ? null : target instanceof Date ? target.getTime() : target;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (targetMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [targetMs]);

  if (targetMs == null) return null;
  return targetMs - now;
}
