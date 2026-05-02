"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useTranslations } from "next-intl";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import {
  BookOpen,
  Layers,
  Flame,
  Clock,
  BarChart3,
  TrendingUp,
  CalendarDays,
} from "lucide-react";
import { format, subDays, eachDayOfInterval, endOfWeek } from "date-fns";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Turn an ISO datetime or date string into "YYYY-MM-DD" */
function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Build a map: dateKey -> count from an array of ISO date strings */
function countByDate(dates: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const d of dates) {
    const key = toDateKey(d);
    map[key] = (map[key] ?? 0) + 1;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StudentStatsPage() {
  const t = useTranslations("student.stats");
  // ---- Store selectors (stable references via useMemo) ----
  const { currentUserId } = useAuth();
  const publishedLessons = useQuery(
    api.lessons.getPublishedLessonsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const reviewLogs = useQuery(
    api.study.getReviewLogsForOwner,
    currentUserId ? { ownerId: currentUserId } : "skip"
  ) ?? [];
  const quizAttempts = useQuery(
    api.study.getQuizAttemptsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const studySessions = useQuery(
    api.study.getStudySessionsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const streak = useQuery(
    api.streaks.getStreak,
    currentUserId ? { studentId: currentUserId } : "skip"
  );

  // ---- Derived data ----

  const totalStudyMinutes = useMemo(
    () => studySessions.reduce((sum, s) => sum + s.durationMinutes, 0),
    [studySessions],
  );

  // ---- Activity heatmap data (last 140 days / 20 weeks) ----

  const heatmapData = useMemo(() => {
    const today = new Date();
    const reviewDates = reviewLogs.map((r) => r.reviewedAt);
    const counts = countByDate(reviewDates);

    // We want a grid that ends on Saturday (end of current week)
    // and goes back 20 weeks.
    const weekEnd = endOfWeek(today, { weekStartsOn: 0 }); // Sunday start => Saturday end
    const gridStart = subDays(weekEnd, 20 * 7 - 1);

    const days = eachDayOfInterval({ start: gridStart, end: weekEnd });

    // Group into columns (weeks). Each week is Sun..Sat (7 rows).
    const weeks: Array<Array<{ date: Date; count: number; key: string }>> = [];
    let currentWeek: Array<{ date: Date; count: number; key: string }> = [];

    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      const dayOfWeek = day.getDay(); // 0=Sun

      if (dayOfWeek === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      currentWeek.push({ date: day, count: counts[key] ?? 0, key });
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    return { weeks, gridStart, weekEnd };
  }, [reviewLogs]);

  // Months labels for heatmap
  const monthLabels = useMemo(() => {
    if (heatmapData.weeks.length === 0) return [];

    const labels: Array<{ label: string; col: number }> = [];
    let lastMonth = -1;

    for (let wi = 0; wi < heatmapData.weeks.length; wi++) {
      const firstDay = heatmapData.weeks[wi][0]?.date;
      if (!firstDay) continue;
      const month = firstDay.getMonth();
      if (month !== lastMonth) {
        labels.push({ label: format(firstDay, "MMM"), col: wi });
        lastMonth = month;
      }
    }
    return labels;
  }, [heatmapData]);

  // ---- Quiz chart data (last 20 attempts) ----

  const quizChartData = useMemo(() => {
    const studentAttempts = quizAttempts
      .filter((q) => q.studentId === currentUserId)
      .sort(
        (a, b) =>
          new Date(a.completedAt).getTime() -
          new Date(b.completedAt).getTime(),
      )
      .slice(-20);

    return studentAttempts.map((q) => ({
      date: format(new Date(q.completedAt), "MMM d"),
      score: q.total > 0 ? Math.round((q.score / q.total) * 100) : 0,
    }));
  }, [quizAttempts, currentUserId]);

  // ---- Review activity chart data (last 30 days) ----

  const reviewChartData = useMemo(() => {
    const today = new Date();
    const start = subDays(today, 29);
    const interval = eachDayOfInterval({ start, end: today });

    const reviewDates = reviewLogs.map((r) => r.reviewedAt);
    const counts = countByDate(reviewDates);

    return interval.map((day) => {
      const key = format(day, "yyyy-MM-dd");
      return {
        date: format(day, "MMM d"),
        count: counts[key] ?? 0,
      };
    });
  }, [reviewLogs]);

  // ---- Heatmap cell color ----

  function heatmapColor(count: number): string {
    if (count === 0) return "bg-muted";
    if (count <= 5) return "bg-[oklch(0.75_0.14_145)]";
    if (count <= 15) return "bg-[oklch(0.55_0.16_145)]";
    return "bg-[oklch(0.40_0.15_145)]";
  }

  // ---- Render ----

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 1. Overview Cards                                                */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Lessons completed */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{publishedLessons.length}</p>
              <p className="text-xs text-muted-foreground">
                {t("lessonsCompleted")}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Cards reviewed */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{reviewLogs.length}</p>
              <p className="text-xs text-muted-foreground">{t("cardsReviewed")}</p>
            </div>
          </CardContent>
        </Card>

        {/* Current streak */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Flame className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {streak?.currentStreak ?? 0}
                <span className="ms-1 text-base" aria-hidden="true">
                  {(streak?.currentStreak ?? 0) > 0 ? "\uD83D\uDD25" : ""}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{t("dayStreak")}</p>
            </div>
          </CardContent>
        </Card>

        {/* Study time */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {totalStudyMinutes < 60
                  ? `${totalStudyMinutes}m`
                  : `${Math.floor(totalStudyMinutes / 60)}h ${totalStudyMinutes % 60}m`}
              </p>
              <p className="text-xs text-muted-foreground">{t("studyTime")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 2. Activity Heatmap                                              */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {t("activity")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reviewLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">
                {t("noActivity")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {t("startReviewing")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Month labels row */}
              <div className="flex gap-[3px]" style={{ paddingInlineStart: "28px", marginBlockEnd: "4px" }}>
                {heatmapData.weeks.map((_, wi) => {
                  const label = monthLabels.find((m) => m.col === wi);
                  return (
                    <div
                      key={wi}
                      className="text-[10px] leading-none text-muted-foreground"
                      style={{ width: "13px", flexShrink: 0 }}
                    >
                      {label?.label ?? ""}
                    </div>
                  );
                })}
              </div>

              {/* Heatmap: day labels + grid */}
              <div className="flex gap-[3px]">
                {/* Day-of-week labels */}
                <div
                  className="grid gap-[3px]"
                  style={{
                    gridTemplateRows: "repeat(7, 13px)",
                    width: "24px",
                    flexShrink: 0,
                  }}
                >
                  {Array.from({ length: 7 }).map((_, row) => (
                    <div key={row} className="flex items-center">
                      <span className="text-[10px] leading-none text-muted-foreground">
                        {row === 1 ? t("mon") : row === 3 ? t("wed") : row === 5 ? t("fri") : ""}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Cell grid */}
                <div
                  className="grid gap-[3px]"
                  style={{
                    gridTemplateColumns: `repeat(${heatmapData.weeks.length}, 13px)`,
                    gridTemplateRows: "repeat(7, 13px)",
                    gridAutoFlow: "column",
                  }}
                >
                  {heatmapData.weeks.map((week, col) =>
                    Array.from({ length: 7 }).map((_, row) => {
                      const cell = week.find((d) => d.date.getDay() === row);
                      if (!cell) {
                        return <div key={`${col}-${row}`} />;
                      }
                      return (
                        <div
                          key={cell.key}
                          title={`${format(cell.date, "MMM d, yyyy")}: ${cell.count} review${cell.count !== 1 ? "s" : ""}`}
                          className={`rounded-sm ${heatmapColor(cell.count)}`}
                        />
                      );
                    }),
                  )}
                </div>
              </div>

              {/* Legend */}
              <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                <span>{t("less")}</span>
                <div className="h-[11px] w-[11px] rounded-sm bg-muted" />
                <div className="h-[11px] w-[11px] rounded-sm bg-[oklch(0.75_0.14_145)]" />
                <div className="h-[11px] w-[11px] rounded-sm bg-[oklch(0.55_0.16_145)]" />
                <div className="h-[11px] w-[11px] rounded-sm bg-[oklch(0.40_0.15_145)]" />
                <span>{t("more")}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* 3. Quiz Scores                                                   */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            {t("quizScores")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {quizChartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">
                {t("noQuizzes")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {t("completeQuiz")}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={quizChartData}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="oklch(0.80 0.02 145)"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  formatter={(value) => [`${value}%`, "Score"]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid oklch(0.90 0.02 145)",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="score"
                  fill="oklch(0.50 0.15 145)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* 4. Review Activity (last 30 days)                                */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            {t("reviewActivity")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reviewLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingUp className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">
                {t("noReviews")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {t("startFlashcards")}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart
                data={reviewChartData}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
              >
                <defs>
                  <linearGradient
                    id="reviewAreaFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="oklch(0.50 0.15 145)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor="oklch(0.50 0.15 145)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="oklch(0.80 0.02 145)"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value) => [value, "Cards reviewed"]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid oklch(0.90 0.02 145)",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="oklch(0.50 0.15 145)"
                  strokeWidth={2}
                  fill="url(#reviewAreaFill)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
