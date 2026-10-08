import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { SlotCalendar, type SlotCalendarProps } from "../src/components/calendar/SlotCalendar";
import { projectCalendarSlots } from "../src/lib/calendarSlots";
import { calendarToday, calendarRange } from "../src/components/calendar/calendarShared";
import { CalendarAgenda } from "../src/components/calendar/CalendarAgenda";
import messages from "../messages/en.json";

function renderCalendar(props: Partial<SlotCalendarProps>) {
  const calendar = createElement(SlotCalendar, {
    cells: [], events: [], users: [], currentDate: new Date("2026-10-08T12:00:00Z"), viewerTz: "Asia/Almaty",
    onPrevWeek() {}, onNextWeek() {}, onToday() {}, ...props,
  });
  // eslint-disable-next-line react/no-children-prop -- The provider's createElement props type requires children.
  return renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Almaty", children: calendar,
  }));
}

test("expired availability is visibly locked even before a stale server flag refreshes; future slots stay editable", (t) => {
  t.mock.method(Date, "now", () => Date.parse("2026-10-08T08:00:00Z"));
  const cells = projectCalendarSlots([
    ...["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"].map((date) => ({ date, startTime: "02:00" })),
    { date: "2026-10-08", startTime: "16:00" },
  ].map((slot) => ({ ...slot, open: true, editable: true })), "Asia/Almaty", "Asia/Almaty");
  const html = renderCalendar({ cells, staffPaint: true, onPaint() {} });
  const buttons = [...html.matchAll(/<button\b[^>]*data-calendar-cell="[^"]*"[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
  assert.equal(buttons.length, 5);
  for (const button of buttons.slice(0, 4)) {
    assert.match(button, /data-past="true"/);
    assert.match(button, /repeating-linear-gradient/);
    assert.match(button, /cursor-not-allowed/);
    assert.match(button, /aria-disabled="true"/);
    assert.match(button, /tabindex="-1"/);
    assert.match(button, /Past · locked/);
    assert.match(button, /Past slots cannot be edited/);
    assert.doesNotMatch(button, /bg-emerald|hover:bg/);
    assert.equal(button.slice(button.indexOf(">") + 1, button.lastIndexOf("</button>")), "", "Past cells keep accessible labels and tooltips without repeated visible warnings");
  }
  assert.match(buttons[4], /bg-emerald/);
  assert.match(buttons[4], /aria-disabled="false"/);
  assert.doesNotMatch(buttons[4], /data-past/);
});

test("a today-starting week renders seven days through Sunday and fetches the same buffered period", () => {
  const today = calendarToday("Asia/Almaty", new Date("2026-10-07T22:30:00Z"));
  assert.equal(today.getDate(), 8);
  assert.equal(today.getDay(), 4);
  const html = renderCalendar({ currentDate: today, weekStartsOn: 4, onWeekStartChange() {} });
  const dates = [...html.matchAll(/data-slot-column="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(dates, ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"]);
  assert.deepEqual(calendarRange("week", today, 4), { fromDate: "2026-10-07", toDate: "2026-10-15" });
  assert.match(html, /aria-label="Week starts"/);
  assert.match(html, /value="today" selected="">Today \(Auto\)/);
  assert.deepEqual(calendarRange("week", today, 1), { fromDate: "2026-10-04", toDate: "2026-10-12" });
  assert.equal(calendarToday("America/Los_Angeles", new Date("2026-10-07T22:30:00Z")).getDate(), 7);
});

test("week navigation keeps its chosen weekday across year boundaries and day view ignores the week preference", () => {
  const date = calendarToday("Pacific/Auckland", new Date("2026-12-31T12:30:00Z"));
  const html = renderCalendar({ currentDate: date, weekStartsOn: 5 });
  const dates = [...html.matchAll(/data-slot-column="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(dates, ["2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"]);
  assert.deepEqual(calendarRange("week", date, 5), { fromDate: "2026-12-31", toDate: "2027-01-08" });
  const day = renderCalendar({ currentDate: date, mode: "day", weekStartsOn: 1, onWeekStartChange() {} });
  assert.match(day, /data-slot-column="2027-01-01"/);
  assert.doesNotMatch(day, /aria-label="Week starts"/);
});

test("the admin agenda excludes timezone fetch buffers from a today-starting week", () => {
  const events = ["2026-10-07", "2026-10-08", "2026-10-14", "2026-10-15"].map((date) => ({
    _id: date, date, startTime: "16:00", endTime: "17:00", title: date, status: "scheduled", createdAt: "2026-10-01T00:00:00Z",
  }));
  const agenda = createElement(CalendarAgenda, { events, fromDate: "2026-10-08", toDate: "2026-10-14" });
  // eslint-disable-next-line react/no-children-prop -- The provider's createElement props type requires children.
  const html = renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Almaty", children: agenda,
  }));
  assert.match(html, /agenda-2026-10-08/);
  assert.match(html, /agenda-2026-10-14/);
  assert.doesNotMatch(html, /2026-10-07|2026-10-15/);
});

test("the rendered calendar has two continuous half-hour cells per hour, with no card gutters", () => {
  const cells = projectCalendarSlots(["16:00", "16:30", "17:00", "17:30"].map((startTime) => ({
    date: "2099-01-05", startTime, open: true, editable: true,
  })), "Asia/Almaty", "Asia/Almaty");
  const calendar = createElement(SlotCalendar, {
      cells, events: [], users: [], mode: "day", staffPaint: true,
      currentDate: new Date("2099-01-05T12:00:00Z"), viewerTz: "Asia/Almaty",
      onPrevWeek() {}, onNextWeek() {}, onToday() {}, onPaint() {},
    });
  // eslint-disable-next-line react/no-children-prop -- The provider's createElement props type requires children.
  const html = renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Almaty",
    children: calendar,
  }));
  const buttons = [...html.matchAll(/<button\b[^>]*data-calendar-cell="[^"]*"[^>]*>/g)].map(([button]) => button);
  assert.equal(buttons.length, 4);
  buttons.forEach((button, index) => {
    assert.match(button, new RegExp(`top:${index === 0 ? "0" : `${index * 36}px`};height:36px;inset-inline-start:0;inset-inline-end:0`));
    assert.doesNotMatch(button, /rounded|shadow/);
    assert.match(button, index % 2 ? /border-dashed/ : /border-border/);
  });
  assert.match(html, /data-hour="16:00"/);
  assert.match(html, /data-hour="17:00"/);
});
