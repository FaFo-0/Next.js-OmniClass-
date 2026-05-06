"use client";

// Admin Library — list materials + upload new (markdown body for now;
// audio/PDF storage upload is a Phase H polish task).

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";

export default function AdminLibraryPage() {
  const materials = useQuery(api.library.listAllForAdmin) ?? [];
  const create = useMutation(api.library.create);
  const update = useMutation(api.library.update);
  const softDelete = useMutation(api.library.softDelete);

  const [creating, setCreating] = useState(false);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Library"
        subtitle="Upload reading materials. Students browse them; teachers read them with students live."
        right={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} className="me-1" /> New material
          </Button>
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
            No materials yet. Upload one to get started.
          </div>
        )}
        {materials.map((m) => (
          <div
            key={m._id}
            className="grid grid-cols-12 items-center px-5 py-3 border-t"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <div className="col-span-5">
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
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as any)}
          className="h-9 rounded-md border px-3 text-sm"
          style={{ borderColor: "var(--omnic-gray-300)" }}
        >
          <option value="article">Article</option>
          <option value="story">Story</option>
          <option value="dialog">Dialog</option>
          <option value="transcript">Transcript</option>
          <option value="pdf">PDF</option>
        </select>
        <select
          value={levelCEFR}
          onChange={(e) => setLevelCEFR(e.target.value)}
          className="h-9 rounded-md border px-3 text-sm"
          style={{ borderColor: "var(--omnic-gray-300)" }}
        >
          <option value="">Level (optional)</option>
          {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
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
