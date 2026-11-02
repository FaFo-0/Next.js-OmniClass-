import { CheckCircle2, Circle } from "lucide-react";

type Connection = { connected: boolean; connectedAt: string | null };

/** Staff-only display; linking an account remains the member's own action. */
export function TelegramConnectionStatus({ connection }: { connection: Connection }) {
  return <span
    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${connection.connected ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
    aria-label={`Telegram: ${connection.connected ? "Connected" : "Not connected"}`}
  >
    {connection.connected ? <CheckCircle2 size={13} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}
    {connection.connected ? "Connected" : "Not connected"}
  </span>;
}

export function TelegramConnectionDetails({ connection }: { connection: Connection }) {
  const connectedDate = connection.connectedAt && Number.isFinite(Date.parse(connection.connectedAt))
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "Asia/Almaty" }).format(new Date(connection.connectedAt))
    : null;
  return <section className="card mb-4 p-5" aria-label="Telegram connection">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="h3">Telegram notifications</h2>
      <TelegramConnectionStatus connection={connection} />
    </div>
    <p className="body-sm mt-2">
      {connection.connected
        ? connectedDate ? `Account connected on ${connectedDate}.` : "This account is connected to the notification bot."
        : "Ask them to open their profile, go to Telegram notifications, and connect their account."}
    </p>
  </section>;
}
