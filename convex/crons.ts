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

// Optional Telegram delivery is an outbox: the bell stays the system of record,
// then this picks up new notifications for members who chose to connect a bot.
crons.interval(
  "deliver Telegram notifications",
  { minutes: 1 },
  internal.telegram.deliverPending,
  {}
);

// §13.2 — retired 2026-09-07: the finite Repeat-this-week inside
// calendar.confirmBookingBatch replaced the open-ended materializer. The
// pause auto-resume still runs BEFORE any per-student slot work.
crons.cron(
  "resume expired pauses",
  "30 1 * * *",
  internal.calendar.resumeExpiredPauses,
  {}
);

// Money that a human has to type in — salary, ads, subscriptions. Once per
// period per reminder; the cron nags, it never invents an amount.
crons.cron(
  "finance entry reminders",
  "0 6 * * *",
  internal.finance.notifyDueReminders,
  {}
);

// Transcription is the one cost the system can meter itself. Booked on the
// 1st for the month that just ended, flagged as an estimate.
crons.cron(
  "accrue transcription costs",
  "0 3 1 * *",
  internal.finance.accrueAiCosts,
  {}
);

export default crons;
