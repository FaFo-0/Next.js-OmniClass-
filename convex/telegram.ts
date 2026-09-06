import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireTenant } from "./lib/tenant";
import { telegramMessage, type NotifRole } from "./lib/notificationRegistry";
import { telegramFailureState } from "./lib/telegramDelivery";

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
const telegramCommand = v.union(
  v.literal("status"), v.literal("next"), v.literal("today"), v.literal("homework"),
  v.literal("balance"), v.literal("study"), v.literal("recent")
);

/** Read-only account snapshot for Telegram commands. No mutation is reachable here. */
export const getChatSnapshot = internalQuery({
  args: { chatId: v.string(), command: telegramCommand },
  handler: async (ctx, { chatId, command }) => {
    const user = await ctx.db.query("users").withIndex("by_telegramChatId", (q) => q.eq("telegramChatId", chatId)).unique();
    if (!user) return null;
    const today = new Date().toISOString().slice(0, 10);
    const eventRows = user.role === "student"
      ? await ctx.db.query("scheduleEvents").withIndex("by_organization_and_studentId", (q) => q.eq("organizationId", user.organizationId).eq("studentId", user.externalId)).order("asc").take(100)
      : user.role === "teacher"
        ? await ctx.db.query("scheduleEvents").withIndex("by_organization_and_teacherId", (q) => q.eq("organizationId", user.organizationId).eq("teacherId", user.externalId)).order("asc").take(100)
        : await ctx.db.query("scheduleEvents").withIndex("by_organization_and_date", (q) => q.eq("organizationId", user.organizationId).gte("date", today)).order("asc").take(100);
    const events = eventRows.filter((event) => !event.isDeleted && event.status === "scheduled" && event.date >= today);
    if (command === "status") return { name: user.name, role: user.role, locale: user.locale ?? "en", organizationId: user.organizationId };
    if (command === "next" || command === "today") {
      return { name: user.name, role: user.role, locale: user.locale ?? "en", events: (command === "today" ? events.filter((event) => event.date === today) : events).slice(0, 5).map((event) => ({ id: event._id, title: event.title, date: event.date, startTime: event.startTime, endTime: event.endTime, meetLink: event.googleMeetLink })) };
    }
    if (command === "homework") {
      const rows = user.role === "student"
        ? await ctx.db.query("homework").withIndex("by_organization_and_studentId", (q) => q.eq("organizationId", user.organizationId).eq("studentId", user.externalId)).order("desc").take(20)
        : user.role === "teacher"
          ? await ctx.db.query("homework").withIndex("by_organization_and_teacherId", (q) => q.eq("organizationId", user.organizationId).eq("teacherId", user.externalId)).order("desc").take(20)
          : await ctx.db.query("homework").withIndex("by_organization", (q) => q.eq("organizationId", user.organizationId)).order("desc").take(20);
      return { name: user.name, role: user.role, locale: user.locale ?? "en", homework: rows.slice(0, 8).map((row) => ({ id: row._id, title: row.title, status: row.status, dueAt: row.dueAt })) };
    }
    if (command === "balance") {
      const grants = await ctx.db.query("pointGrants").withIndex("by_organization_and_studentId", (q) => q.eq("organizationId", user.organizationId).eq("studentId", user.externalId)).collect();
      return { name: user.name, role: user.role, locale: user.locale ?? "en", lessons: grants.filter((grant) => !grant.isExpired && grant.remainingPoints > 0).reduce((sum, grant) => sum + grant.remainingPoints, 0) };
    }
    if (command === "study") {
      const cards = await ctx.db.query("srsCards").withIndex("by_organization_and_ownerId_and_nextReviewDate", (q) => q.eq("organizationId", user.organizationId).eq("ownerId", user.externalId).lte("nextReviewDate", today)).collect();
      return { name: user.name, role: user.role, locale: user.locale ?? "en", dueCards: cards.filter((card) => !card.isDeleted).length };
    }
    const notifications = await ctx.db.query("notifications").withIndex("by_organization_and_recipientId", (q) => q.eq("organizationId", user.organizationId).eq("recipientId", user.externalId)).order("desc").take(5);
    return { name: user.name, role: user.role, locale: user.locale ?? "en", notifications: notifications.filter((row) => !row.withdrawnAt).map((row) => ({ id: row._id, kind: row.kind, payload: row.payload, link: row.link, createdAt: row.createdAt })) };
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
      role: NotifRole;
      locale: "en" | "ru" | "ar";
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
        // Delivered already, created before the member connected, or withdrawn
        // by a compensating action (e.g. discarded lesson start): never send.
        if (
          notification.telegramSentAt ||
          notification.telegramFailedAt ||
          notification.createdAt < member.telegramConnectedAt ||
          notification.withdrawnAt
        )
          continue;
        deliveries.push({
          notificationId: notification._id,
          chatId: member.telegramChatId,
          kind: notification.kind,
          payload: notification.payload as NotificationPayload,
          link: notification.link,
          role: member.role as NotifRole,
          locale: member.locale ?? "en",
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
    await ctx.db.patch(notificationId, {
      telegramSentAt: new Date().toISOString(),
      telegramLastError: undefined,
      telegramFailedAt: undefined,
    });
  },
});

export const recordDeliveryFailure = internalMutation({
  args: { notificationId: v.id("notifications"), error: v.string() },
  handler: async (ctx, { notificationId, error }) => {
    const notification = await ctx.db.get(notificationId);
    if (!notification || notification.telegramSentAt || notification.withdrawnAt) return;
    await ctx.db.patch(
      notificationId,
      telegramFailureState(error, notification.telegramAttemptCount ?? 0, new Date().toISOString())
    );
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
        const message = telegramMessage(item.kind, item.payload, item.link, item.role, item.locale);
        const body: Record<string, unknown> = {
          chat_id: item.chatId,
          text: message.text,
          disable_web_page_preview: true,
        };
        const absoluteButton = absoluteAppUrl(message.buttonUrl);
        if (absoluteButton) {
          body.reply_markup = {
            inline_keyboard: [[{ text: message.buttonLabel ?? "Open OmniClass", url: absoluteButton }]],
          };
        }
        await sendTelegramMessage(item.chatId, body);
        await ctx.runMutation(internal.telegram.markDelivered, {
          notificationId: item.notificationId as Id<"notifications">,
        });
        delivered += 1;
      } catch (error) {
        // The bell remains the system of record. Persist a bounded delivery
        // diagnostic: temporary failures retry; invalid/blocked chats stop.
        await ctx.runMutation(internal.telegram.recordDeliveryFailure, {
          notificationId: item.notificationId as Id<"notifications">,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error("[telegram] delivery failed", item.notificationId, error);
      }
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
        await safeSend(chatId, {
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
      await safeSend(chatId, { text: textByOutcome[result.outcome] });
      return { handled: true, outcome: result.outcome };
    }
    if (/^\/stop(?:@\w+)?$/i.test(text)) {
      const disconnected = await ctx.runMutation(internal.telegram.disconnectChat, { chatId });
      await safeSend(chatId, {
        text: disconnected
          ? "Telegram notifications are disconnected. You can reconnect from your OmniClass profile whenever you want."
          : "This chat is not connected to an OmniClass account.",
      });
      return { handled: true, outcome: "stopped" };
    }
    if (/^\/help(?:@\w+)?$/i.test(text)) {
      await safeSend(chatId, { text: "OmniClass bot (read-only)\n/status — account and language\n/next — next lesson\n/today — today’s lessons\n/homework — homework list\n/balance — lessons remaining\n/study — flashcards due\n/recent — recent notifications\n\nUse the buttons to open the correct page in OmniClass. Data changes happen on the website." });
      return { handled: true, outcome: "help" };
    }
    if (/^\/(?:status|next|today|homework|balance|study|recent)(?:@\w+)?$/i.test(text)) {
      const command = text.slice(1).split("@")[0].toLowerCase() as "status" | "next" | "today" | "homework" | "balance" | "study" | "recent";
      const snapshot = await ctx.runQuery(internal.telegram.getChatSnapshot, { chatId, command });
      if (!snapshot) {
        await safeSend(chatId, { text: "Connect this bot from your OmniClass Profile first, then try the command again." });
        return { handled: true, outcome: "not_connected" };
      }
      const result = formatReadOnlyCommand(command, snapshot as Record<string, any>);
      try {
        await sendTelegramMessage(chatId, {
          chat_id: chatId,
          text: result.text,
          disable_web_page_preview: true,
          reply_markup: result.buttonUrl
            ? { inline_keyboard: [[{ text: result.buttonLabel ?? "Open OmniClass", url: absoluteAppUrl(result.buttonUrl) }]] }
            : undefined,
        });
      } catch (error) {
        console.error("[telegram] command response failed", chatId, error);
      }
      return { handled: true, outcome: command };
    }
    await safeSend(chatId, {
      text: "For your privacy, this bot only retrieves your OmniClass information and sends notifications. Connect it from OmniClass → Profile, or send /stop to disconnect.",
    });
    return { handled: true };
  },
});

function formatReadOnlyCommand(command: "status" | "next" | "today" | "homework" | "balance" | "study" | "recent", snapshot: Record<string, any>): { text: string; buttonUrl?: string; buttonLabel?: string } {
  const portal = (student: string, teacher: string, admin: string) => snapshot.role === "teacher" ? teacher : snapshot.role === "admin" ? admin : student;
  if (command === "status") return { text: `Account: ${snapshot.name}\nRole: ${snapshot.role}\nNotification language: ${snapshot.locale.toUpperCase()}`, buttonUrl: portal("/student/profile", "/teacher/profile", "/admin/profile"), buttonLabel: "Open Profile" };
  if (command === "balance") return { text: `Lessons remaining: ${snapshot.lessons ?? 0}`, buttonUrl: portal("/student/billing", "/teacher", "/admin/billing"), buttonLabel: "Open Billing" };
  if (command === "study") return { text: `Flashcards due: ${snapshot.dueCards ?? 0}`, buttonUrl: portal("/student/study", "/teacher", "/admin"), buttonLabel: "Open Study" };
  if (command === "homework") {
    const rows = (snapshot.homework ?? []) as Array<{ id: string; title: string; status: string; dueAt?: string }>;
    return { text: rows.length ? rows.map((row) => `• ${row.title} — ${row.status}${row.dueAt ? ` — due ${row.dueAt}` : ""}`).join("\n") : "No homework found.", buttonUrl: portal("/student/homework", "/teacher/sessions", "/admin/sessions"), buttonLabel: "Open Homework" };
  }
  if (command === "recent") {
    const rows = (snapshot.notifications ?? []) as Array<{ kind: string; createdAt: string }>;
    return { text: rows.length ? rows.map((row) => `• ${row.kind.replaceAll("_", " ")} — ${row.createdAt.slice(0, 10)}`).join("\n") : "No recent notifications." , buttonUrl: portal("/student", "/teacher", "/admin"), buttonLabel: "Open OmniClass" };
  }
  const rows = (snapshot.events ?? []) as Array<{ title: string; date: string; startTime: string; endTime: string; meetLink?: string }>;
  const text = rows.length ? rows.map((event) => `• ${event.title} — ${event.date} ${event.startTime}–${event.endTime}${event.meetLink ? `\n  Join: ${event.meetLink}` : ""}`).join("\n") : "No lessons found.";
  return { text, buttonUrl: portal("/student/calendar", "/teacher/calendar", "/admin/calendar"), buttonLabel: "Open Calendar" };
}

// A confirmation the bot can't deliver (Telegram down, chat missing) must not
// turn into a webhook 500 — that would make Telegram retry an update we have
// already consumed. Consume first, confirm best-effort.
async function safeSend(chatId: string, message: { text: string; buttonUrl?: string; buttonLabel?: string }) {
  try {
    await sendTelegramMessage(chatId, message);
  } catch (error) {
    console.error("[telegram] confirmation failed", chatId, error);
  }
}

function absoluteAppUrl(path?: string): string | undefined {
  if (!path) return undefined;
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl || !/^https:\/\//.test(appUrl) || !path.startsWith("/")) return undefined;
  return `${appUrl}${path}`;
}

async function sendTelegramMessage(chatId: string, body: Record<string, unknown>) {
  const token = configuredToken();
  const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed (${response.status}): ${await response.text()}`);
}
