"use client";
import { useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { toast } from "sonner";
import { HomeworkEditor } from "./HomeworkEditor";
import { EXERCISE_TYPES, EXERCISE_LABELS, newWorkbookSection, type ExerciseType, type WorkbookSection } from "../../../convex/lib/workbook";
import type { HomeworkDoc } from "../../../convex/lib/homeworkOutput";

const field = "w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm";
const btn = "rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-40";
type Props = { homeworkId: Id<"homework">; lessonId: Id<"lessons">; contentJson: unknown; transcript: string; onChange: (doc: unknown) => void };
export function HomeworkBuilder({ homeworkId, lessonId, contentJson, transcript, onChange }: Props) {
  const editorRef = useRef<Editor | null>(null);
  const context = useQuery(api.homeworkAi.workbookContext, { homeworkId });
  const generate = useAction(api.homeworkAi.generateWorkbookDraft);
  const [targetSection, setTargetSection] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [source, setSource] = useState<"lesson" | "paste" | "topic">("lesson");
  const [mode, setMode] = useState<"practice" | "convert">("practice");
  const [sourceText, setSourceText] = useState("");
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const [levelOverride, setLevel] = useState<string | null>(null);
  const level = levelOverride ?? context?.level ?? "";
  const [objective, setObjective] = useState("");
  const [vocabulary, setVocabulary] = useState("");
  const [instructions, setInstructions] = useState("");
  const [kinds, setKinds] = useState<ExerciseType[]>(["gaps"]);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<HomeworkDoc | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [draftVersion, setDraftVersion] = useState(0);
  const [replace, setReplace] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [studentPreview, setStudentPreview] = useState(false);
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  function add(kind: ExerciseType) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus("end").insertContent({ type: "workbookSection", attrs: newWorkbookSection(kind, crypto.randomUUID()) }).run();
  }
  async function generateDraft() {
    setBusy(true); setWarnings([]); setDraft(null);
    try {
      const result = await generate({ homeworkId, lessonId, source, sourceText: sourceText || undefined, includeTranscript, mode, kinds: mode === "convert" ? [...EXERCISE_TYPES] : kinds, count, level: level || undefined, objective, vocabulary, instructions });
      setDraft(result.doc); setWarnings(result.warnings); setDraftVersion(v => v + 1); setPreview(false); setConfirmReplace(false);
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  }
  function insertDraft() {
    const editor = editorRef.current;
    if (!editor || !draft) return;
    // Read the current live editor only at insertion time: provider latency never rewinds edits.
    if (targetSection) {
      let position: number | null = null, size = 0;
      editor.state.doc.forEach((node, offset) => { if (node.type.name === "workbookSection" && node.attrs.id === targetSection) { position = offset; size = node.nodeSize; } });
      if (position === null) { toast.error("The original section was removed. Generate a new draft to add instead."); return; }
      editor.chain().deleteRange({ from: position, to: position + size }).insertContentAt(position, draft.content as never).run();
    } else if (replace) editor.commands.setContent(draft as never);
    else editor.chain().focus("end").insertContent(draft.content as never).run();
    setDraft(null); setTargetSection(null); setConfirmReplace(false); setReplace(false);
  }
  function showPreview() {
    setSnapshot(editorRef.current?.getJSON() ?? contentJson); setPreviewVersion(v => v + 1); setStudentPreview(!studentPreview);
  }
  return <div className="min-w-0 space-y-4">
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Build homework</h3><p className="text-xs text-muted-foreground">Choose an exercise, write it yourself, or generate an editable draft.</p></div><button type="button" className={btn} onClick={showPreview}>{studentPreview ? "Close student preview" : "Preview as student"}</button></div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{EXERCISE_TYPES.map(kind => <div key={kind} className="rounded-lg border p-3"><p className="text-sm font-medium">{EXERCISE_LABELS[kind]}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className={btn} onClick={() => add(kind)}>Write myself</button><button type="button" className={btn} onClick={() => { setTargetSection(null); setKinds([kind]); setPanel(true); setMode("practice"); }}>Generate with AI</button></div></div>)}</div>
      <div className="flex flex-wrap gap-2"><button type="button" className={btn} onClick={() => { setTargetSection(null); setPanel(!panel); setMode("practice"); }}>Generate a worksheet</button><button type="button" className={btn} onClick={() => { setTargetSection(null); setPanel(true); setSource("paste"); setMode("convert"); }}>Convert workbook text</button></div>
    </div>
    {panel && <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-semibold">{mode === "convert" ? "Convert the original exercise" : "Create similar practice"}</h3><button type="button" className={btn} onClick={() => setPanel(false)}>Close</button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Source<select className={field} value={source} disabled={mode === "convert" || busy} onChange={e => setSource(e.target.value as typeof source)}><option value="lesson">Lesson transcript</option><option value="paste">Pasted workbook / passage</option><option value="topic">My topic / objective</option></select></label>
        <label className="text-xs">Student level<select className={field} value={level} onChange={e => setLevel(e.target.value)}><option value="">Choose level</option>{["A1", "A2", "B1", "B2", "C1", "C2"].map(l => <option key={l}>{l}</option>)}</select></label>
      </div>
      {source === "paste" && <><label className="block text-xs">Original text<textarea rows={6} className={field} value={sourceText} maxLength={12000} onChange={e => setSourceText(e.target.value)} placeholder="Paste the instructions, passage and exercise questions. Include the answer key if available." /></label><p className="text-xs text-muted-foreground">{sourceText.length.toLocaleString()} / 12,000 characters. Paste text here; PDF, images and listening tracks are not imported.</p><div className="flex flex-wrap gap-2"><button type="button" className={btn} aria-pressed={mode === "convert"} onClick={() => setMode("convert")}>Convert this exercise</button><button type="button" className={btn} aria-pressed={mode === "practice"} onClick={() => setMode("practice")}>Create similar practice</button></div>{mode === "practice" && <label className="flex gap-2 text-xs"><input type="checkbox" checked={includeTranscript} onChange={e => setIncludeTranscript(e.target.checked)} /> Also use the lesson transcript</label>}</>}
      {source === "lesson" && !transcript.trim() && <p className="text-sm">This lesson has no transcript. Choose pasted material or a topic.</p>}
      <label className="block text-xs">Language objective / topic<input className={field} maxLength={2000} value={objective} onChange={e => setObjective(e.target.value)} placeholder="For example: past-simple questions about everyday activities" /></label>
      {mode === "practice" && <><fieldset><legend className="text-xs">Exercise types</legend><div className="mt-2 flex flex-wrap gap-3">{EXERCISE_TYPES.map(kind => <label key={kind} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={kinds.includes(kind)} onChange={e => setKinds(e.target.checked ? [...kinds, kind] : kinds.filter(k => k !== kind))} />{EXERCISE_LABELS[kind]}</label>)}</div></fieldset><label className="block text-xs">Questions per section (up to 30 total)<input type="number" min={1} max={15} className={field} value={count} onChange={e => setCount(Number(e.target.value))} /></label></>}
      <label className="block text-xs">Target vocabulary (optional)<input className={field} maxLength={2000} value={vocabulary} onChange={e => setVocabulary(e.target.value)} /></label>
      <label className="block text-xs">Teacher instructions (optional)<textarea className={field} maxLength={2000} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="For example: include negatives; avoid irregular verbs; writing should be 60–80 words" /></label>
      <button type="button" className="btn btn-tenant" disabled={busy || !level || (mode === "practice" && (!kinds.length || kinds.length * count > 30)) || (source === "lesson" && !transcript.trim()) || (source === "paste" && !sourceText.trim()) || (source === "topic" && !objective.trim())} onClick={generateDraft}>{busy ? "Generating draft…" : "Generate preview"}</button>
      <p className="text-xs text-muted-foreground">The result opens below for review. Generating does not change your worksheet.</p>
    </div>}
    {warnings.length > 0 && <div className="rounded-lg border p-3 text-sm"><b>Source notes</b><ul className="list-disc ps-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
    {draft && <div className="rounded-xl border-2 border-[var(--brand-purple)] p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2"><b>AI draft — review before inserting</b><button type="button" className={btn} onClick={() => setPreview(!preview)}>{preview ? "Edit draft" : "Student view"}</button><button type="button" className={btn} onClick={generateDraft} disabled={busy}>Regenerate this draft</button><button type="button" className={btn} onClick={() => setDraft(null)}>Discard</button></div>
      <HomeworkEditor documentId={`draft-${draftVersion}`} contentJson={draft} mode={preview ? "student" : "teacher"} onChange={preview ? undefined : doc => setDraft(doc as HomeworkDoc)} />
      {!targetSection && <label className="flex gap-2 text-xs"><input type="checkbox" checked={replace} onChange={e => { setReplace(e.target.checked); setConfirmReplace(false); }} /> Replace the whole worksheet instead of adding sections</label>}
      {!targetSection && replace && <label className="flex gap-2 text-xs"><input type="checkbox" checked={confirmReplace} onChange={e => setConfirmReplace(e.target.checked)} /> Replace my current worksheet with this reviewed draft</label>}
      <button type="button" className="btn btn-tenant" disabled={!targetSection && replace && !confirmReplace} onClick={insertDraft}>{targetSection ? "Replace selected section" : replace ? "Replace worksheet" : "Add to worksheet"}</button>
    </div>}
    {studentPreview && <div className="rounded-xl border p-3 space-y-2"><b>Student preview — responses here are not saved</b><HomeworkEditor documentId={`preview-${previewVersion}`} contentJson={snapshot} mode="student" /></div>}
    <HomeworkEditor editorRef={editorRef} documentId={homeworkId} contentJson={contentJson} mode="teacher" onChange={onChange} onRegenerateSection={(section: WorkbookSection) => {
      setTargetSection(section.id); setKinds([section.kind]); setCount(Math.min(section.items.length, 15)); setInstructions(section.instructions); setObjective(section.title); setPanel(true); setMode("practice"); setDraft(null);
    }} />
  </div>;
}
