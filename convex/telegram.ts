import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireTenant } from "./lib/tenant";

const LINK_CODE_TTL_MS = 24 * 60 * 60_000;
const TELEGRAM_API = "https://api.telegram.org";

type NotificationPayload = Record<string, unknown>;

function configuredBotUsername(): string {
  const username = (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
    throw new Error("Telegram is not configured yet. Ask the academy to finish Telegram setup.");
  }
  return username;
}

function configuredToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  return token;
}

export const getMyStatus = query({
  handler: async (ctx) => {
    const { user } = await requireTenant(ctx);
    return {
      connected: Boolean(user.telegramChatId),
      connectedAt: user.telegramConnectedAt,
      linkExpiresAt: user.telegramLinkCodeExpiresAt,
    };
  },
});

/** Creates a one-time deep link from the signed-in member's account. */
export const createLink = mutation({
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    const botUsername = configuredBotUsername();
    const code = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();
    await ctx.db.patch(user._id, {
      telegramLinkCode: code,
      telegramLinkCodeExpiresAt: expiresAt,
    });
    return {
      url: `https://t.me/${botUsername}?start=${code}`,
      code,
      expiresAt,
      organizationId: orgId,
    };
  },
});

export const disconnectMine = mutation({
  handler: async (ctx) => {
    const { user } = await requireTenant(ctx);
    await ctx.db.patch(user._id, {
      telegramChatId: undefined,
      telegramConnectedAt: undefined,
      telegramLinkCode: undefined,
      telegramLinkCodeExpiresAt: undefined,
    });
  },
});

/** Called only from the Telegram webhook after it has validated its secret. */
export const consumeStartCode = internalMutation({
  args: { code: v.string(), chatId: v.string() },
  handler: async (ctx, { code, chatId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramLinkCode", (q) => q.eq("telegramLinkCode", code))
      .unique();
    if (!user || !user.telegramLinkCodeExpiresAt) return { outcome: "invalid" as const };
    if (new Date(user.telegramLinkCodeExpiresAt).getTime() < Date.now()) {
      await ctx.db.patch(user._id, {
        telegramLinkCode: undefined,
        telegramLinkCodeExpiresAt: undefined,
      });
      return { outcome: "expired" as const };
    }

    // One Telegram chat is deliberately one OmniClass identity. Linking a
    // second account makes the ownership change explicit instead of silently
    // delivering two people's private lesson updates into the same chat.
    const previous = await ctx.db
      .query("users")
      .withIndex("by_telegramChatId", (q) => q.eq("telegramChatId", chatId))
      .unique();
    if (previous && previous._id !== user._id) {
      await ctx.db.patch(previous._id, {
        telegramChatId: undefined,
        telegramConnectedAt: undefined,
      });
    }

    const connectedAt = new Date().toISOString();
    await ctx.db.patch(user._id, {
      telegramChatId: chatId,
      telegramConnectedAt: connectedAt,
      telegramLinkCode: undefined,
      telegramLinkCodeExpiresAt: undefined,
    });
    return { outcome: "connected" as const, userName: user.name };
  },
});

export const disconnectChat = internalMutation({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramChatId", (q) => q.eq("telegramChatId", chatId))
      .unique();
    if (!user) return false;
    await ctx.db.patch(user._id, {
      telegramChatId: undefined,
      telegramConnectedAt: undefined,
    });
    return true;
  },
});

export const listPendingDeliveries = internalQuery({
  handler: async (ctx) => {
    const members = await ctx.db.query("users").collect();
    const deliveries: Array<{
      notificationId: string;
      chatId: string;
      kind: string;
      payload: NotificationPayload;
      link?: string;
    }> = [];

    for (const member of members) {
      if (!member.telegramChatId || !member.telegramConnectedAt) continue;
      const notifications = await ctx.db
        .query("notifications")
        .withIndex("by_organization_and_recipientId", (q) =>
          q.eq("organizationId", member.organizationId).eq("recipientId", member.externalId)
        )
        .order("desc")
        .take(100);
      for (const notification of notifications) {
        if (notification.telegramSentAt || notification.createdAt < member.telegramConnectedAt) continue;
        deliveries.push({
          notificationId: notification._id,
          chatId: member.telegramChatId,
          kind: notification.kind,
          payload: notification.payload as NotificationPayload,
          link: notification.link,
        });
        if (deliveries.length >= 100) return deliveries;
      }
    }
    return deliveries;
  },
});

