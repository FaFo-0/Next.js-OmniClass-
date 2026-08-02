"use client";

// What time it is *for them*, wherever a person is named — profiles, rosters,
// People. The academy runs across Almaty, the Gulf and Damascus, so the answer
// to "can I message them now / does 6pm work" should never require arithmetic.
//
// One component so a teacher's time reads exactly like a student's, and a
// missing timezone looks like the fixable gap it is rather than a blank cell.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TimeFormat } from "@/lib/timeFormat";

function useTick(everyMs = 30_000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

export function formatInZone(now: Date, tz: string, fmt: TimeFormat) {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: fmt === "12h",
  }).format(now);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
  }).format(now);
  return { time, day };
}

export function PersonTime({
  tz,
  fmt,
  /** "their" on someone else's page, "your" on your own. */
  possessive = "their",
  /** Table cells want one quiet line; headers want the emphasised version. */
  size = "inline",
  /** Where to go to fix a missing timezone. Omit to stay silent about it. */
  fixHref,
}: {
  tz: string | null | undefined;
  fmt: TimeFormat;
  possessive?: "their" | "your";
  size?: "inline" | "header";
  fixHref?: string;
}) {
  const now = useTick();

  if (!tz) {
    if (!fixHref) {
      return (
        <span className="body-sm" style={{ color: "var(--omnic-gray-400)" }}>
          No timezone
        </span>
      );
    }
    return (
      <Link href={fixHref} className="body-sm" style={{ color: "#92400E" }}>
        No timezone — set it
      </Link>
    );
  }

  // Nothing until the first client tick: a server-rendered clock is a
  // hydration mismatch waiting to happen.
  if (!now) {
    return <span style={{ visibility: "hidden" }}>00:00</span>;
  }

  let time: string;
  let day: string;
  try {
    ({ time, day } = formatInZone(now, tz, fmt));
  } catch {
    return (
      <span className="body-sm" style={{ color: "var(--omnic-gray-400)" }}>
        Unknown timezone
      </span>
    );
  }

  return (
    <span
      title={tz}
      style={{ display: "inline-flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}
    >
      <strong
        style={{
          fontVariantNumeric: "tabular-nums",
          fontSize: size === "header" ? 15 : undefined,
        }}
      >
        {time}
      </strong>
      <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
        {day} · {possessive} time
      </span>
    </span>
  );
}

/** The academy's own wall clock — the zone every lesson is stored in. */
export function AcademyTime({ tz, fmt }: { tz: string | null | undefined; fmt: TimeFormat }) {
  const now = useTick();
  if (!tz || !now) return null;
  let time: string;
  try {
    ({ time } = formatInZone(now, tz, fmt));
  } catch {
    return null;
  }
  return (
    <span className="pill" style={{ fontSize: 11, whiteSpace: "nowrap" }} title={`Academy timezone: ${tz}`}>
      Academy <strong style={{ fontVariantNumeric: "tabular-nums" }}>{time}</strong> · {tz}
    </span>
  );
}
