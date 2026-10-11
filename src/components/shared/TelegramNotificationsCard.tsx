"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { toast } from "sonner";
import { Icon } from "@/components/shared/icons";

/**
 * A Telegram account is deliberately connected from the signed-in profile,
 * never by a phone number. The bot's short-lived start code is both the proof
 * of account control and a desktop-safe fallback users can paste manually.
 */
export function TelegramNotificationsCard() {
  const t = useTranslations("telegram");
  const locale = useLocale();
  const status = useQuery(api.telegram.getMyStatus);
  const createLink = useMutation(api.telegram.createLink);
  const disconnect = useMutation(api.telegram.disconnectMine);
  const [connecting, setConnecting] = useState(false);
  const [link, setLink] = useState<{ url: string; code: string; expiresAt: string } | null>(null);

  async function beginConnection() {
    setConnecting(true);
    try {
      const next = await createLink();
      setLink(next);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectTelegram() {
    try {
      await disconnect();
      setLink(null);
      toast.success(t("disconnectedToast"));
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
        <span style={{ color: "#229ED9", display: "inline-flex" }}><Icon name="send" size={20} stroke="#229ED9" /></span>
        <div className="h3">{t("profileTitle")}</div>
      </div>
      {status?.connected ? (
        <>
          <p className="body-sm" style={{ marginBottom: 12 }}>
            {t("connectedDetails")}
          </p>
          <button className="btn btn-secondary btn-sm" onClick={() => void disconnectTelegram()}>
            {t("disconnect")}
          </button>
        </>
      ) : link ? (
        <>
          <p className="body-sm" style={{ marginBottom: 12 }}>
            {t("startHint")}
          </p>
          <a className="btn btn-tenant btn-sm" href={link.url} target="_blank" rel="noreferrer">
            <Icon name="external" size={14} /> {t("openBot")}
          </a>
          <div className="body-sm" style={{ marginTop: 12 }}>
            {t("codeHint")}
          </div>
          <code dir="ltr" style={{ display: "block", marginTop: 6, padding: 8, borderRadius: 6, background: "var(--omnic-gray-50)", fontSize: 12, overflowWrap: "anywhere" }}>
            /start {link.code}
          </code>
          <div className="body-sm" style={{ marginTop: 8, color: "var(--omnic-gray-500)" }}>
            {t("expires", { time: new Date(link.expiresAt).toLocaleString(locale) })}
          </div>
        </>
      ) : (
        <>
          <p className="body-sm" style={{ marginBottom: 12 }}>
            {t("optionalDetails")}
          </p>
          <button className="btn btn-tenant btn-sm" onClick={() => void beginConnection()} disabled={connecting}>
            <Icon name="send" size={14} /> {connecting ? t("connecting") : t("cta")}
          </button>
        </>
      )}
    </div>
  );
}
