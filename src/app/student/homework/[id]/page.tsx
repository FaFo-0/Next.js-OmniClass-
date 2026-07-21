"use client";

// Standalone homework page. Homework used to be reachable only through the
// lesson detail page, which lists PUBLISHED lessons — homework assigned
// before publication pointed nowhere. This route depends only on the
// homework row itself (getById enforces ownership), so an assignment is
// always openable from Study or a notification.

import { use } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { Icon } from "@/components/shared/icons";
import { HomeworkEditor } from "@/components/homework/HomeworkEditor";
import { toast } from "sonner";

export default function StudentHomeworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const hw = useQuery(api.homework.getById, { id: id as Id<"homework"> });
  const updateContent = useMutation(api.homework.updateContent);
  const submit = useMutation(api.homework.submit);

  if (hw === undefined) {
    return <div className="body" style={{ padding: 40, textAlign: "center" }}>Loading…</div>;
  }
  if (hw === null) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", textAlign: "center" }}>
        <div className="h2" style={{ marginBottom: 8 }}>Homework not found</div>
        <p className="body" style={{ marginBottom: 16 }}>
          It may have been removed, or the link is stale.
        </p>
        <Link href="/student/study" className="btn btn-secondary">Back to Study</Link>
      </div>
    );
  }

  const editable = hw.status === "assigned" || hw.status === "in_progress";

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <Link href="/student/study" className="body-sm" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="chevronLeft" size={14} /> Study
          </Link>
          <h1 className="h1" style={{ margin: "4px 0 0" }}>{hw.title}</h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="pill pill-tenant">{hw.status.replace("_", " ")}</span>
          {hw.status === "reviewed" && hw.maxScore ? (
            <div className="body-sm" style={{ marginTop: 4, fontWeight: 700 }}>
              Score {hw.score ?? 0} / {hw.maxScore}
            </div>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <HomeworkEditor
          contentJson={hw.contentJson}
          mode={editable ? "student" : "readonly"}
          onChange={(json) => {
            if (!editable) return;
            updateContent({ id: hw._id, contentJson: json }).catch((e) =>
              console.error(e)
            );
          }}
        />
        {editable && (
          <button
            className="btn btn-tenant"
            style={{ marginTop: 14 }}
            onClick={async () => {
              try {
                await submit({ id: hw._id });
                toast.success("Homework submitted — your teacher will review it");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Submit homework
          </button>
        )}
        {hw.status === "submitted" && (
          <p className="body-sm" style={{ marginTop: 14 }}>
            Submitted — waiting for your teacher&apos;s review.
          </p>
        )}
        {hw.status === "reviewed" && hw.teacherComment && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: "var(--status-active-bg)",
              color: "var(--status-active)",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            <strong>Teacher feedback:</strong> {hw.teacherComment}
          </div>
        )}
      </div>
    </div>
  );
}
