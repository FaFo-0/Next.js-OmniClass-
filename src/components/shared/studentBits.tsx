"use client";

// Small student-facing display bits shared by the roster and the detail page.

import { useEffect, useState } from "react";
import type { TimeFormat } from "@/lib/timeFormat";

/**
 * Flag emoji from a country. Accepts an ISO-2 code ("KZ") or a country name
 * ("Kazakhstan") since onboarding stores whichever the student typed.
 * Returns "" when it can't tell, so the UI just omits the flag.
 */
const COUNTRY_CODES: Record<string, string> = {
  kazakhstan: "KZ", russia: "RU", "saudi arabia": "SA", saudi: "SA",
  egypt: "EG", syria: "SY", uae: "AE", "united arab emirates": "AE",
  turkey: "TR", uzbekistan: "UZ", kyrgyzstan: "KG", ukraine: "UA",
  jordan: "JO", qatar: "QA", kuwait: "KW", bahrain: "BH", oman: "OM",
  iraq: "IQ", lebanon: "LB", morocco: "MA", algeria: "DZ", tunisia: "TN",
  belarus: "BY", azerbaijan: "AZ", georgia: "GE", tajikistan: "TJ",
  turkmenistan: "TM", "united states": "US", uk: "GB",
  "united kingdom": "GB", germany: "DE", france: "FR", spain: "ES",
};

export function flagEmoji(country: string | null | undefined): string {
  if (!country) return "";
  const raw = country.trim();
  const code =
    raw.length === 2 ? raw.toUpperCase() : COUNTRY_CODES[raw.toLowerCase()];
  if (!code || !/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(
    ...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

/**
 * The student's wall clock, ticking — so a teacher never has to do the
 * timezone maths before messaging or scheduling.
 */
export function LocalClock({
  tz,
  fmt,
  compact = false,
}: {
  tz: string;
  fmt: TimeFormat;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  let time = "";
  let day = "";
  try {
    time = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: fmt === "12h",
    }).format(now);
    day = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      weekday: "short",
    }).format(now);
  } catch {
    return null;
  }

  if (compact) {
    return (
      <span title={`Local time in ${tz}`} style={{ fontVariantNumeric: "tabular-nums" }}>
        🕒 {time}
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
      <strong style={{ fontVariantNumeric: "tabular-nums" }}>{time}</strong>
      <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
        {day} · their time
      </span>
    </span>
  );
}