export const markDelivered = internalMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    await ctx.db.patch(notificationId, { telegramSentAt: new Date().toISOString() });
  },
});

/** Polls the lightweight notification outbox. It intentionally does not send
 * pre-link history, and one failed Telegram request never blocks other users. */
export const deliverPending = internalAction({
  handler: async (ctx) => {
    if (!process.env.TELEGRAM_BOT_TOKEN) return { configured: false, delivered: 0 };
    const deliveries = await ctx.runQuery(internal.telegram.listPendingDeliveries, {});
    let delivered = 0;
    for (const item of deliveries) {
      try {
        await sendTelegramMessage(item.chatId, notificationMessage(item.kind, item.payload, item.link));
      } catch (error) {
        // Telegram's 403 "bot was blocked" cannot be retried into success. The
        // bell still has the notification, and reconnecting creates a fresh
        // delivery channel without a per-minute failure loop.
        console.error("[telegram] delivery failed", item.notificationId, error);
      }
      await ctx.runMutation(internal.telegram.markDelivered, {
        notificationId: item.notificationId as any,
      });
      delivered += 1;
    }
    return { configured: true, delivered };
  },
});

/** Receives a validated Telegram Update from the HTTP route. */
export const handleUpdate = internalAction({
  args: { update: v.any() },
  handler: async (ctx, { update }): Promise<{ handled: boolean; outcome?: string }> => {
    const message = update?.message;
    if (!message || message.chat?.type !== "private" || typeof message.chat?.id !== "number") {
      return { handled: false };
    }
    const chatId = String(message.chat.id);
    const text = typeof message.text === "string" ? message.text.trim() : "";
    const start = text.match(/^\/start(?:@\w+)?(?:\s+([^\s]+))?$/i);
    if (start) {
      const code = start[1];
      if (!code) {
        await sendTelegramMessage(chatId, {
          text: "Open OmniClass → Profile → Telegram notifications, then use the Connect Telegram button.",
        });
        return { handled: true };
      }
      const result = (await ctx.runMutation(internal.telegram.consumeStartCode, { code, chatId })) as
        | { outcome: "connected"; userName: string }
        | { outcome: "expired" }
        | { outcome: "invalid" };
      const textByOutcome = {
        connected: `Telegram notifications are now connected to ${result.outcome === "connected" ? result.userName : "your account"}. You can send /stop here or disconnect from your OmniClass profile at any time.`,
        expired: "That connection link expired. Open OmniClass → Profile and create a fresh one.",
        invalid: "I don't recognize that connection link. Open OmniClass → Profile and create a fresh one.",
      };
      await sendTelegramMessage(chatId, { text: textByOutcome[result.outcome] });
      return { handled: true, outcome: result.outcome };
    }
    if (/^\/stop(?:@\w+)?$/i.test(text)) {
      const disconnected = await ctx.runMutation(internal.telegram.disconnectChat, { chatId });
      await sendTelegramMessage(chatId, {
        text: disconnected
          ? "Telegram notifications are disconnected. You can reconnect from your OmniClass profile whenever you want."
          : "This chat is not connected to an OmniClass account.",
      });
      return { handled: true, outcome: "stopped" };
    }
    await sendTelegramMessage(chatId, {
      text: "For your privacy, this bot only sends your OmniClass notifications. Connect it from OmniClass → Profile, or send /stop to disconnect.",
    });
    return { handled: true };
  },
});

