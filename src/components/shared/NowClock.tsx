"use client";

// The time it is right now, in the viewer's own timezone, on every page of
// every portal. Lessons are the product and they all happen at a time, so
// "what time is it for me" should never need a second glance at the OS clock.

import { useEffect, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { browserTz } from "@/lib/tz";

export function NowClock() {
  const me = useQuery(api.users.getMe);
  const [now, setNow] = useState<Date | null>(null);

  // Mount-only start: rendering a clock during SSR guarantees a hydration
  // mismatch, so the slot stays empty for the first frame.
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const tz = me?.timezone || browserTz();
  const hour12 = (me?.timeFormat ?? "24h") === "12h";
  let time = "";
  let day = "";
  try {
    time = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12,
    }).format(now);
    day = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(now);
  } catch {
    return null; // unknown timezone — better nothing than a wrong time
  }

  return (
    <div
      title={tz}
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.05 }}
    >
      <span
        style={{
          fontSize: 22,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: "var(--omnic-gray-900)",
        }}
      >
        {time}
      </span>
      <span className="body-sm" style={{ fontSize: 11, color: "var(--omnic-gray-500)" }}>
        {day}
      </span>
    </div>
  );
}
