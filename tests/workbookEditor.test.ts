import test from "node:test";
import assert from "node:assert/strict";
import { createElement, act } from "react";
import { JSDOM } from "jsdom";
import { NextIntlClientProvider } from "next-intl";
import type { Editor } from "@tiptap/core";
import { HomeworkEditor, type HomeworkMode } from "../src/components/homework/HomeworkEditor";
import { newWorkbookSection } from "../convex/lib/workbook";
import { sanitizeForStudent, mergeStudentAnswers } from "../convex/homework";
import messages from "../messages/en.json";

test("real editor keeps matching and repeated ordering words through input, server echoes and reload", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://homework.test", pretendToBeVisual: true });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const match = newWorkbookSection("matching", "match"); match.instructions = "Match.";
  match.items[0] = { ...match.items[0], prompt: "walk", accepted: ["go on foot"] };
  const order = newWorkbookSection("ordering", "order"); order.instructions = "Order.";
  order.items[0] = { ...order.items[0], tokens: ["I", "very", "very", "much", "like", "tea."], accepted: ["I very very much like tea."] };
  const stored = { type: "doc", content: [match, order].map(attrs => ({ type: "workbookSection", attrs })) };
  let latest: unknown = null;
  let updates = 0;
  let mode: HomeworkMode = "student";
  const editorRef: { current: Editor | null } = { current: null };
  async function render(documentId: string, contentJson: unknown) {
    // eslint-disable-next-line react/no-children-prop -- The provider requires children.
    await act(async () => { root.render(createElement(NextIntlClientProvider, { locale: "en", messages, timeZone: "Asia/Almaty", children: createElement(HomeworkEditor, { documentId, contentJson, mode, editorRef, onChange: json => { updates++; latest = json; } }) })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  }
  try {
    await render("first", sanitizeForStudent(stored));
    const select = dom.window.document.querySelector("select")!;
    assert.ok(select, "Matching has a real student selection control");
    await act(async () => { select.value = "go on foot"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    const clickWord = async (word: string) => {
      const buttons = [...dom.window.document.querySelectorAll<HTMLButtonElement>('[data-workbook-section="order"] button')];
      const target = buttons.find(b => b.textContent === word); assert.ok(target, `Available token ${word}`);
      await act(async () => target.click());
    };
    for (const word of ["I", "very", "very", "much", "like", "tea."]) await clickWord(word);
    assert.ok(latest);
    // An old server echo must not replace answers inside native node-view controls.
    await render("first", sanitizeForStudent(stored));
    assert.equal(dom.window.document.querySelector("select")!.value, "go on foot");
    const saved = mergeStudentAnswers(stored, latest) as typeof stored;
    assert.equal(saved.content[1].attrs.items[0].answer, "I very very much like tea.");
    await render("reloaded", sanitizeForStudent(saved));
    assert.equal(dom.window.document.querySelector("select")!.value, "go on foot");
    assert.ok(dom.window.document.body.textContent?.includes("I very very much like tea."));
    assert.equal(dom.window.document.querySelectorAll('[data-workbook-section="order"] button').length, 2, "Only Undo and Reset remain after every token is used");
    mode = "teacher";
    await render("teacher", stored);
    const beforeIdleRender = updates;
    await render("teacher", stored);
    assert.equal(updates, beforeIdleRender, "Rendering or updating callbacks must not trigger autosaves");
    const section = dom.window.document.querySelector('[data-workbook-section="match"]')!;
    const duplicate = [...section.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Duplicate section");
    assert.ok(duplicate);
    await act(async () => duplicate.click());
    let authored = editorRef.current!.getJSON();
    const ids = authored.content!.filter(n => n.type === "workbookSection").map(n => n.attrs!.id);
    assert.equal(new Set(ids).size, 3, "Duplicating a section assigns fresh identities");
    const down = [...section.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "↓ Section");
    assert.ok(down);
    await act(async () => down.click());
    authored = editorRef.current!.getJSON();
    assert.equal(authored.content![1].attrs!.id, "match", "Section moves through the actual TipTap transaction");
    const beforeEcho = JSON.stringify(authored);
    await render("teacher", stored);
    assert.equal(JSON.stringify(editorRef.current!.getJSON()), beforeEcho, "A stale save echo cannot erase authored changes");
  } finally {
    await act(async () => root.unmount());
    await new Promise(resolve => setTimeout(resolve, 80));
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
