"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@convex";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DiscountCodes() {
  const t = useTranslations("discountCodes");
  const codes = useQuery(api.discountCodes.list, {});
  const create = useMutation(api.discountCodes.create);
  const setActive = useMutation(api.discountCodes.setActive);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("10");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await create({ code, percent: Number(percent), maxUses: maxUses ? Number(maxUses) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined });
      setCode("");
      toast.success(t("created"));
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="card" style={{ padding: 20, marginBottom: 20 }}>
    <h2 className="h2">{t("title")}</h2>
    <p className="body-sm mb-4">{t("hint")}</p>
    <form onSubmit={save} className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-0 flex-1 basis-64 gap-1">{t("code")}
        <div className="flex gap-2">
          <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required minLength={3} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,39}" dir="ltr" />
          <Button type="button" variant="outline" onClick={() => setCode(crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase())}>{t("generate")}</Button>
        </div>
      </label>
      <label className="grid gap-1">{t("percent")}<Input type="number" min={1} max={100} step={1} required value={percent} onChange={e => setPercent(e.target.value)} className="w-24" /></label>
      <label className="grid gap-1">{t("maxUses")}<Input type="number" min={1} step={1} value={maxUses} onChange={e => setMaxUses(e.target.value)} placeholder={t("unlimited")} className="w-36" /></label>
      <label className="grid min-w-0 gap-1">{t("expiry")}<Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></label>
      <Button type="submit" disabled={busy}>{t("create")}</Button>
    </form>
    <p className="body-sm mt-2">{t("limitHint")}</p>
    <div className="mt-4 grid gap-3">
      {codes === undefined ? <p className="body-sm">{t("loading")}</p> : codes.length === 0 ? <p className="body-sm">{t("empty")}</p> : codes.map(row => {
        const expired = Boolean(row.expiresAt && Date.parse(row.expiresAt) <= Date.now());
        const exhausted = row.maxUses !== undefined && row.usedCount >= row.maxUses;
        return <div key={row._id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="min-w-0 break-words">
            <strong dir="ltr">{row.code}</strong> · {row.percent}% · {t("uses", { count: row.usedCount, limit: row.maxUses ?? "∞" })}
            <div className="body-sm">{!row.active ? t("disabled") : expired ? t("expired") : exhausted ? t("exhausted") : t("active")}{row.expiresAt ? ` · ${new Date(row.expiresAt).toLocaleString()}` : ""}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(row.code); toast.success(t("copied")); } catch { toast.error(t("copyFailed")); } }}>{t("copy")}</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await setActive({ id: row._id, active: !row.active }); }
              catch (error) { toast.error((error as Error).message); }
              finally { setBusy(false); }
            }}>{row.active ? t("disable") : t("enable")}</Button>
          </div>
        </div>;
      })}
    </div>
  </section>;
}
