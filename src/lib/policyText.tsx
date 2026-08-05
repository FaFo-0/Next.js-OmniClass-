"use client";

// POLICY verdicts come off the server as a finished English sentence plus the
// same sentence as a message key (`reasonKey` + `reasonValues`). Student-facing
// screens render the key so a consequence — "this lesson will be charged" —
// is read in the student's own language. The English `reason` stays the
// fallback, so an unmapped key degrades to a real sentence rather than a blank
// line or a key path.

import { useTranslations } from "next-intl";

export interface PolicyVerdictLike {
  reason?: string | null;
  reasonKey?: string | null;
  reasonValues?: Record<string, string | number> | null;
}

export function usePolicyText() {
  const t = useTranslations("app.policy");

  return (verdict: PolicyVerdictLike | null | undefined): string => {
    if (!verdict) return "";
    const key = verdict.reasonKey;
    if (!key) return verdict.reason ?? "";

    const values = { ...(verdict.reasonValues ?? {}) };
    // Lesson statuses are enum values, not prose — translate them before they
    // land inside a sentence.
    if (typeof values.status === "string") {
      const statusKey = `status.${values.status}`;
      const translated = t(statusKey);
      values.status = translated.endsWith(statusKey) ? values.status : translated;
    }

    const text = t(key, values as Record<string, string | number>);
    // next-intl echoes the path when a key is missing.
    return text.endsWith(key) ? (verdict.reason ?? "") : text;
  };
}
