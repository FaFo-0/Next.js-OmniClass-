"use client";

// Admin Library — Readings (Library 2.0). A "reading" is a work composed of
// ordered units: paste a whole book as Markdown and `## Chapter …` headings
// become chapters automatically. Articles/stories/dialogues are single-unit.

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex";
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
import { Plus, BookOpen } from "lucide-react";

const KIND_LABELS: Record<string, string> = {
  book: "Book",
  article: "Article",
  story: "Story",
  dialog: "Dialogue",
  transcript: "Transcript",
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

export default function AdminWorksPage() {
  const works = useQuery(api.libraryWorks.listAllForAdmin) ?? [];
  const create = useMutation(api.libraryWorks.createWork);
  const [creating, setCreating] = useState(false);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Readings"
        subtitle="Books, articles, stories and dialogues. Paste a whole book and its chapters split automatically."
        right={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} className="me-1" /> New reading
          </Button>
        }
      />

      {creating && (
        <CreateWorkForm
          onCancel={() => setCreating(false)}
          onSubmit={async (payload) => {
            try {
              await create(payload);
              toast.success("Reading created as a draft");
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
          <div className="col-span-1 text-end">Open</div>
        </div>
        {works.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-zinc-500">
            No readings yet. Add your first book or article.
          </div>
        )}
        {works.map((w) => (
          <div
            key={w._id}
            className="grid grid-cols-12 items-center px-5 py-3 border-t"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <div className="col-span-5">
              <Link
                href={`/admin/library/works/${w._id}`}
                className="font-medium hover:underline"
                style={{ color: "var(--omnic-gray-900)" }}
              >
                {w.title}
              </Link>
              {w.author && (
                <div className="text-xs mt-0.5" style={{ color: "var(--omnic-gray-500)" }}>
                  {w.author}
                </div>
              )}
            </div>
            <div className="col-span-2 text-sm capitalize" style={{ color: "var(--omnic-gray-700)" }}>
              {w.kind}
            </div>
            <div className="col-span-2 text-sm" style={{ color: "var(--omnic-gray-700)" }}>
              {w.levelCEFR ?? "—"}
            </div>
            <div className="col-span-2">
              <StatusPill status={w.isPublished ? "Published" : "Draft"} />
            </div>
            <div className="col-span-1 flex justify-end">
              <Link href={`/admin/library/works/${w._id}`}>
                <Button size="icon" variant="ghost" title="Open">
                  <BookOpen size={14} />
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type CreateWorkInput = {
  title: string;
  kind: "book" | "article" | "story" | "dialog" | "transcript";
  levelCEFR?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  topicTags: string[];
  description?: string;
  author?: string;
  sourceUrl?: string;
  license?: string;
  attribution?: string;
  contentMarkdown?: string;
};

function CreateWorkForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (payload: CreateWorkInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"book" | "article" | "story" | "dialog" | "transcript">("book");
  const [levelCEFR, setLevelCEFR] = useState("");
  const [topicTags, setTopicTags] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [license, setLicense] = useState("");
  const [attribution, setAttribution] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");

  return (
    <div className="mt-4 rounded-lg border bg-white p-5 space-y-3" style={{ borderColor: "var(--omnic-gray-100)" }}>
      <h3 className="font-semibold">New reading</h3>
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Select value={kind} onValueChange={(v) => v && setKind(v)} items={KIND_LABELS}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={levelCEFR} onValueChange={(v) => setLevelCEFR(v ?? "")} items={LEVEL_LABELS}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Level (optional)" /></SelectTrigger>
          <SelectContent>
            {Object.entries(LEVEL_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Topic tags (comma separated)" value={topicTags} onChange={(e) => setTopicTags(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="Author (optional)" value={author} onChange={(e) => setAuthor(e.target.value)} />
        <Input placeholder="One-line description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="Source URL (optional)" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        <Input placeholder="License / status (e.g. Public domain)" value={license} onChange={(e) => setLicense(e.target.value)} />
      </div>
      <Input placeholder="Attribution line (optional)" value={attribution} onChange={(e) => setAttribution(e.target.value)} />
      <Textarea
        placeholder={"Content (markdown). Use `## Chapter title` headings to split a book into chapters; a document without headings becomes one reading."}
        value={contentMarkdown}
        onChange={(e) => setContentMarkdown(e.target.value)}
        rows={12}
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
              kind,
              levelCEFR: (levelCEFR as CreateWorkInput["levelCEFR"]) || undefined,
              topicTags: topicTags.split(",").map((s) => s.trim()).filter(Boolean),
              description: description.trim() || undefined,
              author: author.trim() || undefined,
              sourceUrl: sourceUrl.trim() || undefined,
              license: license.trim() || undefined,
              attribution: attribution.trim() || undefined,
              contentMarkdown,
            });
          }}
        >
          Create draft
        </Button>
      </div>
    </div>
  );
}
