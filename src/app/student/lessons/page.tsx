"use client";

// My Lessons — the student's actual lesson history, built from schedule
// events (what happened) rather than published notes (what the teacher
// wrote up afterwards). Notes attach to the rows that have them.

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";
import { useTranslations } from "next-intl";
import { browserTz, convertZoned } from "@/lib/tz";
import { formatTime } from "@/lib/timeFormat";

type Filter = "all" | "upcoming" | "completed" | "missed";

/** How each outcome reads to a student — plain words, not system statuses. */
const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  scheduled: { label: "Upcoming", bg: "var(--omnic-tenant-primary-soft)", fg: "var(--omnic-tenant-primary)" },
  makeup: { label: "Make-up", bg: "var(--omnic-tenant-primary-soft)", fg: "var(--omnic-tenant-primary)" },
  completed: { label: "Done", bg: "rgba(22,163,74,0.14)", fg: "#15803D" },
  cancelled: { label: "Cancelled", bg: "var(--omnic-gray-100)", fg: "var(--omnic-gray-600)" },
  no_show_student: { label: "You missed it", bg: "#FEF3C7", fg: "#92400E" },
  no_show_teacher: { label: "Teacher missed it", bg: "var(--omnic-red-tint)", fg: "var(--omnic-red)" },
};

export default function StudentLessonsPage() {
  const t = useTranslations("app.lessons");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const history = useQuery(api.lessons.myLessonHistory, {});
  const me = useQuery(api.users.getMe);
  const tenant = useQuery(api.tenantSettings.getActive, {});

  const loading = history === undefined;
  const rows = history ?? [];
  const orgTz = tenant?.timezone ?? "UTC";
  const viewerTz = me?.timezone ?? browserTz();
  const timeFmt = me?.timeFormat ?? "24h";

  const counts = {
    all: rows.length,
    upcoming: rows.filter((r) => r.status === "scheduled" || r.status === "makeup").length,
    completed: rows.filter((r) => r.status === "completed").length,
    missed: rows.filter((r) => r.status.startsWith("no_show")).length,
  };

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (filter === "upcoming" && !(r.status === "scheduled" || r.status === "makeup")) return false;
    if (filter === "completed" && r.status !== "completed") return false;
    if (filter === "missed" && !r.status.startsWith("no_show")) return false;
    if (!q) return true;
    return (
      r.title.toLowerCase().includes(q) ||
      (r.teacherName ?? "").toLowerCase().includes(q) ||
      (r.notes?.title ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>{t("title")}</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {loading
              ? "…"
              : t("counts", { completed: counts.completed, upcoming: counts.upcoming })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div className="search-wrap">
          <Icon name="search" size={15} stroke="var(--omnic-gray-400)" />
          <input
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(
            [
              ["all", t("all")],
              ["upcoming", t("upcomingFilter")],
              ["completed", t("completedFilter")],
              ["missed", t("missedFilter")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className="chip"
              onClick={() => setFilter(value)}
              style={
                filter === value
                  ? { background: "var(--brand-purple)", color: "#fff", borderColor: "var(--brand-purple)" }
                  : undefined
              }
            >
              {label}
              <span style={{ fontSize: 11, opacity: 0.7, marginInlineStart: 4 }}>{counts[value]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ padding: "14px 20px", borderBottom: "1px solid var(--omnic-gray-100)" }}>
              <div className="skel" style={{ height: 14, width: "45%", marginBottom: 8 }} />
              <div className="skel" style={{ height: 12, width: "25%" }} />
            </div>
          ))}

        {!loading &&
          filtered.map((r) => {
            const s = STATUS[r.status] ?? {
              label: r.status,
              bg: "var(--omnic-gray-100)",
              fg: "var(--omnic-gray-600)",
            };
            // Times are stored in academy wall-clock — show the student theirs.
            const local = convertZoned(r.date, r.startTime, orgTz, viewerTz);
            const row = (
              <>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: s.bg,
                    color: s.fg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name={r.notes ? "file" : "calendar"} size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--omnic-gray-900)" }}>
                    {r.notes?.title ?? r.title}
                  </div>
                  <div className="body-sm" style={{ marginTop: 2 }}>
                    {local.date} · {formatTime(local.time, timeFmt)}
                    {r.teacherName ? ` · ${r.teacherName}` : ""}
                    {r.notes ? " · notes ready" : ""}
                  </div>
                </div>
                <span className="pill" style={{ background: s.bg, color: s.fg, fontWeight: 600 }}>
                  {s.label}
                </span>
                {r.notes && <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />}
              </>
            );

            // Only rows with published notes lead anywhere.
            return r.notes ? (
              <Link key={r._id} href={`/student/lessons/${r.notes._id}`} className="lesson-row">
                {row}
              </Link>
            ) : (
              <div key={r._id} className="lesson-row" style={{ cursor: "default" }}>
                {row}
              </div>
            );
          })}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: "center" }} className="body-sm">
            {search || filter !== "all" ? (
              "No lessons match."
            ) : (
              <>
                No lessons yet.{" "}
                <Link href="/student/calendar" style={{ color: "var(--brand-purple)" }}>
                  Book your first one
                </Link>
                .
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
