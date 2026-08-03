"use client";

// My Words — the one list. Everything the student collects while reading, or
// a teacher sends during a lesson, lands here, and the daily flashcards are
// drawn from it. It used to show lesson vocabulary, which was a different set
// of words from the one being studied.

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { toast } from "sonner";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { Icon } from "@/components/shared/icons";
import { useTranslations } from "next-intl";

type Filter = "all" | "learning" | "learned" | "new";

const STATE_LABEL: Record<string, string> = {
  new: "Not studied yet",
  learning: "Learning",
  learned: "Learned",
};

export default function StudentWordsPage() {
  const t = useTranslations("app.vocabulary");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Id<"srsCards"> | null>(null);
  const [draft, setDraft] = useState("");

  const words = useQuery(api.srs.listMyWords, {});
  const remove = useMutation(api.srs.removeWord);
  const editTranslation = useMutation(api.srs.editWordTranslation);
  const loading = words === undefined;
  const all = words ?? [];

  const counts = {
    all: all.length,
    new: all.filter((w) => w.state === "new").length,
    learning: all.filter((w) => w.state === "learning").length,
    learned: all.filter((w) => w.state === "learned").length,
  };
  const dueCount = all.filter((w) => w.due).length;

  const q = search.trim().toLowerCase();
  const filtered = all.filter((w) => {
    if (filter !== "all" && w.state !== filter) return false;
    if (!q) return true;
    return (
      w.word.toLowerCase().includes(q) ||
      (w.translation ?? "").toLowerCase().includes(q)
    );
  });

  const speak = (text: string) => {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      window.speechSynthesis.speak(u);
    }
  };

  async function saveEdit(id: Id<"srsCards">) {
    try {
      await editTranslation({ cardDocId: id, translation: draft });
      toast.success("Translation updated");
      setEditing(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>{t("title")}</h1>
          <div className="body" style={{ marginTop: 4 }}>{t("subtitle")}</div>
        </div>
        {dueCount > 0 && (
          <Link href="/student/study" className="btn btn-tenant">
            {t("studyDue", { count: dueCount })}
          </Link>
        )}
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
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
              ["new", t("notStudied")],
              ["learning", t("learning")],
              ["learned", t("learned")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className="chip"
              onClick={() => setFilter(value)}
              style={
                filter === value
                  ? {
                      background: "var(--brand-purple)",
                      color: "#fff",
                      borderColor: "var(--brand-purple)",
                    }
                  : undefined
              }
            >
              {label}
              <span style={{ fontSize: 11, opacity: 0.7, marginInlineStart: 4 }}>
                {counts[value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th></th>
              <th>{t("colWord")}</th>
              <th>{t("colMeaning")}</th>
              <th>{t("colStatus")}</th>
              <th>{t("colAdded")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6}>
                    <div className="skel" style={{ height: 16, margin: "6px 0" }} />
                  </td>
                </tr>
              ))}
            {!loading &&
              filtered.map((w) => (
                <tr key={w._id}>
                  <td style={{ width: 40 }}>
                    <button onClick={() => speak(w.word)} className="btn-ghost" style={{ padding: 6, borderRadius: 6 }}>
                      <Icon name="speaker" size={14} />
                    </button>
                  </td>
                  <td style={{ fontWeight: 600 }}>{w.word}</td>
                  <td className="muted" dir="auto">
                    {editing === w._id ? (
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          className="search-input"
                          style={{ minWidth: 140 }}
                          value={draft}
                          dir="auto"
                          autoFocus
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveEdit(w._id);
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                        <button className="btn btn-sm btn-tenant" onClick={() => void saveEdit(w._id)}>
                          Save
                        </button>
                      </span>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        title={t("correctTranslation")}
                        style={{ cursor: "text" }}
                        onClick={() => {
                          setEditing(w._id);
                          setDraft(w.translation ?? "");
                        }}
                      >
                        {w.translation ?? (
                          <span style={{ color: "var(--omnic-gray-400)" }}>
                            add a meaning
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className="pill"
                      style={
                        w.state === "learned"
                          ? { background: "rgba(22,163,74,0.14)", color: "#15803D" }
                          : w.state === "learning"
                            ? { background: "#FEF3C7", color: "#92400E" }
                            : undefined
                      }
                    >
                      {STATE_LABEL[w.state]}
                    </span>
                    {w.due && (
                      <span className="body-sm" style={{ marginInlineStart: 8, color: "var(--brand-purple)" }}>
                        due
                      </span>
                    )}
                  </td>
                  <td className="muted">
                    {w.addedAt}
                    {w.addedBy === "teacher" && (
                      <span className="body-sm" style={{ marginInlineStart: 6 }}>
                        · by teacher
                      </span>
                    )}
                  </td>
                  <td style={{ width: 40 }}>
                    <button
                      className="btn-ghost"
                      style={{ padding: 6, borderRadius: 6 }}
                      title={t("removeTitle")}
                      onClick={async () => {
                        try {
                          await remove({ cardDocId: w._id });
                          toast.success(`Removed "${w.word}"`);
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      <Icon name="trash" size={14} stroke="var(--omnic-gray-400)" />
                    </button>
                  </td>
                </tr>
              ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: "center" }} className="body-sm">
                  {search || filter !== "all" ? (
                    t("noMatch")
                  ) : (
                    <>
                      {t("emptyPrefix")}{" "}
                      <Link href="/student/library" style={{ color: "var(--brand-purple)" }}>
                        {t("readSomething")}
                      </Link>{" "}
                      {t("emptySuffix")}
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