function notificationMessage(kind: string, payload: NotificationPayload, link?: string) {
  const title = notificationTitle(kind, payload);
  const body = notificationBody(kind, payload);
  const meetLink = stringValue(payload.googleMeetLink);
  const lines = [`🔔 ${title}`, body];
  if (meetLink) lines.push(`\nJoin meeting: ${meetLink}`);
  const url = absoluteAppUrl(link ?? fallbackLink(kind, payload));
  return {
    text: lines.filter(Boolean).join("\n"),
    buttonUrl: url,
    buttonLabel: meetLink ? "Open lesson" : "Open OmniClass",
  };
}

function notificationTitle(kind: string, payload: NotificationPayload): string {
  switch (kind) {
    case "session_reminder": return payload.when === "24h" ? "Lesson tomorrow" : "Lesson starting soon";
    case "session_published": return "Lesson materials ready";
    case "homework_assigned": return "New homework";
    case "homework_submitted": return "Homework submitted";
    case "homework_reviewed": return "Homework reviewed";
    case "lesson_assigned": return "Lesson booked";
    case "lesson_cancelled": return "Lesson cancelled";
    case "lesson_rescheduled": return "Lesson moved";
    case "teacher_no_show": return "Teacher didn't show";
    case "achievement_unlocked": return "Achievement unlocked";
    case "payment_received": return "Payment complete";
    case "salary_paid": return "Payment sent";
    default: return kind.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
  }
}

function notificationBody(kind: string, payload: NotificationPayload): string {
  const title = stringValue(payload.title) ?? "Your lesson";
  const date = stringValue(payload.date);
  const time = stringValue(payload.startTime);
  const when = [date, time].filter(Boolean).join(" at ");
  switch (kind) {
    case "session_reminder": return `${title}${when ? ` — ${when}` : ""}.`;
    case "session_published": return `${title} — summary, vocabulary and flashcards are ready.`;
    case "homework_assigned": return `${stringValue(payload.title) ?? "Homework"} was assigned to you.`;
    case "homework_submitted": return `A student submitted ${stringValue(payload.title) ?? "their homework"} — ready to review.`;
    case "homework_reviewed": return `Your teacher reviewed ${stringValue(payload.title) ?? "your homework"}.`;
    case "lesson_assigned": return `A lesson was booked${when ? ` ${when}` : ""}.`;
    case "lesson_cancelled": return `A lesson was cancelled${when ? ` ${when}` : ""}.`;
    case "lesson_rescheduled": return `Your lesson was moved to ${[stringValue(payload.toDate), stringValue(payload.toTime)].filter(Boolean).join(" at ") || "a new time"}.`;
    case "teacher_no_show": return `${title} was marked a teacher no-show${payload.refunded ? " — your lesson was returned." : "."}`;
    case "achievement_unlocked": return stringValue(payload.name) ?? "You earned a new achievement.";
    default: return stringValue(payload.reason) ?? "Open OmniClass for the details.";
  }
}

function fallbackLink(kind: string, payload: NotificationPayload): string | undefined {
  if (kind === "session_published") return stringValue(payload.lessonId) ? `/student/lessons/${payload.lessonId}` : "/student/lessons";
  if (["lesson_assigned", "lesson_cancelled", "lesson_rescheduled", "session_reminder", "teacher_no_show", "booking_reminder"].includes(kind)) return "/student/calendar";
  if (["homework_assigned", "homework_reviewed"].includes(kind)) return stringValue(payload.homeworkId) ? `/student/homework/${payload.homeworkId}` : "/student/homework";
  if (kind === "achievement_unlocked") return "/student/achievements";
  return undefined;
}

function absoluteAppUrl(path?: string): string | undefined {
  if (!path) return undefined;
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl || !/^https:\/\//.test(appUrl) || !path.startsWith("/")) return undefined;
  return `${appUrl}${path}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function sendTelegramMessage(chatId: string, message: { text: string; buttonUrl?: string; buttonLabel?: string }) {
  const token = configuredToken();
  const body: Record<string, unknown> = { chat_id: chatId, text: message.text, disable_web_page_preview: true };
  if (message.buttonUrl) {
    body.reply_markup = { inline_keyboard: [[{ text: message.buttonLabel ?? "Open OmniClass", url: message.buttonUrl }]] };
  }
  const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed (${response.status}): ${await response.text()}`);
}
