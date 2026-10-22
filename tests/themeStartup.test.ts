import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { ThemeProvider } from "../src/components/theme/theme-provider.tsx";

function firstPaint(pathname: string, stored: string | null, systemDark: boolean, storageBlocked = false) {
  const html = renderToStaticMarkup(createElement(PathnameContext.Provider, { value: pathname }, createElement(ThemeProvider, null, createElement("div", null, "Page"))));
  const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "The theme must be applied by an inline startup script before page paint");
  const classes = new Set(["notranslate"]);
  const style: Record<string, string> = {};
  const writes: string[] = [];
  runInNewContext(script, {
    document: { documentElement: { classList: { add: (value: string) => classes.add(value), remove: (...values: string[]) => values.forEach(value => classes.delete(value)) }, style } },
    localStorage: { getItem: (key: string) => { assert.equal(key, "omnica-appearance"); if (storageBlocked) throw new Error("Blocked storage"); return stored; }, setItem: (key: string) => writes.push(key) },
    window: { matchMedia: () => ({ matches: systemDark }) },
  });
  return { classes, style, writes };
}

test("saved appearance wins over the OS before first paint without removing existing root classes", () => {
  for (const [stored, systemDark] of [["dark", false], ["light", true]] as const) {
    const result = firstPaint("/student", stored, systemDark);
    assert.ok(result.classes.has(stored));
    assert.ok(result.classes.has("notranslate"));
    assert.equal(result.style.colorScheme, stored);
    assert.deepEqual(result.writes, []);
  }
});

test("new visitors and System preference follow the OS before first paint", () => {
  for (const stored of [null, "system"]) {
    for (const dark of [false, true]) {
      const result = firstPaint("/teacher", stored, dark);
      assert.ok(result.classes.has(dark ? "dark" : "light"));
    }
  }
});

test("public pages force light without overwriting saved portal appearance; auth and onboarding use it", () => {
  for (const pathname of ["/", "/privacy", "/terms"]) {
    const result = firstPaint(pathname, "dark", true);
    assert.ok(result.classes.has("light"));
    assert.deepEqual(result.writes, []);
  }
  for (const pathname of ["/admin", "/sign-in", "/sign-up", "/onboarding/student", "/onboarding/teacher", "/teacher/share/reading"]) {
    assert.ok(firstPaint(pathname, "dark", false).classes.has("dark"));
  }
});

test("blocked storage does not interrupt startup or erase existing root classes", () => {
  const result = firstPaint("/student", null, true, true);
  assert.ok(result.classes.has("notranslate"));
  assert.deepEqual(result.writes, []);
});
