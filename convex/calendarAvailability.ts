import { v, ConvexError } from "convex/values";
import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireTenant, tenantTable } from "./lib/tenant";
import { userHasPermission } from "./lib/permissions";
import {
  loadSlotSources,
  loadTeacherEvents,
  openRangesForDate,
  overlapConflict,
  orgTimezone,
  mondayKey,
} from "./calendar";
import {
  POLICY,
  ordinaryBookingBoundary,
  rescheduleVerdict,
  withinActionHorizon,
} from "./lib/policy";
import { wallTimeToMs, instantToZoned } from "./lib/time";

const minute = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const time = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const addDay = (date: string, count = 1) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + count * 86400000)
    .toISOString()
    .slice(0, 10);
function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
  );
}
function validCell(date: string, startTime: string) {
  if (!validDate(date) || !/^([01]\d|2[0-3]):(00|30)$/.test(startTime))
    throw new ConvexError("Invalid half-hour cell");
}
async function teacherTarget(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  user: Doc<"users">,
  requested?: string,
  eventId?: Doc<"scheduleEvents">["_id"],
) {
  if (!["student", "teacher", "admin"].includes(user.role))
    throw new ConvexError("Calendar access denied");
  let target =
    user.role === "student" ? user.teacherId : (requested ?? user.externalId);
  if (eventId) {
    const event = await tenantTable(ctx, orgId, "scheduleEvents").get(eventId);
    if (
      !event ||
      (user.role === "student" && event.studentId !== user.externalId) ||
      (user.role === "teacher" && event.teacherId !== user.externalId)
    )
      throw new ConvexError("Not your lesson");
    target = event.teacherId;
  }
  if (user.role === "teacher" && target !== user.externalId)
    throw new ConvexError("Not your calendar");
  if (user.role === "admin" && !userHasPermission(user, "lessons.view.any"))
    throw new ConvexError("Calendar access denied");
  if (!target) return null;
  const teacher = await ctx.db
    .query("users")
    .withIndex("by_organization_and_externalId", (q) =>
      q.eq("organizationId", orgId).eq("externalId", target!),
    )
    .unique();
  if (!teacher || teacher.role !== "teacher")
    throw new ConvexError("Teacher not found");
  return target;
}
function requireEditor(user: Doc<"users">) {
  if (
    (user.role !== "teacher" && user.role !== "admin") ||
    !userHasPermission(
      user,
      user.role === "teacher" ? "calendar.edit.full" : "scheduling.edit",
    )
  )
    throw new ConvexError("Availability editing is not permitted");
}
function cellOverride(
  rows: Awaited<ReturnType<typeof loadSlotSources>>["exceptions"],
  date: string,
  startTime: string,
) {
  const start = minute(startTime);
  const covering = rows.filter(
    (row) =>
      row.date === date &&
      !row.timeOffGroupId &&
      minute(row.startTime) <= start &&
      minute(row.endTime) >= start + 30,
  );
  const winner = covering.find((row) => row.kind === "closed") ?? covering[0];
  return {
    value: winner ? winner.kind === "open" : null,
    token: winner?.editToken ?? winner?.createdAt,
  };
}
function state(
  src: Awaited<ReturnType<typeof loadSlotSources>>,
  date: string,
  startTime: string,
  desired?: { value: boolean | null; token?: string },
) {
  const override = desired ?? cellOverride(src.exceptions, date, startTime);
  const start = minute(startTime);
  const inherited = src.vacancies
    .filter(
      (row) =>
        row.isActive &&
        row.dayOfWeek === new Date(`${date}T00:00:00Z`).getUTCDay() &&
        row.validFrom <= date &&
        (!row.validUntil || row.validUntil >= date) &&
        minute(row.startTime) <= start &&
        minute(row.endTime) >= start + 30,
    )
    .map(
      (row) =>
        `${row.startTime}:${row.endTime}:${row.validFrom}:${row.validUntil ?? ""}`,
    )
    .sort();
  return JSON.stringify({ override, inherited });
}
export const getCells = query({
  args: {
    fromDate: v.string(),
    toDate: v.string(),
    teacherId: v.optional(v.string()),
    eventId: v.optional(v.id("scheduleEvents")),
    studentId: v.optional(v.string()),
    nowTick: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    if (
      !validDate(args.fromDate) ||
      !validDate(args.toDate) ||
      args.toDate < args.fromDate ||
      (Date.parse(args.toDate) - Date.parse(args.fromDate)) / 86400000 > 40
    )
      throw new ConvexError("Invalid calendar period");
    const teacherId = await teacherTarget(
      ctx,
      orgId,
      user,
      args.teacherId,
      args.eventId,
    );
    const orgTz = await orgTimezone(ctx, orgId);
    if (!teacherId)
      return { cells: [], orgTz, studentBalance: 0, lessonCost: 1 };
    const src = await loadSlotSources(ctx, orgId, teacherId);
    const events = await loadTeacherEvents(
      ctx,
      orgId,
      teacherId,
      args.fromDate,
      args.toDate,
    );
    const event = args.eventId
      ? await tenantTable(ctx, orgId, "scheduleEvents").get(args.eventId)
      : null;
    const studentId =
      user.role === "student"
        ? user.externalId
        : (event?.studentId ?? args.studentId);
    if (user.role === "teacher" && args.studentId) {
      const student = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", args.studentId!),
        )
        .unique();
      if (!student || student.teacherId !== teacherId)
        throw new ConvexError("Student is not assigned to this teacher");
    }
    const own = studentId
      ? (
          await ctx.db
            .query("scheduleEvents")
            .withIndex("by_organization_and_studentId", (q) =>
              q.eq("organizationId", orgId).eq("studentId", studentId),
            )
            .collect()
        ).filter(
          (e) =>
            !e.isDeleted &&
            ["scheduled", "makeup"].includes(e.status) &&
            e._id !== args.eventId,
        )
      : [];
    const now = new Date();
    const today = instantToZoned(now, orgTz).date;
    const grants = studentId
      ? await ctx.db
          .query("pointGrants")
          .withIndex("by_organization_and_studentId", (q) =>
            q.eq("organizationId", orgId).eq("studentId", studentId),
          )
          .collect()
      : [];
    const balance = grants
      .filter(
        (g) => !g.isExpired && g.expiresAt >= today && g.remainingPoints > 0,
      )
      .reduce((sum, g) => sum + g.remainingPoints, 0);
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const activity = (settings?.activityTypes ?? []).find(
      (a) => a.isActive && !a.isGroup,
    );
    const boundary = ordinaryBookingBoundary(now, orgTz);
    const actor =
      user.role === "student"
        ? "student"
        : user.role === "teacher"
          ? "teacher"
          : "admin";
    const move = event ? rescheduleVerdict({ actor, event, now, orgTz }) : null;
    const editing =
      user.role !== "student" &&
      userHasPermission(
        user,
        user.role === "teacher" ? "calendar.edit.full" : "scheduling.edit",
      );
    const moving =
      user.role === "student" || userHasPermission(user, "calendar.edit.full");
    const cells = [];
    for (let date = args.fromDate; date <= args.toDate; date = addDay(date)) {
      const ranges = openRangesForDate(src, date);
      const timeOff = src.exceptions.some(
        (row) => row.date === date && !!row.timeOffGroupId,
      );
      for (let start = 0; start < 1440; start += 30) {
        const startTime = time(start);
        const startMs = wallTimeToMs(date, startTime, orgTz);
        const occupied = events.find(
          (e) =>
            e.date === date &&
            ["scheduled", "makeup"].includes(e.status) &&
            minute(e.startTime) < start + 30 &&
            start < minute(e.endTime),
        );
        const open =
          !timeOff &&
          ranges.some(
            (range) => range.startMin <= start && range.endMin >= start + 30,
          );
        const fullOpen =
          !timeOff &&
          ranges.some(
            (range) => range.startMin <= start && range.endMin >= start + 60,
          );
        const free =
          start <= 1380 &&
          !timeOff &&
          !overlapConflict(events, date, start, start + 60, args.eventId) &&
          !overlapConflict(own, date, start, start + 60);
        const caps =
          own.filter((e) => e.date === date).length <
            POLICY.maxStudentBookingsPerDay &&
          own.filter((e) => mondayKey(e.date) === mondayKey(date)).length <
            POLICY.maxStudentBookingsPerWeek;
        const canBook =
          user.role === "student" &&
          activity?.pointCost === 1 &&
          balance >= 1 &&
          caps &&
          fullOpen &&
          free &&
          startMs >= now.getTime() + POLICY.bookingMinNoticeHours * 3600000 &&
          startMs < boundary.upperExclusiveMs;
        const canMove =
          !(event?.date === date && event?.startTime === startTime) &&
          !!move?.allowed &&
          moving &&
          !event?.teacherStartedAt &&
          !event?.endedAt &&
          !event?.completedAt &&
          free &&
          startMs > now.getTime() &&
          (actor !== "teacher" ||
            withinActionHorizon(
              { date, startTime, status: "scheduled" },
              now,
              orgTz,
            )) &&
          (actor !== "student" ||
            (fullOpen &&
              caps &&
              (!move.chargesLesson ||
                balance >= (event?.pointCostSnapshot ?? 1))));
        cells.push({
          date,
          startTime,
          open,
          editable: editing && !timeOff && !occupied && startMs > now.getTime(),
          timeOff,
          busy: !!occupied,
          canBook,
          canMove: event
            ? canMove
            : actor !== "student" &&
              userHasPermission(user, "calendar.edit.full") &&
              free &&
              startMs > now.getTime(),
          eventId:
            occupied &&
            (actor !== "student" || occupied.studentId === user.externalId)
              ? occupied._id
              : undefined,
          expectedState: state(src, date, startTime),
        });
      }
    }
    return {
      cells,
      orgTz,
      studentBalance: balance,
      lessonCost: activity?.pointCost ?? 1,
    };
  },
});
async function writeOverride(
  ctx: MutationCtx,
  orgId: string,
  teacherId: string,
  date: string,
  startTime: string,
  value: boolean | null,
  token?: string,
) {
  const table = tenantTable(ctx, orgId, "slotExceptions");
  const start = minute(startTime),
    end = start + 30;
  const rows = await ctx.db
    .query("slotExceptions")
    .withIndex("by_organization_and_teacherId_and_date", (q) =>
      q.eq("organizationId", orgId).eq("teacherId", teacherId).eq("date", date),
    )
    .collect();
  for (const row of rows) {
    if (
      row.timeOffGroupId ||
      minute(row.startTime) >= end ||
      minute(row.endTime) <= start
    )
      continue;
    const { _id, _creationTime, organizationId, ...data } = row;
    void _id;
    void _creationTime;
    void organizationId;
    await table.delete(row._id);
    if (minute(row.startTime) < start)
      await table.insert({ ...data, endTime: startTime });
    if (minute(row.endTime) > end)
      await table.insert({ ...data, startTime: time(end) });
  }
  if (value !== null)
    await table.insert({
      teacherId,
      date,
      startTime,
      endTime: time(end),
      kind: value ? "open" : "closed",
      editToken: token,
      createdAt: token ?? new Date().toISOString(),
    });
}
async function protect(
  ctx: MutationCtx,
  orgId: string,
  teacherId: string,
  date: string,
  startTime: string,
  orgTz: string,
  cached?: {
    src: Awaited<ReturnType<typeof loadSlotSources>>;
    events: Doc<"scheduleEvents">[];
  },
) {
  validCell(date, startTime);
  if (wallTimeToMs(date, startTime, orgTz) <= Date.now())
    throw new ConvexError("Past slots cannot be edited");
  const src = cached?.src ?? (await loadSlotSources(ctx, orgId, teacherId));
  if (src.exceptions.some((row) => row.date === date && row.timeOffGroupId))
    throw new ConvexError("Remove time off before editing these slots");
  const events =
    cached?.events ??
    (await loadTeacherEvents(ctx, orgId, teacherId, date, date));
  if (overlapConflict(events, date, minute(startTime), minute(startTime) + 30))
    throw new ConvexError(
      "A booked lesson is protected. Move or cancel it first",
    );
  return src;
}
export const editCells = mutation({
  args: {
    teacherId: v.optional(v.string()),
    requestId: v.string(),
    changes: v.array(
      v.object({
        date: v.string(),
        startTime: v.string(),
        open: v.union(v.boolean(), v.null()),
        expectedState: v.string(),
      }),
    ),
  },
  handler: async (ctx, { teacherId: requested, requestId, changes }) => {
    const { orgId, user } = await requireTenant(ctx);
    requireEditor(user);
    const teacherId = await teacherTarget(ctx, orgId, user, requested);
    if (!teacherId) throw new ConvexError("Teacher not found");
    if (
      requestId.length < 8 ||
      requestId.length > 200 ||
      !changes.length ||
      changes.length > 336 ||
      new Set(changes.map((c) => `${c.date}|${c.startTime}`)).size !==
        changes.length
    )
      throw new ConvexError("Invalid availability gesture");
    const payloadKey = JSON.stringify({ teacherId, changes });
    const receipt = await ctx.db
      .query("calendarAvailabilityChanges")
      .withIndex("by_organization_actor_request", (q) =>
        q
          .eq("organizationId", orgId)
          .eq("actorId", user.externalId)
          .eq("requestId", requestId),
      )
      .unique();
    if (receipt) {
      if (receipt.payloadKey !== payloadKey)
        throw new ConvexError("Retry does not match the saved gesture");
      return receipt._id;
    }
    const orgTz = await orgTimezone(ctx, orgId);
    const cells = [];
    const dates = changes.map((cell) => cell.date).sort();
    const cached = {
      src: await loadSlotSources(ctx, orgId, teacherId),
      events: await loadTeacherEvents(
        ctx,
        orgId,
        teacherId,
        dates[0],
        dates.at(-1)!,
      ),
    };
    for (const cell of changes) {
      const src = await protect(
        ctx,
        orgId,
        teacherId,
        cell.date,
        cell.startTime,
        orgTz,
        cached,
      );
      if (state(src, cell.date, cell.startTime) !== cell.expectedState)
        throw new ConvexError(
          "These slots changed elsewhere. Try again with the refreshed calendar",
        );
      const prior = cellOverride(src.exceptions, cell.date, cell.startTime);
      cells.push({
        date: cell.date,
        startTime: cell.startTime,
        before: prior.value,
        beforeToken: prior.token,
        afterState: state(src, cell.date, cell.startTime, {
          value: cell.open,
          token: cell.open === null ? undefined : requestId,
        }),
      });
    }
    for (const cell of changes)
      await writeOverride(
        ctx,
        orgId,
        teacherId,
        cell.date,
        cell.startTime,
        cell.open,
        requestId,
      );
    return await tenantTable(ctx, orgId, "calendarAvailabilityChanges").insert({
      teacherId,
      actorId: user.externalId,
      requestId,
      payloadKey,
      cells,
      createdAt: new Date().toISOString(),
    });
  },
});
export const undo = mutation({
  args: { changeId: v.id("calendarAvailabilityChanges") },
  handler: async (ctx, { changeId }) => {
    const { orgId, user } = await requireTenant(ctx);
    requireEditor(user);
    const table = tenantTable(ctx, orgId, "calendarAvailabilityChanges");
    const receipt = await table.get(changeId);
    if (!receipt || receipt.actorId !== user.externalId)
      throw new ConvexError("Saved gesture not found");
    if (receipt.undoneAt) return;
    await teacherTarget(ctx, orgId, user, receipt.teacherId);
    const orgTz = await orgTimezone(ctx, orgId);
    const dates = receipt.cells.map((cell) => cell.date).sort();
    const cached = {
      src: await loadSlotSources(ctx, orgId, receipt.teacherId),
      events: await loadTeacherEvents(
        ctx,
        orgId,
        receipt.teacherId,
        dates[0],
        dates.at(-1)!,
      ),
    };
    for (const cell of receipt.cells) {
      const src = await protect(
        ctx,
        orgId,
        receipt.teacherId,
        cell.date,
        cell.startTime,
        orgTz,
        cached,
      );
      if (state(src, cell.date, cell.startTime) !== cell.afterState)
        throw new ConvexError(
          "Undo is no longer available because these slots changed",
        );
    }
    for (const cell of receipt.cells)
      await writeOverride(
        ctx,
        orgId,
        receipt.teacherId,
        cell.date,
        cell.startTime,
        cell.before,
        cell.beforeToken,
      );
    await table.patch(changeId, { undoneAt: new Date().toISOString() });
  },
});
