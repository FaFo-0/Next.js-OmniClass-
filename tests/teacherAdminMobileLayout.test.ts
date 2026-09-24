import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (file: string) => readFileSync(file, "utf8");
const css = read("src/app/globals.css");
const sessions = read("src/app/teacher/sessions/page.tsx");
const detail = read("src/app/teacher/sessions/[id]/page.tsx");
const people = read("src/app/admin/people/page.tsx");

const mobileBreakpoint = css.indexOf("@media (max-width: 767px)");
const desktopCss = css.slice(0, mobileBreakpoint);
const mobileCss = css.slice(mobileBreakpoint);

test("teacher sessions preserve desktop padding and reset it on phones", () => {
  assert.doesNotMatch(sessions, /style=\{\{\s*padding:\s*["']28px 28px/);
  assert.match(sessions, /className="teacher-sessions-page"/);
  assert.match(desktopCss, /\.teacher-sessions-page\s*\{[^}]*padding:\s*28px/);
  assert.match(mobileCss, /\.teacher-sessions-page\s*\{[^}]*padding:\s*0/);
  assert.match(sessions, /className="teacher-sessions-header"/);
  assert.match(sessions, /className="teacher-session-event-main"/);
  assert.match(sessions, /className="teacher-session-event-actions"/);
  assert.match(mobileCss, /\.teacher-session-event-main\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(mobileCss, /\.teacher-session-event-actions\s*\{[^}]*flex-wrap:\s*wrap/);
});

test("session review keeps title, controls, tabs, and transcript usable at phone widths", () => {
  assert.match(detail, /className="session-review-page p-6 max-w-5xl mx-auto"/);
  assert.match(detail, /className="session-review-header\s/);
  assert.match(detail, /className="session-review-actions\s/);
  assert.match(detail, /className="session-tabs-list"/);
  assert.match(detail, /className="session-transcript-card/);
  assert.match(mobileCss, /\.session-review-header\s*\{[^}]*flex-direction:\s*column/);
  assert.match(mobileCss, /\.session-tabs-list\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
  assert.match(mobileCss, /\.session-tabs-list[^}]*white-space:\s*normal/);
  assert.match(mobileCss, /\.session-transcript-card\s+pre\s*\{[^}]*overflow-wrap:\s*anywhere/);
});

test("people tables keep the identity and action edges reachable on phones", () => {
  assert.match(people, /className="tabs people-tabs"/);
  assert.match(people, /className="tbl people-table people-table-students"/);
  assert.match(people, /className="tbl people-table people-table-instructors"/);
  assert.match(people, /className="tbl people-table people-table-admins"/);
  assert.match(people, /className="people-actions-cell/);
  assert.match(people, /Swipe to see more columns/);
  assert.match(mobileCss, /\.people-table\s+th:first-child/);
  assert.match(mobileCss, /\.people-actions-cell\s*\{[^}]*position:\s*sticky/);
  assert.match(mobileCss, /\.people-actions-cell\s*>\s*div\s*\{[^}]*flex-direction:\s*column/);
});
