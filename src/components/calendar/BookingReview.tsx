"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatTime, type TimeFormat } from "@/lib/timeFormat";
import { projectBookingForViewer, type BookingStart } from "@/lib/calendarBookingPlan";

export type BookingPreviewItem = BookingStart & {
  ok: boolean;
  alreadyBooked?: boolean;
};

export type BookingPreviewConflict = BookingStart & {
  reason: string;
  reasonKey?: string;
};

export type BookingReviewContext = {
  teacherId: string | null;
  activityTypeId: string;
  lessonMinutes: number;
  pointCost: number;
  academyTimezone: string;
  policyVersion: string;
  bookingUpperExclusiveDate: string;
};

type BookingReviewProps = {
  presentation: "inline" | "sheet";
  teacherName: string;
  staged: BookingStart[];
  previewItems: BookingPreviewItem[];
  previewConflicts: BookingPreviewConflict[];
  bookingContext: BookingReviewContext | null;
  academyTimezone: string;
  viewerTimezone: string;
  timeFormat: TimeFormat;
  previewReady: boolean;
  reviewCount: number;
  confirming: boolean;
  onKeepEditing: () => void;
  onRemove: (booking: BookingStart) => void;
  onReplace: (booking: BookingStart, viewerDate: string, viewerStartTime: string) => void;
  onConfirm: () => void;
};

export function BookingReview({
  presentation,
  teacherName,
  staged,
  previewItems,
  previewConflicts,
  bookingContext,
  academyTimezone,
  viewerTimezone,
  timeFormat,
  previewReady,
  reviewCount,
  confirming,
  onKeepEditing,
  onRemove,
  onReplace,
  onConfirm,
}: BookingReviewProps) {
  const t = useTranslations("app.calendar");
  const headingId = presentation === "inline"
    ? "student-booking-inline-review-title"
    : "student-booking-sheet-review-title";

  return (
    <section
      className={`student-booking-inline-review ${presentation === "sheet" ? "student-booking-sheet-review" : ""}`}
      data-testid={presentation === "inline" ? "student-booking-inline-review" : undefined}
      aria-labelledby={headingId}
    >
      <div className="student-booking-panel-header">
        <div>
          <p className="body-sm student-booking-eyebrow">{t("reviewDraftLabel")}</p>
          <h2 id={headingId} className="h3" style={{ margin: 0 }}>{t("reviewBookingTitle")}</h2>
          <p className="body-sm" style={{ marginTop: 4 }}>{t("reviewBookingHelp")}</p>
        </div>
        <span className="student-booking-balance">{t("reviewCount", { count: reviewCount })}</span>
      </div>

      {bookingContext && (
        <div className="student-booking-review-context">
          <div>{t("reviewTeacher", { name: teacherName })}</div>
          <div>{t("reviewLessonShape", { minutes: bookingContext.lessonMinutes })}</div>
          <div>{t("reviewTimezone", { timezone: bookingContext.academyTimezone })}</div>
          <div>{t("reviewWindow", { date: bookingContext.bookingUpperExclusiveDate })}</div>
        </div>
      )}

      <div className="student-booking-review-list" aria-label={t("reviewOccurrences")}>
        {staged.map((item) => {
          const viewer = projectBookingForViewer(item, academyTimezone, viewerTimezone);
          const result = previewItems.find(
            (candidate) => candidate.date === item.date && candidate.startTime === item.startTime
          );
          const conflict = previewConflicts.find(
            (candidate) => candidate.date === item.date && candidate.startTime === item.startTime
          );
          const status = result?.alreadyBooked
            ? "already"
            : conflict?.reasonKey === "booking.horizon"
              ? "outside"
              : conflict
                ? "attention"
                : result?.ok
                  ? "selected"
                  : "checking";
          const label = status === "already"
            ? t("alreadyBooked")
            : status === "outside"
              ? t("outsideBookingWindow")
              : status === "attention"
                ? t("conflictState")
                : status === "selected"
                  ? t("selectedState")
                  : t("checkingState");

          return (
            <div
              key={`${item.date}|${item.startTime}`}
              className="student-booking-review-row"
              data-review-row={item.date}
            >
              <div className="student-booking-review-row-main">
                <span>
                  {viewer.date} · {formatTime(viewer.startTime, timeFormat)}
                  {viewer.date !== item.date || viewer.startTime !== item.startTime ? (
                    <span className="student-booking-review-academy-time">
                      ({item.date} · {item.startTime} {t("academyTimeShort")})
                    </span>
                  ) : null}
                </span>
                <span className={`student-booking-review-status is-${status}`}>{label}</span>
              </div>
              {conflict && (
                <div className="student-booking-review-repair">
                  <label className="text-xs">
                    {t("replaceDate")}
                    <input className="input" type="date" defaultValue={viewer.date} data-review-date={item.date} />
                  </label>
                  <label className="text-xs">
                    {t("startTime")}
                    <input className="input" type="time" defaultValue={viewer.startTime} data-review-time={item.date} />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      const row = event.currentTarget.closest<HTMLElement>("[data-review-row]");
                      const date = row?.querySelector<HTMLInputElement>("[data-review-date]")?.value ?? viewer.date;
                      const time = row?.querySelector<HTMLInputElement>("[data-review-time]")?.value ?? viewer.startTime;
                      onReplace(item, date, time);
                    }}
                  >
                    {t("replaceOccurrence")}
                  </Button>
                </div>
              )}
              <div className="student-booking-review-row-actions">
                {conflict && <span className="body-sm student-booking-review-reason">{conflict.reason}</span>}
                <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(item)}>
                  {t("removeOccurrence")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {previewReady && reviewCount === 0 && previewConflicts.length === 0 && (
        <p className="student-booking-empty" role="status">{t("allAlreadyBooked")}</p>
      )}
      {previewConflicts.length > 0 && <p className="text-sm text-red-600">{t("reviewFixConflicts")}</p>}

      <div className="student-booking-review-actions">
        <Button type="button" variant="outline" onClick={onKeepEditing}>{t("keepEditing")}</Button>
        <Button
          type="button"
          disabled={confirming || !previewReady || previewConflicts.length > 0 || !bookingContext || reviewCount === 0}
          onClick={onConfirm}
        >
          {confirming ? t("saving") : t("confirmStaged", { count: reviewCount })}
        </Button>
      </div>
    </section>
  );
}
