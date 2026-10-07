import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { SlotCalendar } from "../src/components/calendar/SlotCalendar";
import { projectCalendarSlots } from "../src/lib/calendarSlots";
import messages from "../messages/en.json";

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
