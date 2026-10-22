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
  const value = hydrated ? theme ?? "system" : "system";
  const Icon = value === "light" ? Sun : value === "dark" ? Moon : Monitor;
  return (
    <label className="theme-select">
      <Icon size={18} aria-hidden="true" />
      <span className="sr-only">{t("label")}</span>
      <select
        value={value}
        onChange={(event) => setTheme(event.target.value)}
        aria-label={t("label")}
        title={`${t("label")}: ${t(value === "light" || value === "dark" ? value : "system")}`}
      >
        <option value="light">{t("light")}</option>
        <option value="dark">{t("dark")}</option>
        <option value="system">{t("system")}</option>
      </select>
    </label>
  );
}
