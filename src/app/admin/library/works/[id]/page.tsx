"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { ReadingView } from "@/components/library/ReadingView";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
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
import { ArrowLeft, Save, Trash2 } from "lucide-react";

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

interface UnitDraft {
  title: string;
  contentMarkdown: string;
}

export default function AdminWorkEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const workId = id as Id<"libraryWorks">;
  const data = useQuery(api.libraryWorks.getWork, { id: workId });
  const update = useMutation(api.libraryWorks.updateWork);
  const replaceUnits = useMutation(api.libraryWorks.replaceUnits);
  const publish = useMutation(api.libraryWorks.publish);
  const softDelete = useMutation(api.libraryWorks.softDelete);
  const enrich = useAction(api.library.enrichWorkVocabulary);
  const students = (useQuery(api.users.listAllUsers, {}) ?? []).filter((u) => u.role === "student");
  const [previewUnitId, setPreviewUnitId] = useState<string | null>(null);
  const [previewStudentId, setPreviewStudentId] = useState("");
  const learnerLocale = useQuery(api.users.getLearnerLocale, previewStudentId ? { studentId: previewStudentId } : "skip");
  const [preparing, setPreparing] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [kind, setKind] = useState("article");
  const [levelCEFR, setLevelCEFR] = useState("");
  const [topicTags, setTopicTags] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [license, setLicense] = useState("");
  const [attribution, setAttribution] = useState("");
  const [units, setUnits] = useState<UnitDraft[]>([]);

  useEffect(() => {
    if (!data) return;
    setTitle(data.work.title);
    setDescription(data.work.description ?? "");
    setAuthor(data.work.author ?? "");
    setKind(data.work.kind);
    setLevelCEFR(data.work.levelCEFR ?? "");
    setTopicTags((data.work.topicTags ?? []).join(", "));
    setSourceUrl(data.work.sourceUrl ?? "");
    setExternalUrl(data.work.externalUrl ?? "");
    setLicense(data.work.license ?? "");
    setAttribution(data.work.attribution ?? "");
    setUnits(data.units.map((u) => ({ title: u.title, contentMarkdown: u.contentMarkdown })));
  }, [data]);

  if (data === undefined) return <div className="p-6">Loading…</div>;
  if (data === null) return <div className="p-6">Not found.</div>;

  const work = data.work;

  async function saveMetadata() {
    try {
      await update({
        id: workId,
        patch: {
          title: title.trim(),
          description: description.trim() || undefined,
          author: author.trim() || undefined,
          kind: kind as never,
          levelCEFR: (levelCEFR as never) || undefined,
          topicTags: topicTags.split(",").map((s) => s.trim()).filter(Boolean),
          sourceUrl: sourceUrl.trim() || undefined,
          externalUrl: kind === "book" ? externalUrl.trim() || null : null,
          license: license.trim() || undefined,
          attribution: attribution.trim() || undefined,
        },
      });
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function saveUnits() {
    try {
      await replaceUnits({
        workId,
        units: units.map((u) => ({
          title: u.title.trim() || "Untitled",
          contentMarkdown: u.contentMarkdown,
        })),
      });
      toast.success("Units saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function togglePublish() {
    try {
      await publish({ id: workId, isPublished: !work.isPublished });
      toast.success(work.isPublished ? "Unpublished" : "Published");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${work.title}"?`)) return;
    await softDelete({ id: workId });
    toast.success("Deleted");
    router.push("/admin/library/works");
  }

  async function handlePrepare() {
    setPreparing(true);
    try {
      const r = await enrich({ workId });
      toast.success(
        `Prepared ${r.resolved} word${r.resolved === 1 ? "" : "s"}` +
          (r.invalid > 0 ? `, ${r.invalid} flagged as not real` : "")
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => router.push("/admin/library/works")}>
        <ArrowLeft size={14} className="me-1" /> All readings
      </Button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="min-w-0 break-words text-2xl font-bold" style={{ color: "var(--omnic-gray-900)", overflowWrap: "anywhere" }}>{work.title}</h1>
          <StatusPill status={work.isPublished ? "Published" : "Draft"} />
        </div>
        <div className="flex max-w-full flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handlePrepare}
            disabled={preparing}
            title="Resolve every word's definition + translation up front, so readers get instant results"
          >
            {preparing ? "Preparing…" : "Prepare vocabulary"}
          </Button>
          <Button variant="outline" onClick={togglePublish}>
            {work.isPublished ? "Unpublish" : "Publish"}
          </Button>
          <Button variant="ghost" onClick={handleDelete}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-white p-5 space-y-3" style={{ borderColor: "var(--omnic-gray-100)" }}>
        <h3 className="font-semibold">Details</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Select
            value={kind}
            onValueChange={(v) => {
              if (!v) return;
              setKind(v);
              if (v !== "book") setExternalUrl("");
            }}
            items={KIND_LABELS}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={levelCEFR} onValueChange={(v) => setLevelCEFR(v ?? "")} items={LEVEL_LABELS}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Level" /></SelectTrigger>
            <SelectContent>
              {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={topicTags} onChange={(e) => setTopicTags(e.target.value)} placeholder="Topics (comma separated)" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Source URL" />
          <Input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="License / status" />
        </div>
        {kind === "book" && (
          <div>
            <label htmlFor="work-google-drive" className="mb-1 block text-sm font-medium">Google Drive link (optional)</label>
            <Input id="work-google-drive" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://drive.google.com/..." />
            <p className="mt-1 text-xs text-zinc-500">OmniClass does not change Drive sharing permissions; share the file with the intended readers.</p>
          </div>
        )}
        <Input value={attribution} onChange={(e) => setAttribution(e.target.value)} placeholder="Attribution" />
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={saveMetadata}><Save size={14} className="me-1" /> Save details</Button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-white p-5 space-y-3" style={{ borderColor: "var(--omnic-gray-100)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Units ({units.length})</h3>
          <Button variant="outline" size="sm" onClick={() => setUnits([...units, { title: "", contentMarkdown: "" }])}>
            Add unit
          </Button>
        </div>
        <p className="text-sm text-zinc-500">Preview shows the last saved text.</p>
        <div className="flex flex-wrap gap-2">
          {data.units.map((u) => (
            <Button key={u._id} variant="outline" onClick={() => setPreviewUnitId(u._id)}>Preview: {u.title}</Button>
          ))}
        </div>
        {units.map((u, i) => (
          <div key={i} className="rounded-md border p-3 space-y-2" style={{ borderColor: "var(--omnic-gray-100)" }}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Input
                className="min-w-0 flex-1"
                value={u.title}
                onChange={(e) => setUnits(units.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                placeholder={`Unit ${i + 1} title`}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUnits(units.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
            </div>
            <Textarea
              value={u.contentMarkdown}
              onChange={(e) => setUnits(units.map((x, j) => (j === i ? { ...x, contentMarkdown: e.target.value } : x)))}
              rows={8}
              placeholder="Markdown content"
            />
          </div>
        ))}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={saveUnits}><Save size={14} className="me-1" /> Save units</Button>
        </div>
      </div>
      {data.units.filter((u) => u._id === previewUnitId).map((unit) => (
        <section key={unit._id} className="mt-4 rounded-lg border bg-white p-4" aria-label="Reading preview">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">Reading preview</h2>
            <Select value={previewStudentId} onValueChange={(v) => setPreviewStudentId(v ?? "")} items={Object.fromEntries([["", "No student selected"], ...students.map((s) => [s.externalId, s.name])])}>
              <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Read with a student" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">No student selected</SelectItem>
                {students.map((s) => <SelectItem key={s.externalId} value={s.externalId}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" onClick={() => setPreviewUnitId(null)}>Close preview</Button>
          </div>
          <p className="mt-2 text-sm text-zinc-500">Select a student to save words to their list. Previewing does not publish this reading.</p>
          {work.coverImageUrl && /* eslint-disable-next-line @next/next/no-img-element */
            <img src={work.coverImageUrl} alt="" className="mt-4 h-40 w-full rounded-md object-cover" />}
          <ReadingView work={work} unit={unit} mode="live-teach" activeStudentId={previewStudentId || undefined} learnerLocale={learnerLocale} />
        </section>
      ))}
    </div>
  );
}
