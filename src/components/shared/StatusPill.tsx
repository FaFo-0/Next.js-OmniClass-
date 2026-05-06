// Capsule for entity status. Colors driven by globals.css `.pill-*` classes.

const MAP: Record<string, string> = {
  active: "pill-active",
  Active: "pill-active",
  Finalized: "pill-active",
  Approved: "pill-active",
  Published: "pill-active",
  Paid: "pill-active",
  paused: "pill-paused",
  Paused: "pill-paused",
  Generating: "pill-paused",
  cancelled: "pill-cancelled",
  Cancelled: "pill-cancelled",
  Overdue: "pill-cancelled",
  Unpaid: "pill-cancelled",
  Failed: "pill-cancelled",
  trial: "pill-trial",
  Trial: "pill-trial",
  Transcribed: "pill-trial",
  Review: "pill-trial",
  New: "pill-new",
  Draft: "pill-new",
  Pending: "pill-new",
  Upcoming: "pill-tenant",
  upcoming: "pill-tenant",
  Live: "pill-red",
  Completed: "pill-new",
};

export function StatusPill({ status }: { status: string }) {
  const cls = MAP[status] ?? "pill-new";
  return <span className={`pill ${cls}`}>{status}</span>;
}
