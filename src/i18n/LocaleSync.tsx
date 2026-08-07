"use client";

// The language picker used to write to localStorage only, so a teacher who
// chose Arabic on their laptop got English on their phone — and the `locale`
// column their account already had was never filled in by anything.
//
// This sits under the Convex provider (LocaleProvider itself is mounted above
// it, so it can't query) and closes the loop in both directions: the saved
// locale wins on first load, and any later change is written back.

import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { useLocale } from "./provider";
import { locales, type Locale } from "./config";

export function LocaleSync() {
  const me = useQuery(api.users.getMe);
  const updateLocale = useMutation(api.users.updateLocale);
  const { locale, setLocale } = useLocale();
  const hydrated = useRef(false);

  // Pull once. After that the local pick is authoritative for the session,
  // otherwise a stale server value would fight the switcher on every render.
  useEffect(() => {
    if (hydrated.current || me === undefined) return;
    hydrated.current = true;
    const saved = me?.locale;
    if (saved && (locales as readonly string[]).includes(saved)) {
      if (saved !== locale) setLocale(saved as Locale);
    }
  }, [me, locale, setLocale]);

  // Push every later change.
  useEffect(() => {
    if (!hydrated.current || !me) return;
    if (me.locale === locale) return;
    updateLocale({ locale }).catch((err) => {
      console.warn("[locale] persist failed", err);
    });
  }, [locale, me, updateLocale]);

  return null;
}
