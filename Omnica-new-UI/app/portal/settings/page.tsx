"use client"

import { Icon } from "@/components/shared/icons"
import { useTenant } from "@/components/tenant-provider"

export default function AdminSettingsPage() {
  const tenant = { name: "Omnica English", primaryColor: "#5B21B6" }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Settings</h1>
        </div>
      </div>

      {/* Branding */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="h3" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="settings" size={18} stroke="var(--omnic-tenant-primary)" /> Branding
        </div>
        <p className="body-sm" style={{ marginBottom: 16 }}>Customize your tenant&apos;s appearance and terminology</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label className="label" style={{ display: "block", marginBottom: 4 }}>Tenant Name</label>
            <input className="input" defaultValue={tenant.name} />
          </div>
          <div>
            <label className="label" style={{ display: "block", marginBottom: 4 }}>Primary Color</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="color" defaultValue={tenant.primaryColor} style={{ width: 40, height: 36, borderRadius: 6, border: "1px solid var(--omnic-gray-200)", cursor: "pointer", padding: 2 }} />
              <span className="body-sm">{tenant.primaryColor}</span>
            </div>
          </div>
          <div>
            <label className="label" style={{ display: "block", marginBottom: 4 }}>Logo</label>
            <div style={{ border: "2px dashed var(--omnic-gray-200)", borderRadius: 8, padding: 20, textAlign: "center" }}>
              <Icon name="upload" size={20} stroke="var(--omnic-gray-400)" />
              <div className="body-sm" style={{ marginTop: 4 }}>PNG or SVG, max 1MB</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label className="label" style={{ display: "block", marginBottom: 8 }}>Feature Toggles</label>
          {[
            { label: "Gamification", enabled: true },
            { label: "Achievements", enabled: true },
            { label: "Calendar Sync", enabled: false },
          ].map((item, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px solid var(--omnic-gray-200)", borderRadius: 8, marginBottom: 8 }}>
              <span className="body">{item.label}</span>
              <div style={{ width: 40, height: 22, borderRadius: 11, background: item.enabled ? "var(--omnic-tenant-primary)" : "var(--omnic-gray-200)", position: "relative", transition: "background 0.2s" }}>
                <div style={{ position: "absolute", top: 2, left: item.enabled ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.15)", transition: "left 0.2s" }} />
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* AI Manager */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="h3" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="sparkle" size={18} stroke="var(--omnic-tenant-primary)" /> AI Manager
        </div>
        <p className="body-sm" style={{ marginBottom: 16 }}>Configure AI prompt templates and model parameters</p>
        <div className="card" style={{ padding: 14, marginBottom: 16, background: "var(--omnic-tenant-primary-soft)", borderColor: "var(--omnic-tenant-primary)" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>Total cost per lesson</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--omnic-tenant-primary)" }}>$0.000113</span>
          </div>
          <div className="body-sm" style={{ marginTop: 4 }}>Soniox: $0.008/min @ 60 min avg = $0.48 per lesson</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {[
            { name: "Lesson Summary", model: "gemini-3-flash", temp: 0.3, tokens: 500, cost: "$0.000025" },
            { name: "Vocabulary Extraction", model: "gemini-3-flash", temp: 0.2, tokens: 2000, cost: "$0.000033" },
            { name: "Flashcard Generation", model: "gemini-3-flash", temp: 0.2, tokens: 2000, cost: "$0.000027" },
            { name: "Quiz Generation", model: "gemini-3-flash", temp: 0.4, tokens: 2000, cost: "$0.000028" },
          ].map((p, i) => (
            <div key={i} style={{ padding: 14, border: "1px solid var(--omnic-gray-200)", borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                <span className="pill pill-tenant" style={{ fontSize: 10 }}>{p.model}</span>
              </div>
              <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                <div><div className="body-sm">Temp</div><div style={{ fontSize: 13, fontWeight: 500 }}>{p.temp}</div></div>
                <div><div className="body-sm">Tokens</div><div style={{ fontSize: 13, fontWeight: 500 }}>{p.tokens}</div></div>
                <div><div className="body-sm">Cost</div><div style={{ fontSize: 13, fontWeight: 500, color: "var(--omnic-tenant-primary)" }}>{p.cost}</div></div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-ghost btn-sm"><Icon name="edit" size={12} /> Edit</button>
                <button className="btn btn-ghost btn-sm"><Icon name="play" size={12} /> Test</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Achievements */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div className="h3" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="trophy" size={18} stroke="var(--omnic-tenant-primary)" /> Achievements
        </div>
        <p className="body-sm" style={{ marginBottom: 16 }}>Configure gamification achievements and rewards</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {[
            { name: "First Steps", desc: "Complete your first lesson", condition: "lesson_count ≥ 1", reward: "100 XP", count: 24 },
            { name: "Word Collector", desc: "Learn 50 new words", condition: "vocabulary_count ≥ 50", reward: "200 XP", count: 18 },
            { name: "Streak Master", desc: "Maintain a 7-day streak", condition: "streak_days ≥ 7", reward: "150 XP", count: 12 },
            { name: "Flash Card King", desc: "Review 100 flashcards", condition: "review_count ≥ 100", reward: "250 XP", count: 8 },
          ].map((a, i) => (
            <div key={i} style={{ padding: 14, border: "1px solid var(--omnic-gray-200)", borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{a.name}</div>
              <div className="body-sm" style={{ marginBottom: 8 }}>{a.desc}</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <span className="pill pill-new" style={{ fontSize: 10 }}>{a.condition}</span>
                <span className="pill pill-active" style={{ fontSize: 10 }}>{a.reward}</span>
                <span className="body-sm">{a.count} students unlocked</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-ghost btn-sm"><Icon name="edit" size={12} /> Edit</button>
                <button className="btn btn-ghost btn-sm" style={{ color: "var(--omnic-red)" }}><Icon name="trash" size={12} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scheduling */}
      <div className="card" style={{ padding: 24 }}>
        <div className="h3" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="clock" size={18} stroke="var(--omnic-tenant-primary)" /> Scheduling Policies
        </div>
        <p className="body-sm" style={{ marginBottom: 16 }}>Configure lesson scheduling rules and credit policies</p>
        <div className="grid-3" style={{ marginBottom: 16 }}>
          {[
            { label: "Reschedule Window", value: 6, unit: "hours" },
            { label: "Cancel Window", value: 24, unit: "hours" },
            { label: "Default Duration", value: 60, unit: "min" },
          ].map((p, i) => (
            <div key={i} className="card" style={{ padding: 16 }}>
              <div className="label" style={{ marginBottom: 8 }}>{p.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <input type="number" defaultValue={p.value} className="input" style={{ width: 72, fontSize: 22, fontWeight: 700, textAlign: "center" }} />
                <span className="body-sm">{p.unit}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 16, background: "var(--omnic-gray-50)" }}>
          <div className="h3" style={{ fontSize: 14, marginBottom: 10 }}>Auto-grant credit when...</div>
          {[
            { label: "Instructor cancels the class", enabled: true },
            { label: "Admin cancels (school holiday, outage)", enabled: true },
            { label: "Student cancels within reschedule window", enabled: false },
          ].map((item, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--omnic-gray-100)" }}>
              <span className="body">{item.label}</span>
              <div style={{ width: 36, height: 20, borderRadius: 10, background: item.enabled ? "var(--omnic-tenant-primary)" : "var(--omnic-gray-200)", position: "relative" }}>
                <div style={{ position: "absolute", top: 2, left: item.enabled ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
