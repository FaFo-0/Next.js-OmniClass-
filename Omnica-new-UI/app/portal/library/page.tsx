"use client"

import { useState } from "react"
import { Icon } from "@/components/shared/icons"
import { MOCK } from "@/lib/mock-data"

interface ReadingViewProps {
  mode?: "student" | "teacher" | "admin"
  onClose: () => void
}

function ReadingView({ mode = "student", onClose }: ReadingViewProps) {
  const [selectedWord, setSelectedWord] = useState<{
    word: string
    phonetic: string
    pos: string
    meaning: string
    example: string
  } | null>(null)
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 })
  const [savedWords, setSavedWords] = useState<string[]>([])
  const [fontSize, setFontSize] = useState(18)
  const [activeStudent, setActiveStudent] = useState("Amira Hassan")
  const passage = MOCK.readingPassage!

  const handleWordClick = (word: string, e: React.MouseEvent) => {
    const clean = word.toLowerCase().replace(/[.,!?;:"'—]/g, "")
    const def = (MOCK.dictionary as Record<string, any>)[clean]
    if (!def) return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setPopoverPos({ x: rect.left + rect.width / 2, y: rect.bottom + window.scrollY })
    setSelectedWord({ word: clean, ...def })
  }

  const addCurrent = () => {
    if (!selectedWord) return
    setSavedWords([...savedWords, selectedWord.word])
    setSelectedWord(null)
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,17,12,0.6)", zIndex: 200, display: "flex", alignItems: "stretch", padding: 24 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ flex: 1, maxWidth: 960, margin: "0 auto", background: "white", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "var(--shadow-modal)" }}>
        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--omnic-gray-200)", display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 6 }}><Icon name="x" size={18} /></button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--omnic-gray-900)" }}>{passage.title}</div>
            <div className="body-sm">{passage.author} · <span className="pill pill-tenant" style={{ fontSize: 10 }}>CEFR {passage.cefr}</span></div>
          </div>
          {mode === "teacher" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--omnic-tenant-primary-soft)", padding: "6px 12px", borderRadius: 999 }}>
              <Icon name="user" size={14} stroke="var(--omnic-tenant-primary)" />
              <select value={activeStudent} onChange={(e) => setActiveStudent(e.target.value)} style={{ border: "none", background: "transparent", fontWeight: 600, color: "var(--omnic-tenant-primary)", fontSize: 13, cursor: "pointer" }}>
                <option>Amira Hassan</option><option>Carlos Méndez</option><option>Liam O&apos;Connor</option>
              </select>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid var(--omnic-gray-200)", borderRadius: 6, padding: 2 }}>
            <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setFontSize(Math.max(14, fontSize - 2))}>A−</button>
            <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 14 }} onClick={() => setFontSize(Math.min(26, fontSize + 2))}>A+</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "32px 56px", background: "#FFFEF8" }}>
          {passage.paragraphs.map((text, idx) => {
            const tokens = text.split(/(\s+)/)
            return (
              <p key={idx} style={{ marginBottom: 18, lineHeight: 1.75, fontSize, color: "var(--omnic-gray-800)" }}>
                {tokens.map((tok, i) => {
                  if (/^\s+$/.test(tok)) return tok
                  const clean = tok.toLowerCase().replace(/[.,!?;:"'—]/g, "")
                  const isLookupable = !!((MOCK.dictionary as Record<string, any>)[clean])
                  const isSaved = savedWords.includes(clean)
                  return (
                    <span key={i} onClick={isLookupable ? (e) => handleWordClick(tok, e) : undefined} style={{ cursor: isLookupable ? "pointer" : "default", background: isSaved ? "var(--omnic-tenant-primary-mid)" : "transparent", borderBottom: isLookupable && !isSaved ? "1px dashed rgba(91,33,182,0.3)" : "none", padding: isSaved ? "0 2px" : 0, borderRadius: 3, transition: "background 0.12s" }}>{tok}</span>
                  )
                })}
              </p>
            )
          })}
        </div>

        <div style={{ padding: "12px 24px", borderTop: "1px solid var(--omnic-gray-200)", background: "var(--omnic-gray-50)", display: "flex", alignItems: "center", gap: 16 }}>
          <div className="body-sm" style={{ flex: 1 }}><Icon name="bookmark" size={13} /> {savedWords.length} word{savedWords.length === 1 ? "" : "s"} added {mode === "teacher" ? `to ${activeStudent}'s flashcards` : "to flashcards"}</div>
          <div className="body-sm">Click any underlined word to look it up.</div>
        </div>
      </div>

      {selectedWord && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: Math.min(popoverPos.x - 160, window.innerWidth - 340), top: popoverPos.y + 8, width: 320, background: "white", borderRadius: 12, boxShadow: "var(--shadow-modal)", padding: 18, zIndex: 300, border: "1px solid var(--omnic-gray-200)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div><div style={{ fontSize: 20, fontWeight: 700, color: "var(--omnic-gray-900)" }}>{selectedWord.word}</div><div style={{ fontSize: 12, color: "var(--omnic-gray-500)", fontFamily: "ui-monospace, monospace", marginTop: 2 }}>{selectedWord.phonetic}</div></div>
            <button className="btn-ghost" style={{ padding: 6 }}><Icon name="volume" size={16} stroke="var(--omnic-tenant-primary)" /></button>
          </div>
          <div className="pill pill-new" style={{ fontSize: 10, marginBottom: 8 }}>{selectedWord.pos}</div>
          <div style={{ fontSize: 14, color: "var(--omnic-gray-800)", marginBottom: 8, lineHeight: 1.5 }}>{selectedWord.meaning}</div>
          <div style={{ fontSize: 13, color: "var(--omnic-gray-600)", fontStyle: "italic", borderLeft: "2px solid var(--omnic-tenant-primary)", paddingLeft: 10, marginBottom: 14, lineHeight: 1.5 }}>&ldquo;{selectedWord.example}&rdquo;</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" style={{ flex: 0 }} onClick={() => setSelectedWord(null)}>Close</button>
            {mode !== "admin" && (
              <button className="btn btn-tenant btn-sm" style={{ flex: 1 }} onClick={addCurrent}><Icon name="plus" size={13} /> {mode === "teacher" ? `Send to ${activeStudent.split(" ")[0]}'s flashcards` : "Add to my flashcards"}</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function LibraryPage() {
  const [reading, setReading] = useState<any>(null)
  const [filter, setFilter] = useState("all")
  const items = MOCK.library!.filter((b) => filter === "all" || b.cefr === filter)

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
        {items.map((b) => (
          <div key={b.id} className="card" style={{ overflow: "hidden", cursor: "pointer", transition: "transform 0.12s, box-shadow 0.12s" }}
            onClick={() => setReading(b)}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--shadow-card-hover)" }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "" }}>
            <div style={{ height: 160, background: `linear-gradient(135deg, ${b.cover}, ${b.cover}dd)`, display: "flex", alignItems: "flex-end", padding: 14, color: "white", position: "relative" }}>
              <div style={{ position: "absolute", top: 12, right: 12 }}>
                <span className="pill" style={{ background: "rgba(255,255,255,0.25)", color: "white", fontSize: 10, fontWeight: 700 }}>{b.cefr}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{b.type}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, lineHeight: 1.3 }}>{b.title}</div>
              </div>
            </div>
            <div style={{ padding: 14 }}>
              <div className="body-sm" style={{ marginBottom: 8 }}>{b.author}</div>
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--omnic-gray-500)" }}>
                <span><Icon name="clock" size={11} /> {b.minutes} min</span>
                <span><Icon name="file" size={11} /> {b.pages} pages</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {reading && <ReadingView mode="student" onClose={() => setReading(null)} />}
    </div>
  )
}
