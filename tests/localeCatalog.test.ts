import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { locales } from "../src/i18n/config.ts";
import {
  NOTIFICATION_KINDS,
  notificationViewForLocale,
} from "../convex/lib/notificationRegistry.ts";

function load(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "messages", `${locale}.json`), "utf8")
  ) as Record<string, unknown>;
}

function flatten(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      for (const [path, leaf] of flatten(child, prefix ? `${prefix}.${key}` : key)) {
        out.set(path, leaf);
      }
    }
  } else if (typeof value === "string") {
    out.set(prefix, value);
  }
  return out;
}

test("all four locale catalogues have exact key parity and no raw message keys", () => {
  const english = flatten(load("en"));
  for (const locale of locales) {
    const current = flatten(load(locale));
    assert.deepEqual([...current.keys()].sort(), [...english.keys()].sort(), locale);
    for (const [key, value] of current) {
      assert.notEqual(value, key, `${locale} contains raw key ${key}`);
      assert.notEqual(value, `messages.${key}`, `${locale} contains raw key ${key}`);
    }
  }
});

test("Kazakh calendar and notification locale contracts are available", () => {
  const notification = notificationViewForLocale(
    "lesson_assigned",
    { date: "2026-09-08", startTime: "10:00" },
    "kk"
  );
  assert.match(notification.title, /Сабақ/);
  assert.ok(notification.body.length > 0);
  assert.equal(locales.includes("kk"), true);
  assert.equal(NOTIFICATION_KINDS.length > 0, true);
});
