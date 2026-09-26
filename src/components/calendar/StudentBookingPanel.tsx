"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatTime, type TimeFormat } from "@/lib/timeFormat";
import type { BookingPeriod, BookingStart, WeeklyPattern } from "@/lib/calendarBookingPlan";
import {
  BookingReview,
  type BookingPreviewConflict,
  type BookingPreviewItem,
  type BookingReviewContext,
} from "./BookingReview";

type PatternRow = WeeklyPattern & { id: string };

type PanelEvent = {
  _id: string;
  startTime: string;
  endTime: string;
  title: string;
  status: string;
};

type AvailabilityRange = { startTime: string; endTime: string };

export type WeeklyOccurrenceState =
  | "available"
  | "alreadyBooked"
  | "needsAttention"
  | "outsideWindow"
  | "checking";

export type WeeklyCoverage = {
  available: number;
  alreadyBooked: number;
  needsAttention: number;
  outsideWindow: number;
  checking: number;
};

type StudentBookingPanelProps = {
  teacherName: string;
  selectedDate: string;
  selectedDateLabel: string;
  viewerTimezone: string;
  timeFormat: TimeFormat;
  lessonMinutes: number;
  bufferMinutes: number;
  lessonsLeft: number;
  selectedEvents: PanelEvent[];
  availabilityRanges: AvailabilityRange[];
  availableStarts: string[];
  plannedStarts: string[];
  staged: BookingStart[];
  weeklyPeriod: BookingPeriod;
  weeklyPeriodLabel: string;
  weeklyMonthOffset: 0 | 1;
  weeklyPatterns: PatternRow[];
  weeklyOccurrences: BookingStart[];
  weeklyOccurrenceLabels: BookingStart[];
  weeklyOccurrenceStates: WeeklyOccurrenceState[];
  weeklyCoverage: WeeklyCoverage;
  previewReady: boolean;
  onModeChange: (mode: "flexible" | "weekly") => void;
  bookingMode: "flexible" | "weekly";
  onToggleStart: (startTime: string) => void;
  onAddWeeklyPair: () => void;
  onUpdateWeeklyPair: (id: string, patch: Partial<WeeklyPattern>) => void;
  onRemoveWeeklyPair: (id: string) => void;
  onWeeklyMonthOffsetChange: (offset: 0 | 1) => void;
  onAddWeeklyPattern: () => void;
  onClear: () => void;
  onReview: () => void;
  reviewOpen: boolean;
  previewItems: BookingPreviewItem[];
  previewConflicts: BookingPreviewConflict[];
  bookingContext: BookingReviewContext | null;
  reviewCount: number;
  confirming: boolean;
  onKeepEditing: () => void;
  onRemoveOccurrence: (booking: BookingStart) => void;
  onReplaceOccurrence: (booking: BookingStart, viewerDate: string, viewerStartTime: string) => void;
  onConfirm: () => void;
};

const WEEKDAYS: readonly [number, string][] = [
  [1, "monday"],
  [2, "tuesday"],
  [3, "wednesday"],
  [4, "thursday"],
  [5, "friday"],
  [6, "saturday"],
  [0, "sunday"],
];

