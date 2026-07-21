"use client";

// Homework editor. One TipTap surface, four modes:
//   teacher   — author prose + exercises (fill-blank, multiple choice, open answer)
//   student   — read the prose, fill the exercises
//   review    — teacher sees each answer, an automatic verdict, and per-item marks
//   readonly  — student sees their graded result (marks + correct answers)
//
// Persistence is upstream: the caller passes contentJson + onChange.

import { useEffect } from "react";
import {
  EditorContent,
  useEditor,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { StudentBlank, StudentChoice, StudentText } from "./nodes";
import { finalResult, type Mark, type ItemResult } from "./grading";
import { Bold, Italic, List, Heading2, Plus, Check, X, CircleSlash } from "lucide-react";

export type HomeworkMode = "teacher" | "student" | "review" | "readonly";

interface Props {
  contentJson: unknown;
  mode: HomeworkMode;
  onChange?: (json: unknown) => void;
}

function modeOf(editor: any): HomeworkMode {
  return (editor.options.editorProps as any).__omnic_mode ?? "teacher";
}

// ── Shared bits ──────────────────────────────────────────────────

const RESULT_STYLE: Record<ItemResult, { bg: string; fg: string; label: string }> = {
  correct: { bg: "#DCFCE7", fg: "#166534", label: "Correct" },
  incorrect: { bg: "#FEE2E2", fg: "#991B1B", label: "Incorrect" },
  partial: { bg: "#FEF9C3", fg: "#854D0E", label: "Partial" },
  ungraded: { bg: "var(--omnic-gray-100)", fg: "var(--omnic-gray-600)", label: "No answer" },
  open: { bg: "#EDE9FE", fg: "#5B21B6", label: "Needs grading" },
};

function ResultBadge({ node }: { node: any }) {
  const r = finalResult(node);
  const s = RESULT_STYLE[r];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "1px 7px",
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
      }}
    >
      {s.label}
    </span>
  );
}

/** Teacher's per-item correct / partial / incorrect override, shown in review. */
function MarkControls({
  value,
  onChange,
}: {
  value: Mark;
  onChange: (m: Mark) => void;
}) {
  const opts: { m: Exclude<Mark, null>; icon: React.ReactNode; color: string }[] = [
    { m: "correct", icon: <Check size={13} />, color: "#166534" },
    { m: "partial", icon: <CircleSlash size={13} />, color: "#854D0E" },
    { m: "incorrect", icon: <X size={13} />, color: "#991B1B" },
  ];
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {opts.map((o) => (
        <button
          key={o.m}
          type="button"
          title={o.m}
          onClick={() => onChange(value === o.m ? null : o.m)}
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            border: value === o.m ? `2px solid ${o.color}` : "1px solid var(--omnic-gray-300)",
            background: value === o.m ? o.color : "white",
            color: value === o.m ? "white" : o.color,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {o.icon}
        </button>
      ))}
    </span>
  );
}

// ── Fill-in-the-blank (inline) ───────────────────────────────────

function BlankView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const mode = modeOf(editor);
  const a = node.attrs as any;

  if (mode === "teacher") {
    return (
      <NodeViewWrapper as="span" style={{ display: "inline-flex", gap: 3, verticalAlign: "middle" }}>
        <input
          value={a.label ?? ""}
          placeholder="hint"
          onChange={(e) => updateAttributes({ label: e.target.value })}
          style={inlineField(70, "dashed")}
        />
        <input
          value={a.expected ?? ""}
          placeholder="correct answer"
          onChange={(e) => updateAttributes({ expected: e.target.value })}
          style={inlineField(120, "solid")}
        />
      </NodeViewWrapper>
    );
  }

  if (mode === "student") {
    return (
      <NodeViewWrapper as="span" style={{ display: "inline-block", verticalAlign: "middle" }}>
        <input
          value={a.answer ?? ""}
          placeholder={a.label || "answer"}
          onChange={(e) => updateAttributes({ answer: e.target.value })}
          style={studentField(false)}
        />
      </NodeViewWrapper>
    );
  }

  // review + readonly — show the answer, verdict, and (if known) the key
  const r = finalResult(node);
  return (
    <NodeViewWrapper as="span" style={{ display: "inline-flex", alignItems: "center", gap: 6, verticalAlign: "middle" }}>
      <span style={studentField(true, r)}>{a.answer || "—"}</span>
      {a.expected && r !== "correct" && (
        <span style={{ fontSize: 12, color: "#166534" }}>→ {a.expected}</span>
      )}
      {mode === "review" ? (
        <MarkControls value={a.mark ?? null} onChange={(m) => updateAttributes({ mark: m })} />
      ) : (
        <ResultBadge node={node} />
      )}
    </NodeViewWrapper>
  );
}

// ── Multiple choice (block) ──────────────────────────────────────

