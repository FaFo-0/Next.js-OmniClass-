"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";
import { toast } from "sonner";

export default function AdminSettingsPage() {
  const settings = useQuery(api.tenantSettings.getActive);
  const promptConfigs = useQuery(api.promptConfigs.listForOrg, {}) ?? [];
  const achievements = useQuery(api.achievements.list) ?? [];
  const updateSettings = useMutation(api.tenantSettings.update);
  const removeAchievement = useMutation(api.achievements.remove);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div><h1 className="h1" style={{ margin: 0 }}>Settings</h1></div>
      </div>

      <BrandingSection settings={settings} update={updateSettings} />
      <TeacherInviteSection />
      <AIManagerSection promptConfigs={promptConfigs} settings={settings} />
      <AchievementsSection achievements={achievements} remove={removeAchievement} />
      <SchedulingSection settings={settings} update={updateSettings} />
    </div>
  );
}

// ── Teacher invite link ─────────────────────────────────────────────

function TeacherInviteSection() {
  const token = useQuery(api.tenantSettings.getTeacherInviteToken, {});
  const rotate = useMutation(api.tenantSettings.rotateTeacherInviteToken);
  const [busy, setBusy] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const link = token ? `${origin}/sign-up?invite=${token}` : null;

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch (e) {
      toast.error("Copy failed; select the link manually");
    }
  }

  async function handleRotate() {
    if (
      !confirm(
        "Rotating will revoke the current link. Anyone who has it will need a new one. Continue?"
      )
    )
      return;
    setBusy(true);
    try {
      await rotate();
      toast.success("New invite link generated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div
        className="h3"
        style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}
      >
        <Icon name="users" size={18} stroke="var(--omnic-tenant-primary)" />{" "}
        Teacher invite link
      </div>
      <p className="body-sm" style={{ marginBottom: 16 }}>
        Share this URL with new teachers. Anyone who signs up via this
        link is auto-promoted to teacher in your tenant. Rotate it
        whenever you want to revoke access.
      </p>

      {token === undefined && (
        <div className="body-sm">Loading…</div>
      )}

      {token !== undefined && (
        <>
          {link ? (
            <div
              style={{
                padding: 10,
                background: "var(--omnic-gray-50)",
                borderRadius: 8,
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
                wordBreak: "break-all",
                marginBottom: 12,
              }}
            >
              {link}
            </div>
          ) : (
            <div
              className="body-sm"
              style={{ marginBottom: 12, fontStyle: "italic" }}
            >
              No invite link yet. Generate one to share with teachers.
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {link && (
              <button className="btn btn-secondary" onClick={handleCopy}>
                <Icon name="external" size={14} /> Copy link
              </button>
            )}
            <button
              className="btn btn-tenant"
              onClick={handleRotate}
              disabled={busy}
            >
              <Icon name="refresh" size={14} />{" "}
              {link ? "Rotate link" : "Generate link"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Branding ─────────────────────────────────────────────────────────

function BrandingSection({ settings, update }: { settings: any; update: any }) {
  const [name, setName] = useState("");
  const [primary, setPrimary] = useState("");
  const [features, setFeatures] = useState({
    gamification: true,
    achievements: true,
    library: true,
    liveQuizGen: true,
    payments: true,
  });

  useEffect(() => {
    if (!settings) return;
    setName(settings.name ?? "");
    setPrimary(settings.primaryColor ?? "#6716A4");
    if (settings.features) setFeatures({ ...features, ...settings.features });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?._id]);

  async function save() {
    try {
      await update({ patch: { name, primaryColor: primary, features } });
      toast.success("Branding saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div className="h3" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="settings" size={18} stroke="var(--omnic-tenant-primary)" /> Branding
      </div>
      <p className="body-sm" style={{ marginBottom: 16 }}>Customize your tenant&apos;s appearance and terminology</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label className="label" style={{ display: "block", marginBottom: 4 }}>Tenant Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" style={{ display: "block", marginBottom: 4 }}>Primary Color</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="color"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              style={{ width: 40, height: 36, borderRadius: 6, border: "1px solid var(--omnic-gray-200)", cursor: "pointer", padding: 2 }}
            />
            <span className="body-sm">{primary}</span>
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
        {([
          ["gamification", "Gamification"],
          ["achievements", "Achievements"],
          ["library", "Library"],
          ["liveQuizGen", "Live Quiz Generation"],
          ["payments", "Payments"],
        ] as const).map(([key, label]) => (
          <label
            key={key}
            onClick={() => setFeatures({ ...features, [key]: !features[key] })}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px solid var(--omnic-gray-200)", borderRadius: 8, marginBottom: 8, cursor: "pointer" }}
          >
            <span className="body">{label}</span>
            <div style={{ width: 40, height: 22, borderRadius: 11, background: features[key] ? "var(--omnic-tenant-primary)" : "var(--omnic-gray-200)", position: "relative", transition: "background 0.2s" }}>
              <div style={{ position: "absolute", top: 2, left: features[key] ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.15)", transition: "left 0.2s" }} />
            </div>
          </label>
        ))}
      </div>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-tenant" onClick={save}>Save branding</button>
      </div>
    </div>
  );
}

// ── AI Manager ───────────────────────────────────────────────────────

function AIManagerSection({ promptConfigs, settings }: { promptConfigs: any[]; settings: any }) {
  const sonioxCost = settings?.ai?.sonioxCostPerMinute ?? 0.008;
  const avgMin = settings?.ai?.avgLessonMinutes ?? 60;
  const sonioxLessonCost = (sonioxCost * avgMin).toFixed(4);
  const promptCost = promptConfigs
    .reduce((s, p: any) => s + (p.costPerLesson ?? 0), 0)
    .toFixed(6);

  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div className="h3" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="sparkle" size={18} stroke="var(--omnic-tenant-primary)" /> AI Manager
      </div>
      <p className="body-sm" style={{ marginBottom: 16 }}>Configure AI prompt templates and model parameters</p>

      <div className="card" style={{ padding: 14, marginBottom: 16, background: "var(--omnic-tenant-primary-soft)", borderColor: "var(--omnic-tenant-primary)" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>Total cost per lesson</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--omnic-tenant-primary)" }}>${promptCost}</span>
        </div>
        <div className="body-sm" style={{ marginTop: 4 }}>Soniox: ${sonioxCost}/min @ {avgMin} min avg = ${sonioxLessonCost} per lesson</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {promptConfigs.map((p: any) => (
          <div key={p._id ?? p.configId} style={{ padding: 14, border: "1px solid var(--omnic-gray-200)", borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name ?? p.configId}</span>
              <span className="pill pill-tenant" style={{ fontSize: 10 }}>{p.model ?? "—"}</span>
            </div>
            <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
              <div><div className="body-sm">Temp</div><div style={{ fontSize: 13, fontWeight: 500 }}>{p.temperature ?? "—"}</div></div>
              <div><div className="body-sm">Tokens</div><div style={{ fontSize: 13, fontWeight: 500 }}>{p.maxTokens ?? "—"}</div></div>
              <div><div className="body-sm">Cost</div><div style={{ fontSize: 13, fontWeight: 500, color: "var(--omnic-tenant-primary)" }}>${(p.costPerLesson ?? 0).toFixed(6)}</div></div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-ghost btn-sm"><Icon name="edit" size={12} /> Edit</button>
              <button className="btn btn-ghost btn-sm"><Icon name="play" size={12} /> Test</button>
            </div>
          </div>
        ))}
        {promptConfigs.length === 0 && (
          <div className="body-sm" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 16 }}>
            No prompt configs yet. Run the seed script to create defaults.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Achievements ─────────────────────────────────────────────────────

function AchievementsSection({ achievements, remove }: { achievements: any[]; remove: any }) {
  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div className="h3" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="trophy" size={18} stroke="var(--omnic-tenant-primary)" /> Achievements
      </div>
      <p className="body-sm" style={{ marginBottom: 16 }}>Configure gamification achievements and rewards</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {achievements.map((a: any) => (
          <div key={a._id} style={{ padding: 14, border: "1px solid var(--omnic-gray-200)", borderRadius: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{a.icon} {a.name}</div>
            <div className="body-sm" style={{ marginBottom: 8 }}>{a.description}</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <span className="pill pill-new" style={{ fontSize: 10 }}>{a.conditionType} ≥ {a.conditionThreshold}</span>
              {a.reward && <span className="pill pill-active" style={{ fontSize: 10 }}>{a.reward}</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-ghost btn-sm"><Icon name="edit" size={12} /> Edit</button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--omnic-red)" }}
                onClick={async () => {
                  if (!confirm(`Delete "${a.name}"?`)) return;
                  try { await remove({ id: a._id }); toast.success("Deleted"); }
                  catch (e) { toast.error((e as Error).message); }
                }}
              >
                <Icon name="trash" size={12} /> Delete
              </button>
            </div>
          </div>
        ))}
        {achievements.length === 0 && (
          <div className="body-sm" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 16 }}>
            No achievements yet.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scheduling ───────────────────────────────────────────────────────

function SchedulingSection({ settings, update }: { settings: any; update: any }) {
  const [reschedHrs, setReschedHrs] = useState(6);
  const [cancelHrs, setCancelHrs] = useState(24);
  const [duration, setDuration] = useState(60);
  const [maxResched, setMaxResched] = useState(4);
  const [noShowConsumes, setNoShowConsumes] = useState(true);

  useEffect(() => {
    if (!settings) return;
    setReschedHrs(settings.rescheduleWindowHours ?? 6);
    setCancelHrs(settings.cancelWindowHours ?? 24);
    setDuration(settings.defaultLessonDurationMinutes ?? 60);
    setMaxResched(settings.maxReschedulesPerMonth ?? 4);
    setNoShowConsumes(settings.noShowConsumesLesson ?? true);
  }, [settings?._id]);

  async function save() {
    try {
      await update({
        patch: {
          rescheduleWindowHours: reschedHrs,
          cancelWindowHours: cancelHrs,
          defaultLessonDurationMinutes: duration,
          maxReschedulesPerMonth: maxResched,
          noShowConsumesLesson: noShowConsumes,
        },
      });
      toast.success("Scheduling policies saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="card" id="scheduling" style={{ padding: 24 }}>
      <div className="h3" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="clock" size={18} stroke="var(--omnic-tenant-primary)" /> Scheduling Policies
      </div>
      <p className="body-sm" style={{ marginBottom: 16 }}>Configure lesson scheduling rules and credit policies</p>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <PolicyInput label="Reschedule Window" value={reschedHrs} onChange={setReschedHrs} unit="hours" />
        <PolicyInput label="Cancel Window" value={cancelHrs} onChange={setCancelHrs} unit="hours" />
        <PolicyInput label="Default Duration" value={duration} onChange={setDuration} unit="min" />
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <PolicyInput label="Max Reschedules / Month" value={maxResched} onChange={setMaxResched} unit="per student" />
      </div>

      <div className="card" style={{ padding: 16, background: "var(--omnic-gray-50)" }}>
        <div className="h3" style={{ fontSize: 14, marginBottom: 10 }}>No-show policy</div>
        <label
          onClick={() => setNoShowConsumes(!noShowConsumes)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", cursor: "pointer" }}
        >
          <span className="body">Student no-show consumes a lesson credit</span>
          <div style={{ width: 36, height: 20, borderRadius: 10, background: noShowConsumes ? "var(--omnic-tenant-primary)" : "var(--omnic-gray-200)", position: "relative" }}>
            <div style={{ position: "absolute", top: 2, left: noShowConsumes ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
          </div>
        </label>
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-tenant" onClick={save}>Save scheduling</button>
      </div>
    </div>
  );
}

function PolicyInput({ label, value, onChange, unit }: { label: string; value: number; onChange: (v: number) => void; unit: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="label" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="input"
          style={{ width: 88, fontSize: 22, fontWeight: 700, textAlign: "center" }}
        />
        <span className="body-sm">{unit}</span>
      </div>
    </div>
  );
}
