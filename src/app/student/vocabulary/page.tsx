"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";

export default function StudentVocabularyPage() {
  const [search, setSearch] = useState("");
  const vocab = useQuery(api.lessonContent.listAllVocab, {}) ?? [];

  const filtered = vocab.filter(
    (v: any) =>
      v.word.toLowerCase().includes(search.toLowerCase()) ||
      v.translation.toLowerCase().includes(search.toLowerCase())
  );

  const speak = (text: string) => {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      window.speechSynthesis.speak(u);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>My Words</h1>
          <div className="body" style={{ marginTop: 4 }}>{vocab.length} words across all lessons</div>
        </div>
        <button className="btn btn-tenant"><Icon name="plus" size={14} /> Create deck</button>
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="search-wrap">
          <Icon name="search" size={15} stroke="var(--omnic-gray-400)" />
          <input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search words..." />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { value: "all", label: "All", count: vocab.length },
            { value: "recent", label: "Recent" },
            { value: "lesson", label: "By Lesson" },
          ].map((c) => (
            <button key={c.value} className="chip">
              {c.label}
              {c.count != null && <span style={{ fontSize: 11, opacity: 0.7 }}>{c.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th></th>
              <th>Word</th>
              <th>Translation</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v: any, i: number) => (
              <tr key={v._id ?? i}>
                <td style={{ width: 40 }}>
                  <button onClick={() => speak(v.word)} className="btn-ghost" style={{ padding: 6, borderRadius: 6 }}>
                    <Icon name="speaker" size={14} />
                  </button>
                </td>
                <td style={{ fontWeight: 600 }}>{v.word}</td>
                <td className="muted">{v.translation}</td>
                <td><span className="pill pill-new">{v.partOfSpeech ?? "—"}</span></td>
                <td style={{ width: 32 }}><Icon name="chevronRight" size={14} stroke="var(--omnic-gray-400)" /></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: "center" }} className="body-sm">
                  {search ? "No words match your search." : "No vocabulary yet. Words will appear once your teacher generates them from lessons."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
