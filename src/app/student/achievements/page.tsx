"use client";

// Achievements. Progress is computed from the same counters the unlock
// engine reads (`convex/achievements.ts`), so a full bar always means the
// next qualifying event unlocks it — never a bar that can't move.

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";
import { useLocale, useTranslations } from "next-intl";

const CONDITION_LABEL: Record<string, "lessons" | "cardsReviewed" | "perfectQuizzes" | "dayStreak" | "wordsLearned"> = {
  lessons_completed: "lessons",
  cards_reviewed: "cardsReviewed",
  quiz_perfect: "perfectQuizzes",
  streak_days: "dayStreak",
  vocab_learned: "wordsLearned",
};

export default function StudentAchievementsPage() {
  const t = useTranslations("app.achievements");
  const locale = useLocale();
  const achievements = useQuery(api.achievements.listForStudent, {});
  const streak = useQuery(api.streaks.getForStudent, {});
  const studyMinutes = useQuery(api.study.totalStudyMinutes, {}) ?? 0;
  const sync = useMutation(api.achievements.syncMine);

  // Counters can move without passing through a mutation of ours (a teacher
  // marking a lesson complete, data seeded, a student who predates the
  // engine). Opening the page settles up.
  useEffect(() => {
    sync({}).catch(() => {});
  }, [sync]);

  const loading = achievements === undefined;
  const all = achievements ?? [];
  const unlocked = all.filter((a) => a.unlocked).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>{t("title")}</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {loading ? "…" : t("progress", { unlocked, total: all.length })}
          </div>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <LocalStat label={t("unlocked")} value={`${unlocked}/${all.length}`} icon="award" />
        <LocalStat label={t("currentStreak")} value={t("days", { count: streak?.currentStreak ?? 0 })} icon="flame" accent="red" />
        <LocalStat label={t("longestStreak")} value={t("days", { count: streak?.longestStreak ?? 0 })} icon="zap" />
        <LocalStat label={t("studyTime")} value={t("hours", { count: (studyMinutes / 60).toFixed(1) })} icon="clock" />
      </div>

      <div className="grid-3">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <div className="skel" style={{ height: 40, width: 40, borderRadius: 10, marginBottom: 12 }} />
              <div className="skel" style={{ height: 14, width: "60%", marginBottom: 8 }} />
              <div className="skel" style={{ height: 12, width: "85%" }} />
            </div>
          ))}
        {!loading &&
          all.map((a) => {
            const pct = Math.round((a.progress / a.conditionThreshold) * 100);
            return (
              <div key={a._id} className={`card achv-card ${a.unlocked ? "achv-unlocked" : "achv-locked"}`}>
                <div className="achv-icon">{a.unlocked ? (a.icon || "🎯") : "🔒"}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--omnic-gray-900)", marginBottom: 4 }}>{a.name}</div>
                <div className="body-sm" style={{ marginBottom: 10 }}>{a.description}</div>
                {a.unlocked && a.unlockedAt ? (
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--omnic-tenant-primary)" }}>
                    {t("earned", { date: new Date(a.unlockedAt).toLocaleDateString(locale) })}
                  </div>
                ) : (
                  <>
                    <div className="progress" style={{ marginBottom: 6 }}>
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="body-sm">
                      {a.progress} / {a.conditionThreshold}{" "}
                      {CONDITION_LABEL[a.conditionType] ? t(CONDITION_LABEL[a.conditionType]) : ""}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        {!loading && all.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: "center", gridColumn: "1 / -1" }}>
            <Icon name="award" size={48} stroke="var(--omnic-gray-300)" />
            <div className="body" style={{ marginTop: 12 }}>{t("empty")}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function LocalStat({ label, value, icon, accent }: { label: string; value: string; icon: string; accent?: string }) {
  return (
    <div className="card" style={{ padding: "var(--pad-card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: accent === "red" ? "var(--omnic-red-tint)" : "var(--omnic-tenant-primary-soft)", color: accent === "red" ? "var(--omnic-red)" : "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={18} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 14, color: "var(--omnic-gray-900)", letterSpacing: "-0.02em" }}>{value}</div>
      <div className="body-sm" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}
