"use client";
import { useState } from "react";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { newWorkbookItem, normalizeWorkbookSection, shuffled, workbookIssues, workbookResult, type WorkbookItem, type WorkbookSection } from "../../../convex/lib/workbook";

const field = "w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm";
const button = "rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40";
function lines(value: string) { return value.split("\n"); }
export function bulkItems(text: string, section: WorkbookSection): WorkbookItem[] {
  return text.split("\n").filter(line => line.trim()).map((line, index) => {
    const [prompt, answer = "", ...other] = line.split("|").map(s => s.trim());
    const item = newWorkbookItem(`${section.id}-${crypto.randomUUID()}-${index}`);
    if (section.kind === "ordering") return { ...item, prompt: "", accepted: [prompt], tokens: prompt.split(/\s+/) };
    return { ...item, prompt, accepted: answer ? [answer] : [], options: section.kind === "choice" ? [answer, ...other].filter(Boolean) : [] };
  });
}
export function WorkbookSectionView({ node, updateAttributes, editor, getPos, deleteNode }: ReactNodeViewProps) {
  const t = useTranslations("components.homework.workbook");
  const section = normalizeWorkbookSection(node.attrs);
  const mode = (editor.options.editorProps as unknown as { __omnic_mode: string }).__omnic_mode;
  const teacher = mode === "teacher", review = mode === "review", student = mode === "student";
  const [bulk, setBulk] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [selection, setSelection] = useState<{ id: string; from: number; to: number } | null>(null);
  if (!section) return <NodeViewWrapper>{t("invalid")}</NodeViewWrapper>;
  const set = (patch: Partial<WorkbookSection>) => updateAttributes(patch);
  const change = (id: string, patch: Partial<WorkbookItem>) => set({ items: section.items.map(q => q.id === id ? { ...q, ...patch } : q) });
  const moveItem = (index: number, delta: number) => {
    const items = [...section.items], target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]]; set({ items });
  };
  function moveSection(delta: number) {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const parent = editor.state.doc;
    let index = 0; parent.forEach((_n, offset, i) => { if (offset === pos) index = i; });
    const target = index + delta;
    if (target < 0 || target >= parent.childCount) return;
    const neighbor = parent.child(target);
    const insertAt = delta < 0 ? pos - neighbor.nodeSize : pos + neighbor.nodeSize;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize).insert(insertAt, node));
  }
  const issues = teacher ? workbookIssues(section) : [];
  const matchingOptions = shuffled([...new Set(section.items.flatMap(q => q.accepted.slice(0, 1).concat(q.options)))], section.id);
  // Sanitized matching nodes retain the public option bank on each item.
  const publicMatching = shuffled([...new Set(section.items.flatMap(q => q.options))], section.id);
  return <NodeViewWrapper as="section" contentEditable={false} className="my-4 min-w-0 space-y-3 break-words rounded-xl border bg-card p-4 not-prose" data-workbook-section={section.id}>
    {teacher ? <>
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Section title" className={`${field} flex-1`} value={section.title} onChange={e => set({ title: e.target.value })} />
        <button type="button" className={button} onClick={() => moveSection(-1)}>↑ Section</button>
        <button type="button" className={button} onClick={() => moveSection(1)}>↓ Section</button>
        <button type="button" className={button} onClick={() => {
          const id = crypto.randomUUID(); const pos = getPos();
          if (typeof pos === "number") editor.chain().insertContentAt(pos + node.nodeSize, { type: "workbookSection", attrs: { ...section, id, items: section.items.map(q => ({ ...q, id: crypto.randomUUID(), answer: "", mark: null, comment: "" })) } }).run();
        }}>Duplicate section</button>
        <button type="button" className={button} onClick={deleteNode}>Remove section</button>
        {(editor.options.editorProps as unknown as { __omnic_regenerate?: (s: WorkbookSection) => void }).__omnic_regenerate && <button type="button" className={button} onClick={() => (editor.options.editorProps as unknown as { __omnic_regenerate: (s: WorkbookSection) => void }).__omnic_regenerate(section)}>Generate replacement</button>}
      </div>
      <label className="block text-xs font-medium">Instructions<textarea className={field} value={section.instructions} onChange={e => set({ instructions: e.target.value })} placeholder="Tell the student exactly what to do" /></label>
      <label className="block text-xs font-medium">Worked example (optional)<input className={field} value={section.example} onChange={e => set({ example: e.target.value })} /></label>
      {(["reading", "dialogue", "gaps"].includes(section.kind)) && <label className="block text-xs font-medium">Passage / dialogue<textarea rows={5} className={field} value={section.passage} onChange={e => set({ passage: e.target.value })} /></label>}
      {["gaps", "dialogue"].includes(section.kind) && <label className="block text-xs font-medium">Word bank (optional)<input className={field} value={section.wordBank} onChange={e => set({ wordBank: e.target.value })} /></label>}
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={section.ignorePunctuation} onChange={e => set({ ignorePunctuation: e.target.checked })} /> Ignore sentence punctuation when grading (apostrophes still count)</label>
    </> : <>
      <h2 className="text-lg font-semibold">{section.title}</h2>
      <p className="whitespace-pre-wrap text-sm">{section.instructions}</p>
      {section.example && <p className="rounded-md bg-muted p-2 text-sm"><b>{t("example")}: </b>{section.example}</p>}
      {section.passage && <div className="whitespace-pre-wrap rounded-md border p-3 text-sm leading-relaxed" dir="ltr">{section.passage}</div>}
      {section.wordBank && <p className="rounded-md bg-muted p-2 text-sm"><b>{t("wordBank")}: </b>{section.wordBank}</p>}
    </>}
    <div className="space-y-4">
      {section.items.map((q, index) => {
        const result = workbookResult(q, section);
        const showResult = review || (mode === "readonly" && (q.accepted.length > 0 || q.mark !== null || !!q.modelAnswer || !!q.comment));
        return <div key={q.id} className="space-y-2 rounded-lg border p-3">
          {teacher ? <>
            <div className="flex flex-wrap items-center gap-2 text-xs"><b>Question {index + 1}</b>
              <button type="button" className={button} disabled={index === 0} onClick={() => moveItem(index, -1)}>↑</button>
              <button type="button" className={button} disabled={index === section.items.length - 1} onClick={() => moveItem(index, 1)}>↓</button>
              <button type="button" className={button} onClick={() => { const items = [...section.items]; items.splice(index + 1, 0, { ...q, id: crypto.randomUUID(), answer: "", mark: null, comment: "" }); set({ items }); }}>Duplicate</button>
              <button type="button" className={button} disabled={section.items.length === 1} onClick={() => set({ items: section.items.filter(item => item.id !== q.id) })}>Remove</button>
            </div>
            <label className="block text-xs">{section.kind === "ordering" ? "Prompt (optional — do not include the answer)" : "Question / sentence"}<textarea className={field} value={q.prompt} onSelect={e => { const input = e.currentTarget; setSelection({ id: q.id, from: input.selectionStart, to: input.selectionEnd }); }} onChange={e => change(q.id, { prompt: e.target.value })} placeholder={section.kind === "gaps" || section.kind === "dialogue" ? "She ___ to work every day. (go)" : "Write the question or sentence"} /></label>
            {["gaps", "dialogue"].includes(section.kind) && selection?.id === q.id && selection.to > selection.from && <button type="button" className={button} onClick={() => {
              change(q.id, { prompt: q.prompt.slice(0, selection.from) + "___" + q.prompt.slice(selection.to), accepted: [q.prompt.slice(selection.from, selection.to)] }); setSelection(null);
            }}>Turn selected text into a blank</button>}
            {section.kind === "ordering" ? <label className="block text-xs">Correct sentence<textarea className={field} value={q.accepted.join("\n")} onChange={e => change(q.id, { accepted: lines(e.target.value), tokens: e.target.value.split("\n")[0].trim().split(/\s+/) })} /></label> : <label className="block text-xs">{["writing", "short"].includes(section.kind) ? "Accepted answers (optional; leave empty for teacher review)" : "Accepted answers (one alternative per line; empty = teacher review)"}<textarea className={field} value={q.accepted.join("\n")} onChange={e => change(q.id, { accepted: e.target.value ? lines(e.target.value) : [] })} /></label>}
            {section.kind === "choice" && <label className="block text-xs">Options (one per line; accepted answer must match one option)<textarea className={field} value={q.options.join("\n")} onChange={e => change(q.id, { options: lines(e.target.value) })} /></label>}
            <details className="text-xs"><summary className="cursor-pointer">Explanation and model answer (shown after review)</summary>
              <label className="block">Explanation<textarea className={field} value={q.explanation} onChange={e => change(q.id, { explanation: e.target.value })} /></label>
              <label className="block">Model answer<textarea className={field} value={q.modelAnswer} onChange={e => change(q.id, { modelAnswer: e.target.value })} /></label>
            </details>
          </> : <>
            {section.kind === "gaps" && q.prompt.includes("___") ? <div className="whitespace-pre-wrap text-sm leading-loose" dir="ltr"><b>{index + 1}. </b>{q.prompt.slice(0, q.prompt.indexOf("___"))}<input className="mx-1 inline-block w-36 max-w-full rounded-md border bg-background px-2 py-1 text-sm" aria-label={t("answerNumber", { number: index + 1 })} value={q.answer} readOnly={!student} onChange={e => change(q.id, { answer: e.target.value })} />{q.prompt.slice(q.prompt.indexOf("___") + 3)}</div> : <p className="whitespace-pre-wrap text-sm" dir="ltr"><b>{index + 1}. </b>{q.prompt || t("orderWords")}</p>}
            {section.kind === "gaps" && q.prompt.includes("___") ? null : section.kind === "choice" ? <div className="space-y-2">{q.options.map((option, i) => <label key={i} className="flex items-start gap-2 rounded-md border p-2 text-sm"><input type="radio" name={`${section.id}-${q.id}`} checked={q.answer === option} disabled={!student} onChange={() => change(q.id, { answer: option })} /><span dir="ltr">{option}</span></label>)}</div>
            : section.kind === "matching" ? <select className={field} aria-label={t("answerNumber", { number: index + 1 })} value={q.answer} disabled={!student} onChange={e => change(q.id, { answer: e.target.value })}><option value="">{t("chooseMatch")}</option>{(matchingOptions.length ? matchingOptions : publicMatching).map(option => <option key={option} value={option}>{option}</option>)}</select>
            : section.kind === "ordering" ? <Ordering item={q} disabled={!student} onChange={answer => change(q.id, { answer })} />
            : ["writing", "reading", "short", "rewrite", "correction", "dialogue"].includes(section.kind) ? <textarea rows={section.kind === "writing" ? 5 : 2} dir="ltr" className={field} aria-label={t("answerNumber", { number: index + 1 })} value={q.answer} readOnly={!student} onChange={e => change(q.id, { answer: e.target.value })} placeholder={t("answer")} />
            : <input dir="ltr" className={field} aria-label={t("answerNumber", { number: index + 1 })} value={q.answer} readOnly={!student} onChange={e => change(q.id, { answer: e.target.value })} placeholder={t("answer")} />}
          </>}
          {showResult && <div className="space-y-2 text-sm">
            <span className={`inline-block rounded-md px-2 py-1 ${result === "correct" ? "bg-[var(--status-active-bg)] text-[var(--feedback-success)]" : "bg-muted"}`}>{t(result)}</span>
            {review && <div className="flex flex-wrap gap-2">{(["correct", "partial", "incorrect"] as const).map(mark => <button type="button" className={button} aria-pressed={q.mark === mark} key={mark} onClick={() => change(q.id, { mark: q.mark === mark ? null : mark })}>{t(mark)} {q.mark === mark ? "✓" : ""}</button>)}<input className={field} aria-label={t("feedback")} placeholder={t("feedback")} value={q.comment} onChange={e => change(q.id, { comment: e.target.value })} /></div>}
            {q.accepted.length > 0 && <p><b>{t("accepted")}: </b>{q.accepted.join(" / ")}</p>}
            {q.modelAnswer && <p><b>{t("modelAnswer")}: </b>{q.modelAnswer}</p>}
            {q.explanation && <p>{q.explanation}</p>}
            {!review && q.comment && <p><b>{t("feedback")}: </b>{q.comment}</p>}
          </div>}
        </div>;
      })}
    </div>
    {teacher && <>
      <button type="button" className={button} disabled={section.items.length >= 40} onClick={() => set({ items: [...section.items, newWorkbookItem(crypto.randomUUID())] })}>+ Add question</button>
      <details className="text-xs"><summary className="cursor-pointer">Paste several questions</summary>
        <p className="my-2">One line per question: question | correct answer | other choice | other choice. For ordering, paste one complete sentence per line. Open questions can have no answer key.</p>
        <textarea aria-label="Bulk questions" className={field} rows={4} value={bulk} onChange={e => setBulk(e.target.value)} />
        <button type="button" className={button} disabled={!bulk.trim()} onClick={() => { const added = bulkItems(bulk, section); const existing = section.items.filter(q => q.prompt || q.accepted.length); set({ items: [...existing, ...added].slice(0, 40) }); setBulk(""); }}>Add pasted questions</button>
      </details>
      {issues.length > 0 && <details className="rounded-md bg-muted p-2 text-xs"><summary className="cursor-pointer">{issues.length} things to complete</summary><ul className="list-disc ps-4">{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></details>}
      <button type="button" className={button} onClick={() => setShowKey(!showKey)}>{showKey ? "Hide answer summary" : "Show answer summary"}</button>
      {showKey && <ol className="list-decimal ps-5 text-xs">{section.items.map(q => <li key={q.id}>{q.accepted.join(" / ") || "Teacher review"}</li>)}</ol>}
    </>}
  </NodeViewWrapper>;
}
function Ordering({ item, disabled, onChange }: { item: WorkbookItem; disabled: boolean; onChange: (answer: string) => void }) {
  const t = useTranslations("components.homework.workbook");
  const tokens = shuffled(item.tokens, item.id);
  const used = item.answer ? item.answer.split(/\s+/) : [];
  const remaining = [...tokens];
  for (const word of used) { const i = remaining.indexOf(word); if (i >= 0) remaining.splice(i, 1); }
  return <div className="space-y-2" dir="ltr">
    <div className="min-h-10 rounded-md border p-2 text-sm" aria-live="polite">{item.answer || t("tapWords")}</div>
    <div className="flex flex-wrap gap-2">{remaining.map((word, index) => <button type="button" key={index} disabled={disabled} className={button} onClick={() => onChange([...used, word].join(" "))}>{word}</button>)}</div>
    {!disabled && <div className="flex gap-2"><button type="button" className={button} onClick={() => onChange(used.slice(0, -1).join(" "))}>{t("undo")}</button><button type="button" className={button} onClick={() => onChange("")}>{t("reset")}</button></div>}
  </div>;
}
