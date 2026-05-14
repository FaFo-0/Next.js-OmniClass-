import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// H.1 — expire point grants whose `expiresAt` is in the past.
// Daily at 00:05 UTC keeps the work small and predictable.
crons.cron(
  "expire point grants",
  "5 0 * * *",
  internal.points.expireDailyCron,
  {}
);

export default crons;
