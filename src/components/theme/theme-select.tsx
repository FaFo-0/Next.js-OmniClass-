"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Moon, Sun, Monitor } from "lucide-react";

const subscribe = () => () => {};

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const t = useTranslations("appearance");
  const value = hydrated && (theme === "light" || theme === "dark") ? theme : "system";
  const next = value === "light" ? "dark" : value === "dark" ? "system" : "light";
  const Icon = value === "light" ? Sun : value === "dark" ? Moon : Monitor;
  const label = t("cycle", { current: t(value), next: t(next) });

  return (
    <button
      type="button"
      className="theme-select"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
