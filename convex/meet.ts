"use node";

// I.2 — Google Meet auto-create via Google Calendar API.
// Best-effort: every action gracefully no-ops when GOOGLE_CLIENT_ID /
// GOOGLE_CLIENT_SECRET aren't set, or when the target teacher hasn't
// connected their Google account. Live lessons still work via the
// existing manual-paste link.

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1";

interface OAuthEnv {
  clientId: string;
  clientSecret: string;
}

function getOAuthEnv(): OAuthEnv | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function refreshAccessToken(
  refreshToken: string,
  env: OAuthEnv
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status})`);
  }
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("No access_token in response");
  return j.access_token;
}

/**
 * Best-effort: returns { meetLink, eventId } when the teacher has a
 * stored refresh token AND the GOOGLE_CLIENT_* env vars are set.
 * Returns null and writes a console warning otherwise. Callers should
 * treat null as "fall back to manual paste".
 */
export const createCalendarEvent = action({
  args: {
    teacherId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    date: v.string(), // YYYY-MM-DD
    startTime: v.string(), // HH:mm
    endTime: v.string(), // HH:mm
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const env = getOAuthEnv();
    if (!env) {
      console.warn("[meet] GOOGLE_CLIENT_* env vars not set");
      return null;
    }
    const refreshToken: string | null = await ctx.runQuery(
      internal.meetInternal._getRefreshToken,
      { teacherId: args.teacherId }
    );
    if (!refreshToken) {
      console.warn("[meet] teacher has no Google refresh token", args.teacherId);
      return null;
    }
    let accessToken: string;
    try {
      accessToken = await refreshAccessToken(refreshToken, env);
    } catch (err) {
      console.error("[meet] refresh failed", err);
      return null;
    }
    const tz = args.timezone ?? "UTC";
    const startISO = `${args.date}T${args.startTime}:00`;
    const endISO = `${args.date}T${args.endTime}:00`;
    const body = {
      summary: args.title,
      description: args.description ?? "",
      start: { dateTime: startISO, timeZone: tz },
      end: { dateTime: endISO, timeZone: tz },
      conferenceData: {
        createRequest: {
          requestId: `omnic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };
    const res = await fetch(CAL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[meet] calendar insert failed", res.status, await res.text());
      return null;
    }
    const j = (await res.json()) as {
      hangoutLink?: string;
      id?: string;
      conferenceData?: {
        entryPoints?: { entryPointType: string; uri: string }[];
      };
    };
    const meetLink =
      j.hangoutLink ??
      j.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === "video"
      )?.uri ??
      null;
    if (!meetLink) {
      console.warn("[meet] response had no Meet link", j);
      return null;
    }
    return { meetLink, googleEventId: j.id ?? null };
  },
});
