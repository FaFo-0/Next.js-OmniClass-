"use client";

// "5 hours 10 minutes until your lesson" — a countdown reads as an answer;
// a clock time makes the reader do the arithmetic themselves (and get it
// wrong across timezones). Used on both dashboards.

import { useEffect, useState } from "react";

/**
 * Human gap between now and an instant. Coarse on purpose: nobody needs
 * seconds, and a ticking seconds counter is a distraction on a dashboard.
 */
export function formatGap(ms: number, locale = "en"): string {
  const mins = Math.round(ms / 60000);
  if (mins <= 0) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "second");
  }

  const unit = (value: number, name: "minute" | "hour" | "day") =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: name,
      unitDisplay: "long",
    }).format(value);

  if (mins < 60) return unit(mins, "minute");

  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) {
    const h = unit(hours, "hour");
    return rem === 0 ? h : `${h} ${unit(rem, "minute")}`;
  }

  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  const d = unit(days, "day");
  return remH === 0 ? d : `${d} ${unit(remH, "hour")}`;
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
