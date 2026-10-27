import assert from "node:assert/strict";
import test from "node:test";
import { createElement, act } from "react";
import { JSDOM } from "jsdom";
import { NextIntlClientProvider } from "next-intl";
import { SlotCalendar, type SlotCalendarProps } from "../src/components/calendar/SlotCalendar";
import { projectCalendarSlots, type CalendarSlot } from "../src/lib/calendarSlots";
import messages from "../messages/en.json";

// DOM event tests only: no browser, server, authentication or tenant writes.
test("painting survives refresh and capture loss, commits up/down drags once, and suppresses the following click", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://calendar.test" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  let captured: HTMLElement | null = null;
  Object.defineProperty(dom.window.HTMLElement.prototype, "setPointerCapture", { value(this: HTMLElement) {
    captured = dom.window.document.querySelector<HTMLElement>(".overflow-x-auto");
    assert.equal(this, captured, "Pointer capture belongs to the stable grid");
  } });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const saves: { slots: CalendarSlot[]; open: boolean }[] = [];
  const base = { cells: projectCalendarSlots(["16:00", "16:30", "17:00", "17:30"].map(startTime => ({
    date: "2099-01-05", startTime, open: false, editable: true,
    expectedState: JSON.stringify({ override: { value: null }, inherited: [] }),
  })), "Asia/Almaty", "Asia/Almaty"), events: [], users: [],
    currentDate: new Date("2099-01-05T12:00:00Z"), mode: "day" as const,
    viewerTz: "Asia/Almaty", onPrevWeek() {}, onNextWeek() {}, onToday() {},
    staffPaint: true, onPaint(slots: CalendarSlot[], open: boolean) { saves.push({ slots, open }); },
  };
  const render = async (extra: Partial<SlotCalendarProps> = {}) => {
    // eslint-disable-next-line react/no-children-prop -- The provider's props require children.
    await act(async () => { root.render(createElement(NextIntlClientProvider, {
      locale: "en", messages, timeZone: "Asia/Almaty", now: new Date("2026-10-27T00:00:00Z"),
      children: createElement(SlotCalendar, { ...base, ...extra }),
    })); });
  };
  const cell = (index: number) => dom.window.document.querySelectorAll<HTMLElement>("[data-calendar-cell]")[index];
  Object.defineProperty(dom.window.document, "elementsFromPoint", { value: (_x: number, y: number) => [cell(Math.max(0, Math.min(3, Math.floor(y / 40))))] });
  const pointer = async (target: Element, type: string, index: number) => {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 100, clientY: index * 40 + 5, button: 0 });
    Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: "mouse" } });
    await act(async () => { target.dispatchEvent(event); });
  };
  try {
    await render();
    await pointer(cell(0), "pointerdown", 0);
    await pointer(captured!, "pointermove", 3);
    // The minute-tick subscription briefly disables the mounted calendar.
    await render({ disabled: true });
    await pointer(captured!, "pointerup", 3);
    assert.equal(saves.length, 1, "A refresh must not erase a completed gesture");
    assert.equal(saves[0].slots.length, 4);
    assert.equal(saves[0].open, true);
    // Some synthesized clicks have detail=0. They still must not toggle again.
    await act(async () => { cell(0).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, detail: 0 })); });
    assert.equal(saves.length, 1);

    await render({ cells: base.cells.map(slot => ({ ...slot, open: true })) });
    await pointer(cell(3), "pointerdown", 3);
    await pointer(captured!, "pointermove", 0);
    await pointer(captured!, "pointerup", 0);
    assert.equal(saves.length, 2);
    assert.equal(saves[1].slots.length, 4);
    assert.equal(saves[1].open, false);
    await pointer(captured!, "lostpointercapture", 0);
    assert.equal(saves.length, 2, "Releasing capture after pointerup must not save twice");

    await render();
    await pointer(cell(0), "pointerdown", 0);
    await pointer(captured!, "pointermove", 2);
    await pointer(captured!, "lostpointercapture", 2);
    assert.equal(saves.length, 3, "Losing capture must retain the painted selection");
    assert.equal(saves[2].slots.length, 3);

    await pointer(cell(0), "pointerdown", 0);
    await pointer(captured!, "pointermove", 3);
    await pointer(captured!, "pointercancel", 3);
    await pointer(captured!, "lostpointercapture", 3);
    assert.equal(saves.length, 3, "A real browser cancellation must not save");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
