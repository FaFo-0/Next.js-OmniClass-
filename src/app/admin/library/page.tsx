"use client";

// Admin Library — list materials + upload new (markdown body for now;
// audio/PDF storage upload is a Phase H polish task).

import { useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Sparkles, ImagePlus } from "lucide-react";

const KIND_LABELS: Record<string, string> = {
  article: "Article",
  story: "Story",
  dialog: "Dialog",
  transcript: "Transcript",
  pdf: "PDF",
};

const LEVEL_LABELS: Record<string, string> = {
  "": "Level (optional)",
  A1: "A1",
  A2: "A2",
  B1: "B1",
  B2: "B2",
  C1: "C1",
  C2: "C2",
};

export default function AdminLibraryPage() {
  const materials = useQuery(api.library.listAllForAdmin) ?? [];
  const create = useMutation(api.library.create);
  const update = useMutation(api.library.update);
  const softDelete = useMutation(api.library.softDelete);

  // Opt-in vocabulary pass. Reading works without it — texts colour from the
  // reader's own history and words resolve on tap — so this is only worth
  // running on material you're about to put in front of students: it flags
  // OCR junk so nobody cards it, and pre-warms the shared word bank.
  const enrich = useAction(api.library.enrichMaterialVocabulary);
  const [preparing, setPreparing] = useState<string | null>(null);

  async function prepare(id: any, title: string) {
    setPreparing(id);
    const t = toast.loading(`Preparing "${title}"…`);
    try {
      const r = await enrich({ materialId: id, translateTo: "ru" });
      toast.success(
        `${title}: ${r.resolved} word${r.resolved === 1 ? "" : "s"} ready` +
          (r.invalid > 0 ? `, ${r.invalid} flagged as not real` : ""),
        { id: t }
      );
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setPreparing(null);
    }
  }

  const [creating, setCreating] = useState(false);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Library"
        subtitle="Add reading materials. Students browse them; teachers read them with students live."
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/admin/library/works">
              <Button variant="outline">Readings (books & articles)</Button>
            </Link>
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} className="me-1" /> New material
            </Button>
          </div>
        }
      />

      {creating && (
        <CreateForm
          onCancel={() => setCreating(false)}
          onSubmit={async (payload) => {
            try {
              await create(payload);
              toast.success("Material created");
              setCreating(false);
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      )}

      <div className="mt-6 rounded-lg border bg-white" style={{ borderColor: "var(--omnic-gray-100)" }}>
        <div className="grid grid-cols-12 px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--omnic-gray-500)" }}>
          <div className="col-span-5">Title</div>
          <div className="col-span-2">Kind</div>
          <div className="col-span-2">Level</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1 text-end">Actions</div>
        </div>
        {materials.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-zinc-500">
            No materials yet. Add one to get started.
          </div>
        )}
        {materials.map((m) => (
          <div
            key={m._id}
            className="grid grid-cols-12 items-center px-5 py-3 border-t"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <div className="col-span-5 flex items-center gap-3">
              {m.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.coverImageUrl}
                  alt=""
                  style={{ width: 52, height: 36, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                />
              ) : null}
              <div>
                <Link
                  href={`/admin/library/${m._id}`}
                  className="font-medium hover:underline"
                  style={{ color: "var(--omnic-gray-900)" }}
                >
                  {m.title}
                </Link>
                {m.description && (
                  <div className="text-xs mt-0.5" style={{ color: "var(--omnic-gray-500)" }}>
                    {m.description}
                  </div>
                )}
                <div className="text-xs mt-0.5" style={{ color: "var(--omnic-gray-400)" }}>
                  {[
                    m.estimatedReadMinutes ? `${m.estimatedReadMinutes} min` : null,
                    m.topicTags?.length ? m.topicTags.join(", ") : null,
                    m.sourceUrl ? "source linked" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </div>
            <div className="col-span-2 text-sm capitalize" style={{ color: "var(--omnic-gray-700)" }}>
              {m.kind}
            </div>
            <div className="col-span-2 text-sm" style={{ color: "var(--omnic-gray-700)" }}>
              {m.levelCEFR ?? "—"}
            </div>
            <div className="col-span-2">
              <StatusPill status={m.isPublished ? "Published" : "Draft"} />
            </div>
            <div className="col-span-1 flex justify-end gap-1">
              <Button
                size="icon"
                variant="ghost"
                disabled={preparing === m._id}
                onClick={() => prepare(m._id, m.title)}
                title="Prepare vocabulary — resolve every word and flag junk"
              >
                <Sparkles size={14} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  update({
                    id: m._id,
                    patch: { isPublished: !m.isPublished },
                  }).then(() => toast.success("Updated"))
                }
                title={m.isPublished ? "Unpublish" : "Publish"}
              >
                <Pencil size={14} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (!confirm(`Delete "${m.title}"?`)) return;
                  softDelete({ id: m._id }).then(() => toast.success("Deleted"));
                }}
                title="Delete"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (payload: any) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<
    "article" | "story" | "dialog" | "transcript" | "pdf"
  >("article");
  const [levelCEFR, setLevelCEFR] = useState<string>("");
  const [topicTags, setTopicTags] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [readMinutes, setReadMinutes] = useState("");
  const [cover, setCover] = useState<{ storageId: string; url: string } | null>(null);

  return (
    <div
      className="mt-4 rounded-lg border bg-white p-5 space-y-3"
      style={{ borderColor: "var(--omnic-gray-100)" }}
    >
      <h3 className="font-semibold">New material</h3>
      <div className="grid grid-cols-2 gap-3">
        <Input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Select
          value={kind}
          onValueChange={(v) => v && setKind(v as any)}
          items={KIND_LABELS}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={levelCEFR}
          onValueChange={(v) => setLevelCEFR(v ?? "")}
          items={LEVEL_LABELS}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Level (optional)" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LEVEL_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Topic tags (comma separated)"
          value={topicTags}
          onChange={(e) => setTopicTags(e.target.value)}
        />
      </div>
      <Input
        placeholder="One-line description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          placeholder="Source URL (optional) — shown as a credit link"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
        />
        <Input
          type="number"
          min="1"
          placeholder="Reading time in minutes (optional)"
          value={readMinutes}
          onChange={(e) => setReadMinutes(e.target.value)}
        />
      </div>
      <CoverPicker cover={cover} onChange={setCover} />
      <Textarea
        placeholder="Content (markdown). Paragraphs separated by blank lines."
        value={contentMarkdown}
        onChange={(e) => setContentMarkdown(e.target.value)}
        rows={10}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button
          onClick={() => {
            if (!title.trim() || !contentMarkdown.trim()) {
              toast.error("Title and content required");
              return;
            }
            onSubmit({
              title: title.trim(),
              description: description.trim() || undefined,
              kind,
              levelCEFR: (levelCEFR || undefined) as any,
              topicTags: topicTags
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              contentMarkdown,
              sourceUrl: sourceUrl.trim() || undefined,
              estimatedReadMinutes: readMinutes ? Number(readMinutes) : undefined,
              coverImageId: cover?.storageId,
              isPublished: false,
            });
          }}
        >
          Create
        </Button>
      </div>
    </div>
  );
}

/** Cover art picker — uploads straight to Convex storage, like the logo. */
function CoverPicker({
  cover,
  onChange,
}: {
  cover: { storageId: string; url: string } | null;
  onChange: (c: { storageId: string; url: string } | null) => void;
}) {
  const generateUploadUrl = useMutation(api.library.generateUploadUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Images only");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Cover must be under 3MB");
      return;
    }
    setBusy(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json();
      onChange({ storageId, url: URL.createObjectURL(file) });
      toast.success("Cover ready — it saves with the material");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div
        onClick={() => !busy && inputRef.current?.click()}
        className="flex items-center justify-center rounded-md border border-dashed"
        style={{
          width: 96,
          height: 64,
          borderColor: "var(--omnic-gray-200)",
          cursor: busy ? "wait" : "pointer",
          overflow: "hidden",
        }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt="Cover" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <ImagePlus size={18} color="var(--omnic-gray-400)" />
        )}
      </div>
      <div className="text-xs" style={{ color: "var(--omnic-gray-500)" }}>
        {busy ? "Uploading…" : cover ? "Click the thumbnail to replace." : "Cover image (optional) — shown on the card in every portal. Max 3MB."}
        {cover && (
          <button className="ms-2 underline" onClick={() => onChange(null)} type="button">
            remove
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
    </div>
  );
}
