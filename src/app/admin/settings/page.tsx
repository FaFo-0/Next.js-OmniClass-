"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
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
      <PaymentsSection />
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

// ── Payments (POLICY §3 — Lemon Squeezy) ─────────────────────────────
//
// Keys live in Convex environment variables, not here: they're secrets, and
// this page runs in a browser. What the page CAN do is tell you which ones
// the deployment can see, hand you the webhook URL, and wire each pack to its
// variant id — the three things that are easy to get half-done.

function ConfigRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
      <Icon
        name={ok ? "check" : "alert"}
        size={15}
        stroke={ok ? "var(--omnic-green, #15803D)" : "#92400E"}
      />
      <span className="body-sm" style={{ fontWeight: ok ? 400 : 600 }}>
        {label}
        {hint && (
          <span style={{ color: "var(--omnic-gray-400)", marginInlineStart: 6 }}>
            {hint}
          </span>
        )}
      </span>
    </div>
  );
}

type PayPack = {
  _id: string;
  name: string;
  points: number;
  priceUSD: number;
  priceLocal?: number;
  currency?: string;
  lemonSqueezyVariantId?: string;
};

type PayEvent = {
  _id: string;
  status: string;
  eventName: string;
  orderNumber?: string;
  amount?: number;
  currency?: string;
  message?: string;
  createdAt: string;
};