function ChoiceView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const mode = modeOf(editor);
  const a = node.attrs as any;
  const options: string[] = a.options ?? [];

  const setOption = (i: number, val: string) => {
    const next = [...options];
    next[i] = val;
    updateAttributes({ options: next });
  };
  const addOption = () => updateAttributes({ options: [...options, ""] });
  const removeOption = (i: number) => {
    const next = options.filter((_, idx) => idx !== i);
    let correct = a.correct;
    if (correct === i) correct = -1;
    else if (correct > i) correct -= 1;
    updateAttributes({ options: next, correct });
  };

  const r = finalResult(node);

  return (
    <NodeViewWrapper as="div" style={exerciseBox()}>
      {mode === "teacher" ? (
        <>
          <input
            value={a.question ?? ""}
            placeholder="Question"
            onChange={(e) => updateAttributes({ question: e.target.value })}
            style={{ ...blockField(), fontWeight: 600, marginBottom: 8 }}
          />
          {options.map((opt, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <input
                type="radio"
                title="Mark correct"
                checked={a.correct === i}
                onChange={() => updateAttributes({ correct: i })}
              />
              <input
                value={opt}
                placeholder={`Option ${i + 1}`}
                onChange={(e) => setOption(i, e.target.value)}
                style={blockField()}
              />
              <button type="button" onClick={() => removeOption(i)} style={iconBtn()}>
                <X size={13} />
              </button>
            </div>
          ))}
          <button type="button" onClick={addOption} style={ghostBtn()}>
            <Plus size={13} /> Add option
          </button>
          <div style={hint()}>Select the radio next to the correct option (leave unset to grade by hand).</div>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{a.question || "Question"}</div>
          {options.map((opt, i) => {
            const chosen = a.selected === i;
            const isCorrect = mode !== "student" && a.correct === i;
            const chosenWrong = mode !== "student" && chosen && a.correct >= 0 && a.correct !== i;
            return (
              <label
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  marginBottom: 4,
                  borderRadius: 6,
                  cursor: mode === "student" ? "pointer" : "default",
                  background: isCorrect
                    ? "#DCFCE7"
                    : chosenWrong
                      ? "#FEE2E2"
                      : chosen
                        ? "var(--omnic-tenant-primary-soft)"
                        : "transparent",
                  border: "1px solid var(--omnic-gray-200)",
                }}
              >
                <input
                  type="radio"
                  checked={chosen}
                  disabled={mode !== "student"}
                  onChange={() => mode === "student" && updateAttributes({ selected: i })}
                />
                <span>{opt}</span>
                {isCorrect && <Check size={14} style={{ color: "#166534", marginLeft: "auto" }} />}
              </label>
            );
          })}
          {(mode === "review" || mode === "readonly") && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              {mode === "review" ? (
                <MarkControls value={a.mark ?? null} onChange={(m) => updateAttributes({ mark: m })} />
              ) : (
                <ResultBadge node={node} />
              )}
            </div>
          )}
        </>
      )}
    </NodeViewWrapper>
  );
}

// ── Open answer (block) ──────────────────────────────────────────

