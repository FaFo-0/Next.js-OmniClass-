"use client";

// Persistent Telegram adoption prompt for the STUDENT and TEACHER main
// dashboards. Renders nothing when the member is already connected or while
// the status is loading; disappears reactively the moment they link a chat
// (and comes back if they disconnect). Explicitly not shown to admins here.

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { toast } from "sonner";
import { Icon } from "@/components/shared/icons";
import { useTranslations } from "next-intl";

export function TelegramConnectPrompt() {
  const t = useTranslations("telegram");
  const status = useQuery(api.telegram.getMyStatus);
  const createLink = useMutation(api.telegram.createLink);
  const [connecting, setConnecting] = useState(false);
  const [link, setLink] = useState<{
    url: string;
    code: string;
    expiresAt: string;
  } | null>(null);

  // Loading or connected → nothing to show.
  if (!status || status.connected) return null;

  async function beginConnection() {
    setConnecting(true);
    try {
      setLink(await createLink());
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        flexWrap: "wrap",
        padding: 14,
        marginBottom: 24,
        borderColor: "rgba(34,158,217,0.35)",
        background: "rgba(34,158,217,0.06)",
      }}
    >
      <span
        style={{
          color: "#229ED9",
          display: "inline-flex",
          flexShrink: 0,
        }}
      >
        <Icon name="send" size={22} stroke="#229ED9" />
      </span>
      {link ? (
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div className="body" style={{ fontWeight: 600 }}>
            {t("openBot")}
          </div>
          <div className="body-sm" style={{ marginTop: 2 }}>
            {t("codeHint")}
          </div>
          <code
            style={{
              display: "inline-block",
              marginTop: 6,
              padding: "4px 8px",
              borderRadius: 6,
              background: "var(--omnic-gray-50)",
              fontSize: 12,
            }}
          >
            /start {link.code}
          </code>
          <div className="body-sm" style={{ marginTop: 4, color: "var(--omnic-gray-500)" }}>
            {t("expires", { time: new Date(link.expiresAt).toLocaleString() })}
          </div>
          <a
            className="btn btn-tenant btn-sm"
            style={{ marginTop: 8 }}
            href={link.url}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="external" size={14} /> {t("openBot")}
          </a>
        </div>
      ) : (
        <>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div className="body" style={{ fontWeight: 600 }}>
              {t("title")}
            </div>
            <div className="body-sm" style={{ marginTop: 2 }}>
              {t("body")}
            </div>
          </div>
          <button
            className="btn btn-tenant btn-sm"
            onClick={() => void beginConnection()}
            disabled={connecting}
          >
            <Icon name="send" size={14} />{" "}
            {connecting ? t("connecting") : t("cta")}
          </button>
        </>
      )}
    </div>
  );
}