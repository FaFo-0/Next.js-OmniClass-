// H.12 — public HTTP endpoints.
// /ics/<token>  — RFC-5545 VCALENDAR for the matching student's
//                 upcoming scheduleEvents. Token = users.icsToken
//                 (opaque; revocable by re-issuing).

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { wallTimeToMs } from "./lib/time";

const http = httpRouter();

http.route({
  path: "/ics",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response("Missing token", { status: 400 });
    }
    const feed = (await ctx.runQuery(
      internal.icsInternal.eventsForToken,
      { token }
    )) as { orgTz: string; events: IcsEvent[] } | null;
    if (feed === null) {
      return new Response("Invalid token", { status: 404 });
    }
    const body = buildICS(feed.events, feed.orgTz);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "public, max-age=900",
      },
    });
  }),
});

type IcsEvent = {
  uid: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  description?: string;
  location?: string;
};

function buildICS(events: IcsEvent[], orgTz: string): string {
  const now = formatICSDate(new Date().toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Omnica//Omnica Class//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Omnica lessons",
    // Display hint only — every DTSTART/DTEND below is an absolute UTC instant.
    `X-WR-TIMEZONE:${orgTz}`,
  ];
  for (const e of events) {
    const startUtc = combineLocalToUTC(e.date, e.startTime, orgTz);
    const endUtc = combineLocalToUTC(e.date, e.endTime, orgTz);
    if (!startUtc || !endUtc) continue; // malformed row — skip, don't emit a bad VEVENT
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@omnica`,
      `DTSTAMP:${now}`,
      `DTSTART:${startUtc}`,
      `DTEND:${endUtc}`,
      `SUMMARY:${escapeICS(e.title)}`
    );
    if (e.description) {
      lines.push(`DESCRIPTION:${escapeICS(e.description)}`);
    }
    if (e.location) {
      lines.push(`LOCATION:${escapeICS(e.location)}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function combineLocalToUTC(date: string, hhmm: string, tz: string): string | null {
  // Rows store wall-clock time in the academy's timezone. An .ics feed is
  // read by clients in every zone, so it must carry absolute UTC instants —
  // parsing the wall time as if it were UTC shifts every lesson by the
  // academy's offset (5h for Almaty).
  const ms = wallTimeToMs(date, hhmm, tz);
  if (Number.isNaN(ms)) return null;
  return formatICSDate(new Date(ms).toISOString());
}

function formatICSDate(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICS(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export default http;