export function StudentBookingPanel({
  teacherName,
  selectedDate,
  selectedDateLabel,
  viewerTimezone,
  timeFormat,
  lessonMinutes,
  bufferMinutes,
  lessonsLeft,
  selectedEvents,
  availabilityRanges,
  availableStarts,
  plannedStarts,
  staged,
  weeklyPeriod,
  weeklyPeriodLabel,
  weeklyMonthOffset,
  weeklyPatterns,
  weeklyOccurrences,
  weeklyOccurrenceLabels,
  weeklyOccurrenceStates,
  weeklyCoverage,
  previewReady,
  bookingMode,
  onModeChange,
  onToggleStart,
  onAddWeeklyPair,
  onUpdateWeeklyPair,
  onRemoveWeeklyPair,
  onWeeklyMonthOffsetChange,
  onAddWeeklyPattern,
  onClear,
  onReview,
  reviewOpen,
  previewItems,
  previewConflicts,
  bookingContext,
  reviewCount,
  confirming,
  onKeepEditing,
  onRemoveOccurrence,
  onReplaceOccurrence,
  onConfirm,
}: StudentBookingPanelProps) {
  const t = useTranslations("app.calendar");
  const selectedKeys = useMemo(
    () => new Set(plannedStarts),
    [plannedStarts]
  );

  return (
    <aside className="student-booking-panel" data-testid="student-booking-panel" aria-label={t("bookingEntryTitle")}>
      <div className="student-booking-panel-header">
        <div>
          <p className="body-sm student-booking-eyebrow">{t("bookingEntryEyebrow")}</p>
          <h2 className="h3" style={{ margin: 0 }}>{t("bookingEntryTitle")}</h2>
          <p className="body-sm" style={{ marginTop: 4 }}>
            {t("bookingEntryHelp")}
          </p>
        </div>
        <span className="student-booking-balance">{t("lessonsLeftPill", { count: lessonsLeft })}</span>
      </div>

      <div className="student-booking-context">
        <strong>{teacherName}</strong>
        <span>{t("timezoneContext", { timezone: viewerTimezone })}</span>
        <span>{t("lessonShape", { lesson: lessonMinutes, buffer: bufferMinutes })}</span>
      </div>

      {reviewOpen ? (
        <BookingReview
          presentation="inline"
          teacherName={teacherName}
          staged={staged}
          previewItems={previewItems}
          previewConflicts={previewConflicts}
          bookingContext={bookingContext}
          academyTimezone={bookingContext?.academyTimezone ?? viewerTimezone}
          viewerTimezone={viewerTimezone}
          timeFormat={timeFormat}
          previewReady={previewReady}
          reviewCount={reviewCount}
          confirming={confirming}
          onKeepEditing={onKeepEditing}
          onRemove={onRemoveOccurrence}
          onReplace={onReplaceOccurrence}
          onConfirm={onConfirm}
        />
      ) : (
        <>
      <div className="student-booking-methods" role="tablist" aria-label={t("bookingMethodLabel")}>
        <button
          type="button"
          role="tab"
          aria-selected={bookingMode === "flexible"}
          className={bookingMode === "flexible" ? "student-booking-method is-active" : "student-booking-method"}
          onClick={() => onModeChange("flexible")}
        >
          {t("chooseIndividualDates")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={bookingMode === "weekly"}
          className={bookingMode === "weekly" ? "student-booking-method is-active" : "student-booking-method"}
          onClick={() => onModeChange("weekly")}
        >
          {t("weeklySchedule")}
        </button>
      </div>

      {bookingMode === "flexible" ? (
        <section className="student-booking-day" aria-labelledby="student-booking-selected-day">
          <div className="student-booking-day-heading">
            <div>
              <p className="body-sm student-booking-eyebrow">{t("selectedDay")}</p>
              <h3 id="student-booking-selected-day" className="h3" style={{ margin: 0 }}>{selectedDateLabel}</h3>
            </div>
            <span className="body-sm" aria-live="polite">
              {plannedStarts.length > 0 ? t("selectedNotBooked", { count: plannedStarts.length }) : t("notBookedYet")}
            </span>
          </div>

          {selectedEvents.length > 0 && (
            <div className="student-booking-day-events" aria-label={t("bookedStatus")}>
              <p className="body-sm font-semibold">{t("bookedStatus")}</p>
              {selectedEvents.map((event) => (
                <div key={event._id} className="student-booking-event-row">
                  <span>{formatTime(event.startTime, timeFormat)}–{formatTime(event.endTime, timeFormat)}</span>
                  <span>{event.title || t("myLessonTitle")}</span>
                </div>
              ))}
            </div>
          )}

          {availabilityRanges.length > 0 && (
            <div className="student-booking-windows" aria-label={t("availabilityWindows")}>
              <span className="body-sm font-semibold">{t("availabilityWindows")}</span>
              {availabilityRanges.map((range) => (
                <span key={`${range.startTime}-${range.endTime}`} className="student-booking-window">
                  {formatTime(range.startTime, timeFormat)}–{formatTime(range.endTime, timeFormat)}
                </span>
              ))}
            </div>
          )}

          <div className="student-booking-starts" aria-label={t("availableStartsTitle")}>
            <div className="student-booking-section-heading">
              <h3 className="body font-semibold" style={{ margin: 0 }}>{t("availableStartsTitle")}</h3>
              <span className="body-sm">{t("selectedStartHelp")}</span>
            </div>
            {availableStarts.length === 0 ? (
              <p className="student-booking-empty" role="status">
                {availabilityRanges.length === 0 ? t("noAvailabilityForDate") : t("noFit", { minutes: lessonMinutes })}
              </p>
            ) : (
              <div className="student-booking-start-grid" role="list">
                {availableStarts.map((startTime) => {
                  const selected = selectedKeys.has(startTime);
                  return (
                    <div key={`${selectedDate}|${startTime}`} role="listitem">
                      <button
                        type="button"
                        aria-pressed={selected}
                        className={selected ? "student-booking-start is-selected" : "student-booking-start"}
                        onClick={() => onToggleStart(startTime)}
                      >
                        <span>{formatTime(startTime, timeFormat)}</span>
                        <small>{selected ? t("selectedState") : t("availableStart")}</small>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="student-booking-weekly" aria-labelledby="student-booking-weekly-title">
          <div className="student-booking-day-heading">
            <div>
              <p className="body-sm student-booking-eyebrow">{t("weeklySchedule")}</p>
              <h3 id="student-booking-weekly-title" className="h3" style={{ margin: 0 }}>{weeklyPeriodLabel}</h3>
            </div>
            <div className="student-booking-period-toggle" role="group" aria-label={t("bookingMonth")}>
              <button type="button" className={weeklyMonthOffset === 0 ? "is-active" : ""} onClick={() => onWeeklyMonthOffsetChange(0)}>{t("thisMonth")}</button>
              <button type="button" className={weeklyMonthOffset === 1 ? "is-active" : ""} onClick={() => onWeeklyMonthOffsetChange(1)}>{t("nextMonth")}</button>
            </div>
          </div>
          <p className="body-sm">{t("weeklyPatternHelp")} {weeklyPeriod.fromDate} → {weeklyPeriod.toDate}</p>
          <div className="student-booking-patterns">
            {weeklyPatterns.map((pattern, index) => (
              <div key={pattern.id} className="student-booking-pattern-row">
                <span className="body-sm" aria-hidden>{index + 1}.</span>
                <label className="body-sm">
                  {t("weekday")}
                  <select className="select" value={pattern.dayOfWeek} onChange={(event) => onUpdateWeeklyPair(pattern.id, { dayOfWeek: Number(event.target.value) })}>
                    {WEEKDAYS.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}
                  </select>
                </label>
                <label className="body-sm">
                  {t("startTime")}
                  <input className="input" type="time" step={15 * 60} value={pattern.startTime} onChange={(event) => onUpdateWeeklyPair(pattern.id, { startTime: event.target.value })} />
                </label>
                <button type="button" className="btn btn-ghost btn-sm" disabled={weeklyPatterns.length <= 1} onClick={() => onRemoveWeeklyPair(pattern.id)}>{t("removePattern")}</button>
              </div>
            ))}
          </div>
          <div className="student-booking-weekly-actions">
            <Button type="button" size="sm" variant="outline" onClick={onAddWeeklyPair}>{t("addPattern")}</Button>
            <Button type="button" size="sm" onClick={onAddWeeklyPattern} disabled={weeklyOccurrences.length === 0}>
              {t("addWeeklyDates")}
            </Button>
          </div>
          <div className="student-booking-preview" aria-live="polite">
            <div className="student-booking-section-heading">
              <h3 className="body font-semibold" style={{ margin: 0 }}>{t("weeklyPreviewTitle")}</h3>
              <span className="body-sm">{t("weeklyPreviewCount", { count: weeklyOccurrences.length })}</span>
            </div>
            <p className="body-sm student-booking-coverage">
              {t("weeklyCoverageSummary", weeklyCoverage)}
            </p>
            {weeklyOccurrences.length === 0 ? (
              <p className="student-booking-empty">{t("weeklyNoDates")}</p>
            ) : (
              <ul className="student-booking-preview-list">
                {weeklyOccurrenceLabels.slice(0, 8).map((occurrence, index) => {
                  const state = weeklyOccurrenceStates[index] ?? "checking";
                  const stateKey = state === "available"
                    ? "weeklyOccurrenceAvailable"
                    : state === "alreadyBooked"
                      ? "weeklyOccurrenceAlreadyBooked"
                      : state === "needsAttention"
                        ? "weeklyOccurrenceNeedsAttention"
                        : state === "outsideWindow"
                          ? "weeklyOccurrenceOutside"
                          : "weeklyOccurrenceChecking";
                  return (
                  <li key={`${occurrence.date}|${occurrence.startTime}`}>
                    <span>
                      {occurrence.date} · {formatTime(occurrence.startTime, timeFormat)}
                    </span>
                    <span className={`student-booking-occurrence-status is-${state}`}>
                      {t(stateKey)}
                    </span>
                  </li>
                  );
                })}
                {weeklyOccurrences.length > 8 && <li className="body-sm">{t("moreOccurrences", { count: weeklyOccurrences.length - 8 })}</li>}
              </ul>
            )}
          </div>
        </section>
      )}

      {staged.length > 0 && (
        <div className="student-booking-actions" data-testid="student-calendar-booking-actions" aria-label={t("reviewDraftLabel")}>
          <div>
            <strong>{t("stagedCount", { count: staged.length })}</strong>
            <span className="body-sm">{previewReady ? t("selectedNotBooked", { count: reviewCount }) : t("checkingState")}</span>
          </div>
          <div className="student-booking-action-buttons">
            <Button type="button" size="sm" variant="outline" onClick={onClear}>{t("clearStaged")}</Button>
            <Button type="button" size="sm" disabled={!previewReady} onClick={onReview}>{t("reviewDraftLabel")} · {reviewCount}</Button>
          </div>
        </div>
      )}

      {staged.length > 0 && (
        <div className="student-booking-mobile-review" data-testid="student-calendar-mobile-review">
          <div>
            <strong>{t("stagedCount", { count: staged.length })}</strong>
            <span>{previewReady ? t("selectedNotBooked", { count: reviewCount }) : t("checkingState")}</span>
          </div>
          <Button type="button" size="sm" disabled={!previewReady} onClick={onReview}>{t("reviewDraftLabel")}</Button>
        </div>
      )}
        </>
      )}
    </aside>
  );
}
