"use client";

// Phase J.1 — Homework editor. TipTap base with StarterKit + a custom
// `studentBlank` inline node. Two modes:
//   teacher: full edit. Toolbar exposes "Insert blank".
//   student: prose is read-only; only the blank inputs accept input.
//
// Persistence is upstream — caller passes contentJson + onChange.
// HomeworkEditor doesn't talk to Convex itself.

import { useEffect, useMemo } from "react";
import {
  EditorContent,
  useEditor,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { StudentBlank } from "./nodes";
import { Bold, Italic, List, Plus } from "lucide-react";

export type HomeworkMode = "teacher" | "student" | "readonly";

interface Props {
  contentJson: unknown;
  mode: HomeworkMode;
  onChange?: (json: unknown) => void;
}

function StudentBlankView({
  node,
  updateAttributes,
  editor,
}: ReactNodeViewProps) {
  const mode: HomeworkMode =
    (editor.options.editorProps as any).__omnic_mode ?? "teacher";
  const readOnly = mode === "readonly";
  const studentEditable = mode === "student" || mode === "teacher";

  return (
    <NodeViewWrapper as="span" style={{ display: "inline-block" }}>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
        {mode === "teacher" && (
          <input
            value={(node.attrs.label as string) ?? ""}
            placeholder="label"
            onChange={(e) =>
              updateAttributes({ label: e.target.value })
            }
            style={{
              width: 70,
              fontSize: 11,
              padding: "1px 4px",
              border: "1px dashed var(--omnic-tenant-primary)",
              borderRadius: 4,
              background: "var(--omnic-tenant-primary-soft)",
              color: "var(--omnic-tenant-primary)",
            }}
          />
        )}
        <input
          value={(node.attrs.answer as string) ?? ""}
          placeholder={
            mode === "student"
              ? (node.attrs.label as string) || "your answer"
              : "answer (student fills)"
          }
          readOnly={readOnly || (!studentEditable && mode === "teacher" ? false : false)}
          onChange={(e) => {
            if (readOnly) return;
            updateAttributes({ answer: e.target.value });
          }}
          style={{
            minWidth: 100,
            fontSize: 15,
            padding: "2px 8px",
            border: "1px solid var(--omnic-gray-300)",
            borderRadius: 6,
            background: readOnly
              ? "var(--omnic-gray-50)"
              : mode === "student"
                ? "var(--omnic-tenant-primary-soft)"
                : "white",
            color: "var(--omnic-gray-900)",
          }}
        />
      </span>
    </NodeViewWrapper>
  );
}

const StudentBlankNode = StudentBlank.extend({
  addNodeView() {
    return ReactNodeViewRenderer(StudentBlankView);
  },
});

export function HomeworkEditor({ contentJson, mode, onChange }: Props) {
  const editor = useEditor(
    {
      extensions: [StarterKit, StudentBlankNode],
      content: contentJson ?? {
        type: "doc",
        content: [{ type: "paragraph" }],
      },
      editable: mode !== "readonly",
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "prose prose-sm max-w-none focus:outline-none min-h-[200px]",
        },
        // Pass mode via editorProps so node views can read it cheaply.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        __omnic_mode: mode,
      } as any,
      onUpdate({ editor }) {
        onChange?.(editor.getJSON());
      },
    },
    [mode]
  );

  // Sync mode in case it changes mid-mount. Defer the view update to
  // a microtask so we don't call flushSync during React's render
  // commit (TipTap warns otherwise).
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(mode !== "readonly");
    queueMicrotask(() => {
      if (!editor.isDestroyed) {
        editor.view.updateState(editor.view.state);
      }
    });
  }, [editor, mode]);

  // Sync content if caller reassigns (e.g. AI generate replaces doc).
  // Defer to microtask so we don't trigger flushSync during React's
  // commit phase. Cheap JSON-string compare keeps the user's
  // in-progress typing from being clobbered by the same payload.
  useEffect(() => {
    if (!editor) return;
    if (!contentJson) return;
    queueMicrotask(() => {
      if (editor.isDestroyed) return;
      const current = editor.getJSON();
      if (JSON.stringify(current) === JSON.stringify(contentJson)) return;
      editor.commands.setContent(contentJson as never, { emitUpdate: false });
    });
  }, [contentJson, editor]);

  if (!editor) return null;

  return (
    <div
      style={{
        border: "1px solid var(--omnic-gray-200)",
        borderRadius: 8,
        background: "white",
      }}
    >
      {mode === "teacher" && <Toolbar editor={editor} />}
      <div style={{ padding: 14 }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: "6px 8px",
        borderBottom: "1px solid var(--omnic-gray-100)",
        background: "var(--omnic-gray-50)",
      }}
    >
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold"
      >
        <Bold size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic"
      >
        <Italic size={13} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Bullet list"
      >
        <List size={13} />
      </ToolBtn>
      <div style={{ width: 1, background: "var(--omnic-gray-200)" }} />
      <ToolBtn
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent({
              type: "studentBlank",
              attrs: { label: "", answer: "" },
            })
            .run()
        }
        title="Insert blank for student to fill"
      >
        <Plus size={13} /> <span style={{ fontSize: 12, marginLeft: 4 }}>Blank</span>
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
        color: active
          ? "var(--omnic-tenant-primary)"
          : "var(--omnic-gray-700)",
        border: "none",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}
