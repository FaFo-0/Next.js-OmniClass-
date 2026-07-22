"use client";

// All of a student's homework in one place — handles "I have a stack of
// undone homework" and "I want to do one from a few lessons ago". The Study
// hub only summarises the open ones; this is the full browsable history.

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";

const OPEN = ["assigned", "in_progress"];

export default function StudentHomeworkListPage() {
  const homework = useQuery(api.homework.listForStudent, {}) ?? [];

  const toDo = homework.filter((h: any) => OPEN.includes(h.status));
  const submitted = homework.filter((h: any) => h.status === "submitted");
  const completed = homework.filter((h: any) => h.status === "reviewed");

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/student/study" className="body-sm" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> Study
        </Link>
        <h1 className="h1" style={{ margin: "4px 0 0" }}>Homework</h1>
        <div className="body" style={{ marginTop: 4 }}>
          {toDo.length > 0
            ? `${toDo.length} to do · do them in any order, oldest first is a good habit.`
            : "You're all caught up."}
        </div>
      </div>

      <Section title={`To do (${toDo.length})`} empty="Nothing assigned right now.">
        {toDo.map((h: any) => (
          <HomeworkRow
            key={h._id}
            h={h}
            subtitle={h.status === "in_progress" ? "Started — continue" : "Not started"}
            accent="var(--omnic-tenant-primary)"
          />
        ))}
      </Section>

      {submitted.length > 0 && (
        <Section title={`Waiting for review (${submitted.length})`}>
          {submitted.map((h: any) => (
            <HomeworkRow key={h._id} h={h} subtitle="Submitted — your teacher will review it" accent="#D97706" />
          ))}
        </Section>
      )}

      {completed.length > 0 && (
        <Section title={`Completed (${completed.length})`}>
          {completed.map((h: any) => (
            <HomeworkRow
              key={h._id}
              h={h}
              subtitle={
                h.maxScore
                  ? `Score ${h.score ?? 0} / ${h.maxScore}${h.teacherComment ? " · has feedback" : ""}`
                  : h.teacherComment
                    ? "Reviewed — has feedback"
                    : "Reviewed"
              }
              accent="#16A34A"
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: string;
  children: React.ReactNode;
}) {
  const hasKids = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div className="h3" style={{ marginBottom: 12 }}>{title}</div>
      {hasKids ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
      ) : (
        <div className="body-sm">{empty}</div>
      )}
    </div>
  );
}

function HomeworkRow({ h, subtitle, accent }: { h: any; subtitle: string; accent: string }) {
  const when = h.assignedAt ? new Date(h.assignedAt).toLocaleDateString() : null;
  return (
    <Link
      href={`/student/homework/${h._id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        border: "1px solid var(--omnic-gray-200)",
        borderRadius: 8,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ width: 6, alignSelf: "stretch", borderRadius: 3, background: accent }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {h.title}
        </div>
        <div className="body-sm">{subtitle}</div>
      </div>
      {when && <div className="body-sm" style={{ whiteSpace: "nowrap" }}>{when}</div>}
      <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />
    </Link>
  );
}
