"use client";

// One member of the management team: who they are, their local time, and
// exactly what the system lets them do. Permissions are shown as the list
// actually in force, not a pretty summary — an admin acting on this page is
// deciding access, so it has to be literal.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Icon } from "@/components/shared/icons";
import { PersonTime } from "@/components/shared/PersonTime";
import type { TimeFormat } from "@/lib/timeFormat";

function groupOf(permission: string) {
  const head = permission.split(".")[0];
  return head.charAt(0).toUpperCase() + head.slice(1);
}

export function AdminDetail({ id }: { id: string }) {
  const data = useQuery(api.users.listAdmins, {});
  const catalogue = useQuery(api.users.listPermissionCatalogue, {});
  const me = useQuery(api.users.getMe);
  const save = useMutation(api.users.setUserPermissions);

  const admin = data?.admins.find((a) => a.externalId === id);
  const timeFormat: TimeFormat = me?.timeFormat ?? "24h";

  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  // Hydrate the editor from whatever is in force right now.
  useEffect(() => {
    if (!admin || draft !== null) return;
    setDraft(admin.effectivePermissions);
  }, [admin, draft]);

  if (data === undefined) return <div className="body">Loading…</div>;
  if (!admin) {
    return (
      <div>
        <Link href="/admin/people" className="link body-sm">
          <ArrowLeft size={13} className="inline me-1" /> Back to People
        </Link>
        <div className="card" style={{ padding: 28, marginTop: 16 }}>Admin not found.</div>
      </div>
    );
  }

  const editable = data.viewerIsSuperadmin && !admin.superadmin;
  const groups = [...new Set((catalogue?.all ?? []).map(groupOf))];
  const initials = admin.name.split(" ").map((p) => p[0]).join("").slice(0, 2);
  const dirty =
    draft !== null &&
    JSON.stringify([...draft].sort()) !==
      JSON.stringify([...admin.effectivePermissions].sort());

  async function persist(next: string[] | null) {
    setSaving(true);
    try {
      await save({ externalId: id, permissions: next });
      toast.success(next ? "Access updated" : "Back to the admin defaults");
      setDraft(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 940, margin: "0 auto" }}>
      <Link href="/admin/people" className="link body-sm" style={{ display: "inline-block", marginBottom: 16 }}>
        <ArrowLeft size={13} className="inline me-1" /> Back to People
      </Link>

      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <span className="avatar avatar-lg">{initials}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h1 className="h1" style={{ margin: 0 }}>{admin.name}</h1>
              {admin.superadmin && (
                <span className="pill pill-tenant" style={{ fontSize: 11 }}>Platform owner</span>
              )}
              {admin.externalId === data.viewerExternalId && (
                <span className="pill pill-new" style={{ fontSize: 11 }}>You</span>
              )}
            </div>
            <div className="body" style={{ marginTop: 4 }}>{admin.email}</div>
            <div className="body-sm" style={{ marginTop: 6, color: "var(--omnic-gray-500)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {admin.phone ? (
                <a className="link" href={`https://wa.me/${admin.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">
                  {admin.phone}
                </a>
              ) : (
                <span>No phone on file</span>
              )}
              <span>·</span>
              <PersonTime
                tz={admin.timezone}
                fmt={timeFormat}
                possessive={admin.externalId === data.viewerExternalId ? "your" : "their"}
                fixHref={admin.externalId === data.viewerExternalId ? "/admin/profile" : undefined}
              />
              {admin.joinedAt && (
                <>
                  <span>·</span>
                  <span>joined {new Date(admin.joinedAt).toLocaleDateString()}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <div className="h3" style={{ margin: 0 }}>Permissions</div>
          <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
            {admin.customPermissions ? "Custom list" : "Admin defaults"}
          </span>
        </div>
        <p className="body-sm" style={{ margin: "6px 0 14px" }}>
          {admin.superadmin
            ? "The platform owner runs the software itself — this access can't be edited or removed from inside an academy."
            : editable
              ? "Ticking anything switches this person from the role defaults to a custom list. Untick everything and reset to hand them back the defaults."
              : "Only the platform owner can change another admin's access."}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {groups.map((group) => (
            <div key={group}>
              <div className="label" style={{ marginBottom: 6 }}>{group}</div>
              {(catalogue?.all ?? [])
                .filter((p) => groupOf(p) === group)
                .map((p) => {
                  const on = admin.superadmin
                    ? true
                    : (draft ?? admin.effectivePermissions).includes(p);
                  return (
                    <label
                      key={p}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "3px 0",
                        cursor: editable ? "pointer" : "default",
                        opacity: editable ? 1 : 0.75,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!editable || saving}
                        onChange={(e) => {
                          const base = draft ?? admin.effectivePermissions;
                          setDraft(
                            e.target.checked
                              ? [...base, p]
                              : base.filter((x) => x !== p)
                          );
                        }}
                      />
                      <span className="body-sm" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                        {p}
                      </span>
                    </label>
                  );
                })}
            </div>
          ))}
        </div>

        {editable && (
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button
              className="btn btn-tenant"
              disabled={!dirty || saving}
              onClick={() => void persist(draft ?? [])}
            >
              <Icon name="check" size={14} /> {saving ? "Saving…" : "Save access"}
            </button>
            {dirty && (
              <button className="btn btn-secondary" disabled={saving} onClick={() => setDraft(null)}>
                Discard changes
              </button>
            )}
            {admin.customPermissions && (
              <button
                className="btn btn-ghost"
                disabled={saving}
                onClick={() => {
                  if (!confirm("Hand this admin back the default access?")) return;
                  void persist(null);
                }}
              >
                <Icon name="refresh" size={14} /> Reset to defaults
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