function PaymentsSection() {
  const status = useQuery(api.payments.getAdminStatus, {});
  const packages = (useQuery(api.points.listPackages, { activeOnly: true }) ??
    []) as PayPack[];
  const setVariant = useMutation(api.points.setPackageVariant);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function save(packageId: string, current: string) {
    setSaving(packageId);
    try {
      await setVariant({
        packageId: packageId as never,
        lemonSqueezyVariantId: drafts[packageId] ?? current,
      });
      toast.success("Variant saved");
      setDrafts((d) => {
        const next = { ...d };
        delete next[packageId];
        return next;
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const live =
    status?.featureEnabled &&
    status.hasApiKey &&
    status.hasStoreId &&
    status.hasWebhookSecret;

  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div className="h3" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="dollar" size={18} stroke="var(--omnic-tenant-primary)" />{" "}
        Card payments (Lemon Squeezy)
        <span
          className="body-sm"
          style={{
            marginInlineStart: 6,
            padding: "2px 8px",
            borderRadius: 999,
            fontWeight: 600,
            background: live ? "var(--brand-purple-tint)" : "var(--omnic-gray-100)",
            color: live ? "var(--brand-purple)" : "var(--omnic-gray-500)",
          }}
        >
          {live ? "Live" : "Not live"}
        </span>
      </div>
      <p className="body-sm" style={{ marginBottom: 16 }}>
        Students see a Buy button only when everything below is green
        <em> and</em> the pack has a variant id. Anything missing and the page
        quietly falls back to &ldquo;Request this pack&rdquo;, so a half-finished
        setup can never take a payment it won&apos;t honour.
      </p>

      {status === undefined ? (
        <div className="body-sm">Loading…</div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <ConfigRow
              ok={status.featureEnabled}
              label="Payments feature switched on"
              hint="Branding → feature toggles"
            />
            <ConfigRow ok={status.hasApiKey} label="LEMONSQUEEZY_API_KEY" />
            <ConfigRow
              ok={status.hasStoreId}
              label="LEMONSQUEEZY_STORE_ID"
              hint={status.storeId ? `store ${status.storeId}` : undefined}
            />
            <ConfigRow ok={status.hasWebhookSecret} label="LEMONSQUEEZY_WEBHOOK_SECRET" />
            <ConfigRow
              ok={status.hasSiteUrl}
              label="SITE_URL"
              hint="where students return after paying"
            />
          </div>

          <div className="body-sm" style={{ fontWeight: 600, marginBottom: 6 }}>
            Webhook URL
          </div>
          <p className="body-sm" style={{ marginBottom: 8 }}>
            Paste this into Lemon Squeezy → Settings → Webhooks, subscribed to{" "}
            <strong>order_created</strong> and <strong>order_refunded</strong>.
          </p>
          <div
            style={{
              padding: 10,
              background: "var(--omnic-gray-50)",
              borderRadius: 8,
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              wordBreak: "break-all",
              marginBottom: 8,
            }}
          >
            {status.webhookUrl ?? "Unavailable — CONVEX_CLOUD_URL not set"}
          </div>
          {status.webhookUrl && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginBottom: 20 }}
              onClick={() => {
                void navigator.clipboard
                  .writeText(status.webhookUrl!)
                  .then(() => toast.success("Webhook URL copied"))
                  .catch(() => toast.error("Copy failed; select it manually"));
              }}
            >
              <Icon name="external" size={14} /> Copy webhook URL
            </button>
          )}

          <div className="body-sm" style={{ fontWeight: 600, marginBottom: 6 }}>
            Pack → variant
          </div>
          <p className="body-sm" style={{ marginBottom: 10 }}>
            Each pack sells as one Lemon Squeezy variant. The id is the number
            at the end of the variant&apos;s URL in your dashboard. Lemon Squeezy
            charges in your store currency — price the variant to match the
            pack&apos;s USD price, which is what students are told they&apos;ll be
            charged.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {packages.map((pkg) => {
              const current = pkg.lemonSqueezyVariantId ?? "";
              const value = drafts[pkg._id] ?? current;
              const dirty = value !== current;
              return (
                <div
                  key={pkg._id}
                  style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
                >
                  <div style={{ minWidth: 190 }}>
                    <div className="body-sm" style={{ fontWeight: 600 }}>{pkg.name}</div>
                    <div className="body-sm" style={{ color: "var(--omnic-gray-400)" }}>
                      {pkg.points} lessons · ${pkg.priceUSD}
                      {pkg.priceLocal && pkg.currency
                        ? ` (${pkg.priceLocal.toLocaleString()} ${pkg.currency})`
                        : ""}
                    </div>
                  </div>
                  <input
                    className="input"
                    style={{ flex: "1 1 160px", maxWidth: 220 }}
                    placeholder="variant id"
                    inputMode="numeric"
                    value={value}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [pkg._id]: e.target.value }))
                    }
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={!dirty || saving === pkg._id}
                    onClick={() => void save(pkg._id, current)}
                  >
                    {saving === pkg._id ? "Saving…" : "Save"}
                  </button>
                  {!current && (
                    <span className="body-sm" style={{ color: "#92400E" }}>
                      not on sale
                    </span>
                  )}
                </div>
              );
            })}
            {packages.length === 0 && (
              <div className="body-sm" style={{ fontStyle: "italic" }}>
                No active packs. Seed the catalogue on the Billing page first.
              </div>
            )}
          </div>

          <div className="body-sm" style={{ fontWeight: 600, marginBottom: 6 }}>
            Recent gateway events
          </div>
          {status.recentEvents.length === 0 ? (
            <div className="body-sm" style={{ fontStyle: "italic" }}>
              Nothing yet. Events appear here the moment Lemon Squeezy calls
              the webhook — including the ones that failed, which is the point.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(status.recentEvents as PayEvent[]).map((e) => (
                <div
                  key={e._id}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "baseline",
                    flexWrap: "wrap",
                    padding: "6px 0",
                    borderBottom: "1px solid var(--omnic-gray-100)",
                  }}
                >
                  <span
                    className="body-sm"
                    style={{
                      fontWeight: 700,
                      color:
                        e.status === "fulfilled"
                          ? "var(--omnic-green, #15803D)"
                          : e.status === "failed"
                            ? "var(--omnic-red)"
                            : "var(--omnic-gray-500)",
                    }}
                  >
                    {e.status}
                  </span>
                  <span className="body-sm">{e.eventName}</span>
                  {e.orderNumber && (
                    <span className="body-sm" style={{ color: "var(--omnic-gray-400)" }}>
                      #{e.orderNumber}
                    </span>
                  )}
                  {e.amount != null && (
                    <span className="body-sm">
                      {e.amount} {e.currency ?? ""}
                    </span>
                  )}
                  {e.message && (
                    <span className="body-sm" style={{ color: "#92400E" }}>
                      {e.message}
                    </span>
                  )}
                  <span
                    className="body-sm"
                    style={{ marginInlineStart: "auto", color: "var(--omnic-gray-400)" }}
                  >
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
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
        {/* Only a stored upload counts as "the tenant's logo" — the seeded
            logoUrl points at a repo asset, same as the bundled mark. */}
        <LogoUploader logoUrl={settings?.logoStorageId ? settings.logoUrl : null} />
      </div>
      <div style={{ marginTop: 16 }}>
        <label className="label" style={{ display: "block", marginBottom: 8 }}>Feature Toggles</label>
        {([
          ["gamification", "Gamification", "not enforced yet"],
          ["achievements", "Achievements", "hides the student Achievements page"],
          ["library", "Library", "hides the student Library page"],
          ["liveQuizGen", "Live Quiz Generation", "not enforced yet"],
          ["payments", "Payments", "shows students a Buy button once Lemon Squeezy is set up below"],
        ] as const).map(([key, label, note]) => (
          <label
            key={key}
            onClick={() => setFeatures({ ...features, [key]: !features[key] })}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px solid var(--omnic-gray-200)", borderRadius: 8, marginBottom: 8, cursor: "pointer" }}
          >
            <span className="body">
              {label}
              <span className="body-sm" style={{ marginInlineStart: 8, color: "var(--omnic-gray-400)" }}>
                {note}
              </span>
            </span>
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

// ── Small shared pieces ──────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,17,17,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ padding: 22, width: "min(680px, 100%)", maxHeight: "88vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="h3" style={{ margin: 0 }}>{title}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" style={{ display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

// ── Logo upload ──────────────────────────────────────────────────────
// Uploads to Convex storage and writes tenantSettings.logoUrl, which the
// sidebar mark reads. The bundled /logo-mark.svg is only a fallback.

const MAX_LOGO_BYTES = 1024 * 1024;

function LogoUploader({ logoUrl }: { logoUrl: string | null }) {
  const generateUploadUrl = useMutation(api.tenantSettings.generateLogoUploadUrl);
  const setLogo = useMutation(api.tenantSettings.setLogo);
  const clearLogo = useMutation(api.tenantSettings.clearLogo);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    if (!/^image\/(png|svg\+xml|jpeg|webp)$/.test(file.type)) {
      toast.error("PNG, SVG, JPEG or WebP only");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be under 1MB");
      return;
    }
    setBusy(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json();
      await setLogo({ storageId });
      toast.success("Logo updated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label className="label" style={{ display: "block", marginBottom: 4 }}>Logo</label>
      <div
        onClick={() => !busy && inputRef.current?.click()}
        style={{
          border: "2px dashed var(--omnic-gray-200)",
          borderRadius: 8,
          padding: logoUrl ? 12 : 20,
          textAlign: "center",
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Tenant logo"
            style={{ maxHeight: 56, maxWidth: "100%", objectFit: "contain" }}
          />
        ) : (
          <Icon name="upload" size={20} stroke="var(--omnic-gray-400)" />
        )}
        <div className="body-sm" style={{ marginTop: 6 }}>
          {busy ? "Uploading…" : logoUrl ? "Click to replace" : "PNG or SVG, max 1MB"}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/svg+xml,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      {logoUrl && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 6 }}
          disabled={busy}
          onClick={async () => {
            if (!confirm("Remove the logo and fall back to the default mark?")) return;
            try {
              await clearLogo();
              toast.success("Logo removed");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          <Icon name="trash" size={12} /> Remove
        </button>
      )}
    </div>
  );
}

// ── AI Manager ───────────────────────────────────────────────────────

function AIManagerSection({ promptConfigs, settings }: { promptConfigs: any[]; settings: any }) {
  const [editing, setEditing] = useState<any | null>(null);
  const sonioxCost = settings?.ai?.sonioxCostPerMinute ?? 0.008;
  const avgMin = settings?.ai?.avgLessonMinutes ?? 60;
  const sonioxLessonCost = (sonioxCost * avgMin).toFixed(4);

  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div className="h3" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="sparkle" size={18} stroke="var(--omnic-tenant-primary)" /> AI Manager
      </div>
      <p className="body-sm" style={{ marginBottom: 16 }}>Configure AI prompt templates and model parameters</p>

      <div className="card" style={{ padding: 14, marginBottom: 16, background: "var(--omnic-tenant-primary-soft)", borderColor: "var(--omnic-tenant-primary)" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>Transcription cost per lesson</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--omnic-tenant-primary)" }}>${sonioxLessonCost}</span>
        </div>
        <div className="body-sm" style={{ marginTop: 4 }}>
          Soniox: ${sonioxCost}/min @ {avgMin} min avg. LLM costs are pennies on
          top and aren&apos;t metered yet.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {promptConfigs.map((p: any) => (
          <div key={p._id ?? p.configId} style={{ padding: 14, border: "1px solid var(--omnic-gray-200)", borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name ?? p.configId}</span>
              <span className="pill pill-tenant" style={{ fontSize: 10 }}>{p.model ?? "—"}</span>
            </div>
            <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
              <div><div className="body-sm">Temp</div><div style={{ fontSize: 13, fontWeight: 500 }}>{p.temperature ?? "—"}</div></div>
              <div><div className="body-sm">Tokens</div><div style={{ fontSize: 13, fontWeight: 500 }}>{p.maxTokens ?? "—"}</div></div>
              <div>
                <div className="body-sm">Source</div>
                {/* A row with no _id is the code default, not an org override. */}
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p._id ? "Edited" : "Default"}</div>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>
              <Icon name="edit" size={12} /> Edit
            </button>
          </div>
        ))}
        {promptConfigs.length === 0 && (
          <div className="body-sm" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 16 }}>
            No prompt configs yet. Run the seed script to create defaults.
          </div>
        )}
      </div>

      {editing && (
        // Keyed so switching prompts remounts the form — otherwise the fields
        // keep the first config's text while the title says the new one.
        <PromptEditorDialog
          key={editing.configId}
          config={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PromptEditorDialog({ config, onClose }: { config: any; onClose: () => void }) {
  const upsert = useMutation(api.promptConfigs.upsert);
  const resetToDefault = useMutation(api.promptConfigs.resetToDefault);
  const [model, setModel] = useState(config.model ?? "");
  const [temperature, setTemperature] = useState(config.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(config.maxTokens ?? 2000);
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt ?? "");
  const [userPromptTemplate, setUserPromptTemplate] = useState(config.userPromptTemplate ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await upsert({
        configId: config.configId,
        name: config.name ?? config.configId,
        model,
        temperature,
        maxTokens,
        systemPrompt,
        userPromptTemplate,
      });
      toast.success("Prompt saved");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={config.name ?? config.configId} onClose={onClose}>
      <div className="body-sm" style={{ marginBottom: 12 }}>
        Placeholders like <code>{"{{transcript}}"}</code> are filled in at
        generation time — keep the ones the prompt already uses.
      </div>
      <div className="grid-3" style={{ marginBottom: 12 }}>
        <Field label="Model">
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
        </Field>
        <Field label="Temperature">
          <input
            className="input"
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
          />
        </Field>
        <Field label="Max tokens">
          <input
            className="input"
            type="number"
            min="1"
            max="32000"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
          />
        </Field>
      </div>
      <Field label="System prompt">
        <textarea
          className="input"
          rows={7}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, lineHeight: 1.5 }}
        />
      </Field>
      <div style={{ height: 12 }} />
      <Field label="User prompt template">
        <textarea
          className="input"
          rows={5}
          value={userPromptTemplate}
          onChange={(e) => setUserPromptTemplate(e.target.value)}
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, lineHeight: 1.5 }}
        />
      </Field>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 16 }}>
        {config._id ? (
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Discard this org's version and go back to the built-in prompt?")) return;
              try {
                await resetToDefault({ configId: config.configId });
                toast.success("Reset to the built-in prompt");
                onClose();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <Icon name="refresh" size={12} /> Reset to default
          </button>
        ) : (
          <span />
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-tenant" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save prompt"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Achievements ─────────────────────────────────────────────────────

const CONDITION_TYPES = [
  ["lessons_completed", "Lessons completed"],
  ["cards_reviewed", "Cards reviewed"],
  ["quiz_perfect", "Perfect quizzes"],
  ["streak_days", "Longest streak (days)"],
  ["vocab_learned", "Words learned"],
] as const;

type ConditionType = (typeof CONDITION_TYPES)[number][0];

function conditionLabel(type: string) {
  return CONDITION_TYPES.find(([value]) => value === type)?.[1] ?? type;
}

function AchievementsSection({ achievements, remove }: { achievements: any[]; remove: any }) {
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="h3" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="trophy" size={18} stroke="var(--omnic-tenant-primary)" /> Achievements
          </div>
          <p className="body-sm" style={{ marginBottom: 16 }}>
            Unlocked automatically when a student crosses the threshold — the
            engine recomputes every counter after each lesson, review and quiz.
          </p>
        </div>
        <button className="btn btn-tenant btn-sm" onClick={() => setCreating(true)}>
          <Icon name="plus" size={14} /> New achievement
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {achievements.map((a: any) => (
          <div key={a._id} style={{ padding: 14, border: "1px solid var(--omnic-gray-200)", borderRadius: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{a.icon} {a.name}</div>
            <div className="body-sm" style={{ marginBottom: 8 }}>{a.description}</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <span className="pill pill-new" style={{ fontSize: 10 }}>
                {conditionLabel(a.conditionType)} ≥ {a.conditionThreshold}
              </span>
              {a.reward && <span className="pill pill-active" style={{ fontSize: 10 }}>{a.reward}</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(a)}>
                <Icon name="edit" size={12} /> Edit
              </button>
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

      {(editing || creating) && (
        <AchievementDialog
          key={editing?._id ?? "new"}
          achievement={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function AchievementDialog({ achievement, onClose }: { achievement: any | null; onClose: () => void }) {
  const create = useMutation(api.achievements.create);
  const update = useMutation(api.achievements.update);
  const [name, setName] = useState(achievement?.name ?? "");
  const [description, setDescription] = useState(achievement?.description ?? "");
  const [icon, setIcon] = useState(achievement?.icon ?? "🏆");
  const [conditionType, setConditionType] = useState<ConditionType>(
    achievement?.conditionType ?? "lessons_completed"
  );
  const [threshold, setThreshold] = useState<number>(achievement?.conditionThreshold ?? 5);
  const [reward, setReward] = useState(achievement?.reward ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || !description.trim()) {
      toast.error("Name and description are required");
      return;
    }
    setBusy(true);
    try {
      const shared = {
        name: name.trim(),
        description: description.trim(),
        icon: icon.trim() || "🏆",
        conditionType,
        conditionThreshold: threshold,
        reward: reward.trim() || undefined,
      };
      if (achievement) {
        await update({ id: achievement._id, ...shared });
      } else {
        // externalId is the stable key the unlock engine stores per student.
        await create({
          externalId: `ach_${Date.now().toString(36)}`,
          ...shared,
        });
      }
      toast.success(achievement ? "Achievement saved" : "Achievement created");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={achievement ? "Edit achievement" : "New achievement"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Icon">
          <input
            className="input"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            style={{ textAlign: "center", fontSize: 20 }}
          />
        </Field>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
      <Field label="Description">
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid-3" style={{ marginTop: 12 }}>
        <Field label="Counter">
          <select
            className="input"
            value={conditionType}
            onChange={(e) => setConditionType(e.target.value as ConditionType)}
          >
            {CONDITION_TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Unlocks at">
          <input
            className="input"
            type="number"
            min="1"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </Field>
        <Field label="Reward (optional)">
          <input className="input" value={reward} onChange={(e) => setReward(e.target.value)} />
        </Field>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-tenant" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : achievement ? "Save achievement" : "Create achievement"}
        </button>
      </div>
    </Modal>
  );
}

// ── Scheduling ───────────────────────────────────────────────────────

function SchedulingSection({ settings, update }: { settings: any; update: any }) {
  const policy = useQuery(api.policyConstants.get, {});
  const [reschedHrs, setReschedHrs] = useState(6);
  const [duration, setDuration] = useState(60);
  const [maxResched, setMaxResched] = useState(4);

  useEffect(() => {
    if (!settings) return;
    setReschedHrs(settings.rescheduleWindowHours ?? 6);
    setDuration(settings.defaultLessonDurationMinutes ?? 60);
    setMaxResched(settings.maxReschedulesPerMonth ?? 4);
  }, [settings?._id]);

  async function save() {
    try {
      await update({
        patch: {
          rescheduleWindowHours: reschedHrs,
          defaultLessonDurationMinutes: duration,
          maxReschedulesPerMonth: maxResched,
        },
      });
      toast.success("Scheduling policies saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Everything below is compiled into convex/lib/policy.ts from POLICY.md —
  // shown so the page reports the rules the server really applies. Changing
  // one means editing POLICY.md, not a field here.
  const fixed: [string, string][] = policy
    ? [
        ["Student cancellation notice", `${policy.studentCancelNoticeHours} h`],
        ["Free student cancellations", `${policy.studentFreeCancelsPer30Days} per 30 days`],
        ["Teacher cancellation notice", `${policy.teacherCancelNoticeHours} h`],
        ["Cancel / move horizon", `${policy.actionHorizonDays} days ahead`],
        ["Student booking notice", `${policy.bookingMinNoticeHours} h`],
        ["Booking horizon", `${policy.bookingHorizonDays} days`],
        ["No-show wait", `${policy.noShowWaitMinutes} min (ping at ${policy.noShowPingMinutes})`],
        ["Time off needing sign-off", `longer than ${policy.timeOffApprovalDays} days`],
      ]
    : [];

  return (
    <div className="card" id="scheduling" style={{ padding: 24 }}>
      <div className="h3" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="clock" size={18} stroke="var(--omnic-tenant-primary)" /> Scheduling Policies
      </div>
      <p className="body-sm" style={{ marginBottom: 16 }}>Lesson length and reschedule limits for this academy</p>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <PolicyInput label="Reschedule Window" value={reschedHrs} onChange={setReschedHrs} unit="hours" />
        <PolicyInput label="Default Duration" value={duration} onChange={setDuration} unit="min" />
        <PolicyInput label="Max Reschedules / Month" value={maxResched} onChange={setMaxResched} unit="per student" />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <button className="btn btn-tenant" onClick={save}>Save scheduling</button>
      </div>

      <div className="card" style={{ padding: 16, background: "var(--omnic-gray-50)" }}>
        <div className="h3" style={{ fontSize: 14, marginBottom: 4 }}>Set by POLICY, not here</div>
        <p className="body-sm" style={{ marginBottom: 10 }}>
          Cancellation, no-show and booking rules are the same for every tenant
          and live in POLICY.md. These are the values the server enforces today.
        </p>
        {policy === undefined ? (
          <div className="body-sm">Loading…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "6px 20px" }}>
            {fixed.map(([label, value]) => (
              <div
                key={label}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0" }}
              >
                <span className="body-sm">{label}</span>
                <strong style={{ fontSize: 13, whiteSpace: "nowrap" }}>{value}</strong>
              </div>
            ))}
          </div>
        )}
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