function TextView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const mode = modeOf(editor);
  const a = node.attrs as any;

  return (
    <NodeViewWrapper as="div" style={exerciseBox()}>
      {mode === "teacher" ? (
        <>
          <input
            value={a.prompt ?? ""}
            placeholder="Prompt (e.g. Write 3 sentences about your weekend)"
            onChange={(e) => updateAttributes({ prompt: e.target.value })}
            style={{ ...blockField(), fontWeight: 600 }}
          />
          <label style={{ ...hint(), display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
            <input
              type="checkbox"
              checked={!!a.long}
              onChange={(e) => updateAttributes({ long: e.target.checked })}
            />
            Long answer (paragraph box)
          </label>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{a.prompt || "Open answer"}</div>
          {a.long ? (
            <textarea
              value={a.answer ?? ""}
              readOnly={mode !== "student"}
              placeholder={mode === "student" ? "Write your answer…" : ""}
              onChange={(e) => mode === "student" && updateAttributes({ answer: e.target.value })}
              rows={4}
              style={blockField()}
            />
          ) : (
            <input
              value={a.answer ?? ""}
              readOnly={mode !== "student"}
              placeholder={mode === "student" ? "Your answer…" : ""}
              onChange={(e) => mode === "student" && updateAttributes({ answer: e.target.value })}
              style={blockField()}
            />
          )}
          {(mode === "review" || mode === "readonly") && (
            <div style={{ marginTop: 8 }}>
              {mode === "review" ? (
                <MarkControls value={a.mark ?? null} onChange={(m) => updateAttributes({ mark: m })} />
              ) : (
                <ResultBadge node={node} />
              )}
            </div>
          )}
        </>
      )}
    </NodeViewWrapper>
  );
}

// ── Editor shell ─────────────────────────────────────────────────

const BlankNode = StudentBlank.extend({ addNodeView: () => ReactNodeViewRenderer(BlankView) });
const ChoiceNode = StudentChoice.extend({ addNodeView: () => ReactNodeViewRenderer(ChoiceView) });
const TextNode = StudentText.extend({ addNodeView: () => ReactNodeViewRenderer(TextView) });

export function HomeworkEditor({ contentJson, mode, onChange }: Props) {
  const editor = useEditor(
    {
      extensions: [StarterKit, BlankNode, ChoiceNode, TextNode],
      content: contentJson ?? { type: "doc", content: [{ type: "paragraph" }] },
      editable: mode !== "readonly",
      immediatelyRender: false,
      editorProps: {
        attributes: { class: "prose prose-sm max-w-none focus:outline-none min-h-[160px]" },
        __omnic_mode: mode,
      } as any,
      onUpdate({ editor }) {
        onChange?.(editor.getJSON());
      },
    },
    [mode]
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(mode !== "readonly");
    queueMicrotask(() => {
      if (!editor.isDestroyed) editor.view.updateState(editor.view.state);
    });
  }, [editor, mode]);

  useEffect(() => {
    if (!editor || !contentJson) return;
    queueMicrotask(() => {
      if (editor.isDestroyed) return;
      if (JSON.stringify(editor.getJSON()) === JSON.stringify(contentJson)) return;
      editor.commands.setContent(contentJson as never, { emitUpdate: false });
    });
  }, [contentJson, editor]);

  if (!editor) return null;

  return (
    <div style={{ border: "1px solid var(--omnic-gray-200)", borderRadius: 8, background: "white" }}>
      {mode === "teacher" && <Toolbar editor={editor} />}
      <div style={{ padding: 14 }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  const insert = (type: string, attrs: Record<string, unknown>) =>
    editor.chain().focus().insertContent({ type, attrs }).run();

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: "6px 8px",
        borderBottom: "1px solid var(--omnic-gray-100)",
        background: "var(--omnic-gray-50)",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading">
        <Heading2 size={13} />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
        <Bold size={13} />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
        <Italic size={13} />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">
        <List size={13} />
      </ToolBtn>
      <div style={{ width: 1, alignSelf: "stretch", background: "var(--omnic-gray-200)", margin: "0 4px" }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--omnic-gray-500)", marginInlineEnd: 2 }}>Insert</span>
      <ToolBtn onClick={() => insert("studentBlank", { label: "", expected: "", answer: "" })} title="Fill-in-the-blank">
        <Plus size={12} /> Blank
      </ToolBtn>
      <ToolBtn onClick={() => insert("studentChoice", { question: "", options: ["", ""], correct: -1, selected: -1 })} title="Multiple choice">
        <Plus size={12} /> Choice
      </ToolBtn>
      <ToolBtn onClick={() => insert("studentText", { prompt: "", answer: "", long: false })} title="Short answer">
        <Plus size={12} /> Short
      </ToolBtn>
      <ToolBtn onClick={() => insert("studentText", { prompt: "", answer: "", long: true })} title="Long / essay answer">
        <Plus size={12} /> Essay
      </ToolBtn>
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: "4px 8px",
        borderRadius: 6,
        background: active ? "var(--omnic-tenant-primary-soft)" : "transparent",
        color: active ? "var(--omnic-tenant-primary)" : "var(--omnic-gray-700)",
        border: "none",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}

// ── Style helpers ────────────────────────────────────────────────

function inlineField(width: number, border: "solid" | "dashed"): React.CSSProperties {
  return {
    width,
    fontSize: 12,
    padding: "1px 5px",
    border: `1px ${border} var(--omnic-tenant-primary)`,
    borderRadius: 4,
    background: "var(--omnic-tenant-primary-soft)",
    color: "var(--omnic-tenant-primary)",
  };
}
function studentField(readOnly: boolean, result?: ItemResult): React.CSSProperties {
  const tint =
    result === "correct" ? "#DCFCE7" : result === "incorrect" ? "#FEE2E2" : result === "partial" ? "#FEF9C3" : undefined;
  return {
    minWidth: 90,
    display: "inline-block",
    fontSize: 15,
    padding: "2px 8px",
    border: "1px solid var(--omnic-gray-300)",
    borderRadius: 6,
    background: tint ?? (readOnly ? "var(--omnic-gray-50)" : "var(--omnic-tenant-primary-soft)"),
    color: "var(--omnic-gray-900)",
  };
}
function blockField(): React.CSSProperties {
  return {
    width: "100%",
    fontSize: 14,
    padding: "6px 8px",
    border: "1px solid var(--omnic-gray-300)",
    borderRadius: 6,
    background: "white",
    color: "var(--omnic-gray-900)",
  };
}
function exerciseBox(): React.CSSProperties {
  return {
    border: "1px solid var(--omnic-gray-200)",
    borderRadius: 8,
    padding: 12,
    margin: "10px 0",
    background: "var(--omnic-gray-50)",
  };
}
function hint(): React.CSSProperties {
  return { fontSize: 11, color: "var(--omnic-gray-500)", marginTop: 6 };
}
function ghostBtn(): React.CSSProperties {
  return {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px dashed var(--omnic-gray-300)",
    background: "white",
    color: "var(--omnic-gray-700)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
}
function iconBtn(): React.CSSProperties {
  return {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: "1px solid var(--omnic-gray-300)",
    background: "white",
    color: "var(--omnic-gray-500)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}
