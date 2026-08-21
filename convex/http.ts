// H.12 — public HTTP endpoints.
// /ics/<token>            — RFC-5545 VCALENDAR for the matching student's
//                           upcoming scheduleEvents. Token = users.icsToken
//                           (opaque; revocable by re-issuing).
// /lemonsqueezy/webhook   — POLICY §3 payment fulfilment. See convex/payments.ts.

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { wallTimeToMs } from "./lib/time";
import { lemonConfig } from "./payments";

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

// ─────────────────────────────────────────────────────────────────────
//  POLICY §3 — Lemon Squeezy webhook. The only thing that grants a paid
//  pack; the browser redirect after checkout is decorative.
// ─────────────────────────────────────────────────────────────────────

http.route({
  path: "/lemonsqueezy/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const { webhookSecret } = lemonConfig();
    if (!webhookSecret) {
      // Nothing can be verified, so nothing may be trusted. 503 rather than
      // 200: Lemon Squeezy retries, and a misconfigured deployment should
      // not silently swallow real orders.
      console.error("[lemonsqueezy] webhook hit with no signing secret set");
      return new Response("Webhook not configured", { status: 503 });
    }

    // The signature covers the exact bytes sent, so the body must be read raw
    // and parsed only after it verifies.
    const raw = await req.text();
    const signature = req.headers.get("X-Signature") ?? "";
    if (!(await verifySignature(raw, signature, webhookSecret))) {
      return new Response("Bad signature", { status: 401 });
    }

    let body: LemonPayload;
    try {
      body = JSON.parse(raw) as LemonPayload;
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }

    const eventName = body.meta?.event_name ?? "";
    const objectId = body.data?.id ? String(body.data.id) : "";
    if (!eventName || !objectId) {
      return new Response("Missing event name or id", { status: 400 });
    }

    const attrs = body.data?.attributes ?? {};
    const custom = body.meta?.custom_data ?? {};
    const amount =
      typeof attrs.total === "number" ? attrs.total / 100 : undefined;

    // Claim first. A null claim means we've already handled this delivery,
    // and a retry must be a no-op — answered 200 so it stops retrying.
    const eventId = await ctx.runMutation(internal.payments.claimEvent, {
      eventKey: `${eventName}:${objectId}`,
      eventName,
      orderId: objectId,
      orderNumber:
        attrs.order_number !== undefined ? String(attrs.order_number) : undefined,
      organizationId: str(custom.organizationId),
      studentId: str(custom.studentId),
      email: str(attrs.user_email),
      amount,
      currency: str(attrs.currency),
    });
    if (eventId === null) {
      return new Response("Already handled", { status: 200 });
    }

    if (eventName === "order_created") {
      // `paid` is the only status that means money actually moved. Anything
      // else (pending, failed) is recorded and left alone.
      if (attrs.status && attrs.status !== "paid") {
        await ctx.runMutation(internal.payments.ignoreEvent, {
          eventId,
          message: `Order status was "${attrs.status}", not paid`,
        });
        return new Response("Not paid", { status: 200 });
      }
      await ctx.runMutation(internal.payments.fulfillOrder, {
        eventId,
        organizationId: str(custom.organizationId),
        studentId: str(custom.studentId),
        packageId: str(custom.packageId),
        orderId: objectId,
      });
      // 200 even when fulfilment failed: the failure is recorded on the event
      // row for an admin to see, and retrying it would fail identically.
      return new Response("OK", { status: 200 });
    }

    if (eventName === "order_refunded") {
      await ctx.runMutation(internal.payments.refundOrder, {
        eventId,
        orderId: objectId,
        amount,
        currency: str(attrs.currency),
      });
      return new Response("OK", { status: 200 });
    }

    await ctx.runMutation(internal.payments.ignoreEvent, {
      eventId,
      message: `No handler for "${eventName}"`,
    });
    return new Response("Ignored", { status: 200 });
  }),
});

type LemonPayload = {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, unknown>;
  };
  data?: {
    id?: string | number;
    attributes?: {
      status?: string;
      total?: number;
      currency?: string;
      user_email?: string;
      order_number?: string | number;
    };
  };
};

/** Custom data comes back as strings, but never assume. */
function str(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

/**
 * Lemon Squeezy signs the raw body with HMAC-SHA256 and sends it hex-encoded
 * in `X-Signature`. Compared in constant time — a fast reject on the first
 * differing byte leaks how much of a forged signature was right.
 */
async function verifySignature(
  raw: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(raw)
  );
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const given = signature.trim().toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return diff === 0;
}

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
