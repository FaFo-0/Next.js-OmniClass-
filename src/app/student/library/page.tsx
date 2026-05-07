"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { Icon } from "@/components/shared/icons";

interface ReadingViewProps {
  materialId: Id<"libraryMaterials">;
  mode?: "student" | "teacher";
  onClose: () => void;
}

function ReadingView({ materialId, mode = "student", onClose }: ReadingViewProps) {
  const material = useQuery(api.library.get, { id: materialId });
  const [selectedWord, setSelectedWord] = useState<{
    word: string; definition: string; partOfSpeech: string; ipa?: string; audioUrl?: string;
  } | null>(null);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [fontSize, setFontSize] = useState(18);

  if (material === undefined) return <div style={{ padding: 40, textAlign: "center" }} className="body">Loading…</div>;
  if (material === null) return <div style={{ padding: 40, textAlign: "center" }} className="body">Material not found.</div>;

  const text = material.contentMarkdown || "No content.";

  const handleWordClick = (word: string, e: React.MouseEvent) => {
    const clean = word.toLowerCase().replace(/[.,!?;:"'—]/g, "");
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPopoverPos({ x: rect.left + rect.width / 2, y: rect.bottom + window.scrollY });
    setSelectedWord({ word: clean, definition: "Look up definition...", partOfSpeech: "" });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,17,12,0.6)", zIndex: 200, display: "flex", alignItems: "stretch", padding: 24 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ flex: 1, maxWidth: 960, margin: "0 auto", background: "white", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "var(--shadow-modal)" }}>
        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--omnic-gray-200)", display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><Icon name="x" size={18} /></button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--omnic-gray-900)" }}>{material.title}</div>
            <div className="body-sm">
              {material.description && `${material.description} · `}
              <span className="pill pill-tenant" style={{ fontSize: 10 }}>CEFR {material.levelCEFR ?? "—"}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid var(--omnic-gray-200)", borderRadius: 6, padding: 2 }}>
            <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setFontSize(Math.max(14, fontSize - 2))}>A−</button>
            <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 14 }} onClick={() => setFontSize(Math.min(26, fontSize + 2))}>A+</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "32px 56px", background: "#FFFEF8" }}>
          {text.split("\n").filter(Boolean).map((paragraph: string, idx: number) => {
            const tokens = paragraph.split(/(\s+)/);
            return (
              <p key={idx} style={{ marginBottom: 18, lineHeight: 1.75, fontSize, color: "var(--omnic-gray-800)" }}>
                {tokens.map((tok: string, i: number) => {
                  if (/^\s+$/.test(tok)) return tok;
                  const clean = tok.toLowerCase().replace(/[.,!?;:"'—]/g, "");
                  const isWord = /[a-zA-Z]/.test(clean);
                  return (
                    <span key={i} onClick={isWord ? (e) => handleWordClick(tok, e) : undefined}
                      style={{
                        cursor: isWord ? "pointer" : "default",
                        borderBottom: isWord ? "1px dashed rgba(91,33,182,0.3)" : "none",
                        transition: "background 0.12s",
                      }}>
                      {tok}
                    </span>
                  );
                })}
              </p>
            );
          })}
        </div>

        <div style={{ padding: "12px 24px", borderTop: "1px solid var(--omnic-gray-200)", background: "var(--omnic-gray-50)", display: "flex", alignItems: "center", gap: 16 }}>
          <div className="body-sm" style={{ flex: 1 }}>Click any underlined word to look it up.</div>
          <div className="body-sm">Font: {fontSize}px</div>
        </div>
      </div>

      {selectedWord && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: Math.min(popoverPos.x - 160, window.innerWidth - 340), top: popoverPos.y + 8, width: 320, background: "white", borderRadius: 12, boxShadow: "var(--shadow-modal)", padding: 18, zIndex: 300, border: "1px solid var(--omnic-gray-200)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--omnic-gray-900)" }}>{selectedWord.word}</div>
              {selectedWord.ipa && <div style={{ fontSize: 12, color: "var(--omnic-gray-500)", fontFamily: "ui-monospace, monospace", marginTop: 2 }}>{selectedWord.ipa}</div>}
            </div>
            <button className="btn-ghost" style={{ padding: 6 }} onClick={() => setSelectedWord(null)}>
              <Icon name="x" size={14} stroke="var(--omnic-tenant-primary)" />
            </button>
          </div>
          {selectedWord.partOfSpeech && <div className="pill pill-new" style={{ fontSize: 10, marginBottom: 8 }}>{selectedWord.partOfSpeech}</div>}
          <div style={{ fontSize: 14, color: "var(--omnic-gray-800)", marginBottom: 14, lineHeight: 1.5 }}>{selectedWord.definition}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedWord(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  const [reading, setReading] = useState<Id<"libraryMaterials"> | null>(null);
  const [filter, setFilter] = useState("all");
  const materials = useQuery(api.library.listPublished) ?? [];

  const items = materials.filter((b: any) => filter === "all" || b.levelCEFR === filter);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Library</h1>
          <div className="body" style={{ marginTop: 4 }}>Read assigned books and articles. Tap any word to look it up and save to flashcards.</div>
        </div>
      </div>

      <div style={{ marginBottom: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { value: "all", label: "All" },
          { value: "A2", label: "A2 — Elementary" },
          { value: "B1", label: "B1 — Intermediate" },
          { value: "B2", label: "B2 — Upper Int." },
          { value: "C1", label: "C1 — Advanced" },
        ].map((c) => (
          <button key={c.value} className="chip" onClick={() => setFilter(c.value)}
            style={filter === c.value ? { background: "var(--brand-purple)", color: "#FFFFFF", borderColor: "var(--brand-purple)", boxShadow: "0 2px 10px rgba(103,22,164,0.25)" } : {}}>
            {c.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
        {items.map((b: any) => (
          <div key={b._id} className="card" style={{ overflow: "hidden", cursor: "pointer", transition: "transform 0.12s, box-shadow 0.12s" }}
            onClick={() => setReading(b._id)}
            onMouseEnter={(e: any) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--shadow-card-hover)"; }}
            onMouseLeave={(e: any) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
            <div style={{ height: 160, background: "linear-gradient(135deg, var(--brand-purple), var(--brand-purple-hover))", display: "flex", alignItems: "flex-end", padding: 14, color: "white", position: "relative" }}>
              <div style={{ position: "absolute", top: 12, right: 12 }}>
                {b.levelCEFR && <span className="pill" style={{ background: "rgba(255,255,255,0.25)", color: "white", fontSize: 10, fontWeight: 700 }}>{b.levelCEFR}</span>}
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{b.kind ?? "Article"}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, lineHeight: 1.3 }}>{b.title}</div>
              </div>
            </div>
            <div style={{ padding: 14 }}>
              {b.description && <div className="body-sm" style={{ marginBottom: 8 }}>{b.description}</div>}
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--omnic-gray-500)" }}>
                {b.estimatedReadMinutes && <span><Icon name="clock" size={11} /> {b.estimatedReadMinutes} min</span>}
                {b.topicTags && <span><Icon name="file" size={11} /> {b.topicTags.join(", ")}</span>}
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: "center", gridColumn: "1 / -1" }}>
            <Icon name="layers" size={48} stroke="var(--omnic-gray-300)" />
            <div className="body" style={{ marginTop: 12 }}>No library materials yet. An admin can add them.</div>
          </div>
        )}
      </div>

      {reading && <ReadingView materialId={reading} onClose={() => setReading(null)} />}
    </div>
  );
}
