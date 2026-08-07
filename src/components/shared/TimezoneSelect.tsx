"use client";

// A timezone is a fact about the user, not a string they should have to
// spell. This used to be a free-text input with a datalist: "Asia/Almaty"
// typed by hand, and a typo only surfaced as "Unknown timezone" from the
// server at the end of a wizard. A select can't be wrong.

import { useMemo } from "react";
import { allTimezones, tzLabel, TZ_SUGGESTIONS } from "@/lib/tz";

export function TimezoneSelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (tz: string) => void;
  id?: string;
}) {
  // Recomputed only when the chosen zone changes: `value` may be a zone the
  // runtime doesn't list (a legacy alias on an older row), and dropping it
  // from the options would silently reassign the user's timezone on save.
  const options = useMemo(() => {
    const all = allTimezones();
    return all.includes(value) || !value ? all : [value, ...all];
  }, [value]);

  const suggested = options.filter((tz) => TZ_SUGGESTIONS.includes(tz));
  const rest = options.filter((tz) => !TZ_SUGGESTIONS.includes(tz));

  return (
    <select
      id={id}
      className="select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%" }}
    >
      {suggested.length > 0 && (
        <optgroup label="Common here">
          {suggested.map((tz) => (
            <option key={tz} value={tz}>
              {tzLabel(tz)}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="All timezones">
        {rest.map((tz) => (
          <option key={tz} value={tz}>
            {tzLabel(tz)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
