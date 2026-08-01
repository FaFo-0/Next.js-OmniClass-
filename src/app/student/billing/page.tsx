"use client";

// Student lesson packs. Payments are not integrated yet, so this page does
// the honest thing: shows the real catalogue with real prices and sends the
// academy a request. No checkout that can't take money.

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { toast } from "sonner";
import { Icon } from "@/components/shared/icons";

function priceLabel(pkg: any) {
  if (pkg.priceLocal && pkg.currency) {
    return `${pkg.priceLocal.toLocaleString()} ${pkg.currency}`;
  }
  return `$${pkg.priceUSD.toLocaleString()}`;
}

export default function StudentBillingPage() {
  const packages = useQuery(api.points.listPackages, { activeOnly: true }) ?? [];
  const balance = useQuery(api.points.getBalance, {});
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const requestLessons = useMutation(api.points.requestLessons);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requested, setRequested] = useState<string[]>([]);

  async function request(pkg: any) {
    setRequesting(pkg._id);
    try {
      await requestLessons({ packageId: pkg._id });
      setRequested((prev) => [...prev, pkg._id]);
      toast.success("Your academy has been notified");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRequesting(null);
    }
  }

  const left = balance?.balance ?? 0;

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 className="h1" style={{ marginBottom: 4 }}>Lessons</h1>
      <p className="body-sm" style={{ marginBottom: 20 }}>
        Pick a pack and we&apos;ll get back to you with payment details. Lessons
        are added to your balance once payment clears.
      </p>

      <div className="card" style={{ padding: 20, marginBottom: 20, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, color: left === 0 ? "var(--omnic-red)" : undefined }}>
            {left}
          </div>
          <div className="body-sm">lesson{left === 1 ? "" : "s"} left</div>
        </div>
        {balance?.nextExpiresAt && left > 0 && (
          <div className="body-sm">
            Next expiry <strong>{balance.nextExpiresAt}</strong>
          </div>
        )}
      </div>

      {packages.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <div className="body">No packs are on sale right now.</div>
          {tenant?.supportEmail && (
            <a className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} href={`mailto:${tenant.supportEmail}`}>
              Contact your academy
            </a>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
          {packages.map((pkg: any) => {
            const done = requested.includes(pkg._id);
            return (
              <div key={pkg._id} className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>{pkg.name}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "var(--brand-purple)" }}>
                  {priceLabel(pkg)}
                </div>
                <div className="body-sm">
                  {pkg.points} lesson{pkg.points === 1 ? "" : "s"}
                  {pkg.expiryDays ? ` · valid ${pkg.expiryDays} days from first use` : ""}
                </div>
                <button
                  className="btn btn-tenant"
                  style={{ marginTop: "auto" }}
                  disabled={requesting === pkg._id || done}
                  onClick={() => void request(pkg)}
                >
                  {done ? (
                    <>
                      <Icon name="check" size={14} /> Requested
                    </>
                  ) : requesting === pkg._id ? (
                    "Sending…"
                  ) : (
                    "Request this pack"
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="body-sm" style={{ marginTop: 16, color: "var(--omnic-gray-500)" }}>
        Online payment isn&apos;t available yet — your academy will contact you
        to arrange it{tenant?.supportEmail ? <> or write to <a className="link" href={`mailto:${tenant.supportEmail}`}>{tenant.supportEmail}</a></> : null}.
      </p>
    </div>
  );
}
