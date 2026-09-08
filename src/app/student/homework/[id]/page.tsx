"use client";

// Standalone homework page. Homework used to be reachable only through the
// lesson detail page, which lists PUBLISHED lessons — homework assigned
// before publication pointed nowhere. This route depends only on the
// homework row itself (getById enforces ownership), so an assignment is
// always openable from Study or a notification.

import { use } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/shared/icons";
import { HomeworkEditor } from "@/components/homework/HomeworkEditor";
import { toast } from "sonner";
import { dueColors, dueState } from "@/lib/homeworkDue";

export default function StudentHomeworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const hw = useQuery(api.homework.getById, { id: id as Id<"homework"> });
  const updateContent = useMutation(api.homework.updateContent);
  const submit = useMutation(api.homework.submit);
  const t = useTranslations("app.homework");
  const tc = useTranslations("common");
  const locale = useLocale();

  if (hw === undefined) {
    return <div className="body" style={{ padding: 40, textAlign: "center" }}>{tc("loading")}</div>;
  }
  if (hw === null) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", textAlign: "center" }}>
        <div className="h2" style={{ marginBottom: 8 }}>{t("notFound")}</div>
        <p className="body" style={{ marginBottom: 16 }}>
          {t("notFoundDetail")}
        </p>
        <Link href="/student/study" className="btn btn-secondary">{t("backToStudy")}</Link>
      </div>
    );
  }

  const editable = hw.status === "assigned" || hw.status === "in_progress";
  const due = editable
    ? dueState(hw.dueAt, new Date(), locale, {
        dueTodayAt: (time) => t("dueTodayAt", { time }),
        dueTomorrowAt: (time) => t("dueTomorrowAt", { time }),
        wasDueTodayAt: (time) => t("wasDueTodayAt", { time }),
        wasDueYesterday: t("wasDueYesterday"),
        dueDate: (date) => t("dueDate", { date }),
        wasDueDate: (date) => t("wasDueDate", { date }),
        dueWeekday: (weekday) => t("dueWeekday", { weekday }),
      })
    : { label: "", tone: "none" as const };
  const dc = dueColors(due.tone);
  const statusLabel =
    hw.status === "in_progress"
      ? t("started")
      : hw.status === "submitted"
        ? t("waiting")
        : hw.status === "reviewed"
          ? t("reviewed")
          : t("notStarted");

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <Link href="/student/study" className="body-sm" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="chevronLeft" size={14} /> {t("backToStudy")}
          </Link>
          <h1 className="h1" style={{ margin: "4px 0 0" }}>{hw.title}</h1>
        </div>
        <div style={{ textAlign: "right" }}>
          {due.label && (
            <span
              className="pill"
              style={{ background: dc.bg, color: dc.fg, fontWeight: 600, marginInlineEnd: 6 }}
            >
              {due.label}
            </span>
          )}
          <span className="pill pill-tenant">{statusLabel}</span>
          {hw.status === "reviewed" && hw.maxScore ? (
            <div className="body-sm" style={{ marginTop: 4, fontWeight: 700 }}>
              {t("score", { score: hw.score ?? 0, max: hw.maxScore })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <HomeworkEditor
          documentId={hw._id}
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
                toast.success(t("submittedToast"));
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            {t("submit")}
          </button>
        )}
        {hw.status === "submitted" && (
          <p className="body-sm" style={{ marginTop: 14 }}>
            {t("submittedSub")}
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
            <strong>{t("teacherFeedback")}</strong> {hw.teacherComment}
          </div>
        )}
      </div>
    </div>
  );
}
