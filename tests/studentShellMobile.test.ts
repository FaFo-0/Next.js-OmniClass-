import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (file: string) => readFileSync(file, "utf8");

test("student mobile shell keeps lesson geometry and RTL drawer shadow logical", () => {
  const page = read("src/app/student/page.tsx");
  const css = read("src/app/globals.css");
  assert.match(page, /className="lesson-row-info"/);
  assert.match(css, /\.lesson-row-status\s*\{[^}]*margin-inline-start: 56px/);
  assert.match(css, /\[dir="rtl"\] \.sidebar\.sidebar-open\s*\{[^}]*box-shadow: -8px 0/);
});

test("student mobile copy does not expose the Space key label", () => {
  for (const locale of ["en", "ru", "ar", "kk"]) {
    const messages = read(`messages/${locale}.json`);
    assert.doesNotMatch(messages, /tap card[^\n]*Space|пробел|مسافة|бос орын пернесі/i);
  }
});

test("student Home navigation is exact while child routes remain active", () => {
  const sidebar = read("src/components/shared/OmnicSidebar.tsx");
  const bottom = read("src/components/shared/BottomNav.tsx");
  assert.match(sidebar, /isPortalHome[\s\S]*pathname === it\.href/);
  assert.match(bottom, /pathname === it\.href \|\| pathname\.startsWith\(it\.href \+ "\/"\)/);
});

test("student My Words is reached from Study instead of a duplicate shell destination", () => {
  const sidebarConfig = read("src/app/student/sidebar-config.ts");
  const study = read("src/app/student/study/page.tsx");
  assert.doesNotMatch(sidebarConfig, /href: "\/student\/vocabulary"/);
  assert.match(study, /href="\/student\/vocabulary"/);
});

test("phone contact copy keeps the field platform-neutral", () => {
  for (const locale of ["en", "ru", "ar", "kk"]) {
    const messages = read(`messages/${locale}.json`);
    assert.doesNotMatch(messages, /phoneHint[^\n]*(?:Prefer|Предпочтительно|يُفضّل|көрсеткен дұрыс)/i);
  }
});
