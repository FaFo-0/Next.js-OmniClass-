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

// I.6 — teacher no-show ladder. Every 5 minutes is enough granularity
// for the 5/0/+10/+20 minute checkpoints.
crons.interval(
  "teacher no-show ladder",
  { minutes: 5 },
  internal.scheduleCron.checkTeacherNoShowsCron,
  {}
);

// §13.2 — materialize weekly recurring bookings ~7 days ahead.
// Twice daily: a mid-day balance top-up can unblock a skipped occurrence.
crons.cron(
  "materialize recurring bookings",
  "0 2,14 * * *",
  internal.calendar.materializeRecurring,
  {}
);

// POLICY §6 — auto-resume students whose pause window has ended. Runs before
// the materializer so a resumed student's slot is filled the same morning.
crons.cron(
  "resume expired pauses",
  "30 1 * * *",
  internal.calendar.resumeExpiredPauses,
  {}
);

export default crons;
