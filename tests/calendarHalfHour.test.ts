import assert from "node:assert/strict";
import test from "node:test";
import { overlapConflict } from "../convex/calendar";
import { POLICY } from "../convex/lib/policy";
import { normalizeSlots } from "../convex/vacancies";
import { bookableStarts } from "../src/components/calendar/calendarShared";

const lesson = {_id:"lesson", date:"2026-10-08", startTime:"16:00", endTime:"17:00", status:"scheduled"};
test("adjacent hour reservations remain bookable; overlaps never do", () => {
  assert.equal(overlapConflict([lesson],lesson.date,17*60,18*60),null);
  assert.equal(overlapConflict([lesson],lesson.date,15*60,16*60),null);
  assert.ok(overlapConflict([lesson],lesson.date,16*60+30,17*60+30));
  assert.equal(overlapConflict([lesson],lesson.date,16*60,17*60,"lesson"),null);
  assert.equal(overlapConflict([{...lesson,status:"cancelled"}],lesson.date,16*60,17*60),null);
});
test("picker offers adjacent half-hour starts even if a stale buffer is passed", () => {
  assert.deepEqual(bookableStarts({date:lesson.date,startTime:"16:00",endTime:"19:00"},[lesson],60,10,30),["17:00","17:30","18:00"]);
  assert.deepEqual(bookableStarts({date:lesson.date,startTime:"16:00",endTime:"16:30"},[],60,0,30),[]);
  assert.equal(POLICY.reservationMinutes,60);
  assert.equal(POLICY.teachingMinutes,55);
});
test("availability accepts only complete half-hour cells", () => {
  assert.throws(() => normalizeSlots([{dayOfWeek:1,startTime:"16:15",endTime:"17:00"}]));
  assert.deepEqual(normalizeSlots([{dayOfWeek:1,startTime:"16:00",endTime:"16:30"},{dayOfWeek:1,startTime:"16:30",endTime:"17:00"}]),[{dayOfWeek:1,startTime:"16:00",endTime:"17:00"}]);
});
test("academy starts remain aligned in quarter-offset and midnight-shifted views", () => {
  assert.deepEqual(bookableStarts({date:lesson.date,startTime:"16:45",endTime:"18:45",gridOffsetMinutes:15},[],60,0,30),["16:45","17:15","17:45"]);
  assert.deepEqual(bookableStarts({date:lesson.date,startTime:"23:30",endTime:"24:00",gridOffsetMinutes:0,fullEndDate:"2026-10-09",fullEndTime:"01:00"},[],60,0,30),["23:30"]);
  assert.deepEqual(bookableStarts({date:lesson.date,startTime:"23:30",endTime:"24:00",gridOffsetMinutes:0,fullEndDate:"2026-10-09",fullEndTime:"01:00"},[{date:"2026-10-09",startTime:"00:00",endTime:"01:00"}],60,0,30),[]);
});

test("teachers save their own hours without an admin permission and cannot edit another teacher", async () => {
  const { replaceForTeacher } = await import("../convex/vacancies");
  const { ACADEMY_ID } = await import("../convex/lib/tenant");
  const user = {_id:"teacher", organizationId:ACADEMY_ID, externalId:"teacher", role:"teacher"};
  const inserted: Record<string,unknown>[] = [];
  const ctx = {
    auth:{getUserIdentity:async () => ({tokenIdentifier:"qa"})},
    db:{
      query(table:string) {
        const query = {withIndex:() => query, unique:async () => table === "users" ? user : {timezone:"Asia/Almaty"}, collect:async () => []};
        return query;
      },
      insert:async (_table:string,row:Record<string,unknown>) => {inserted.push(row);return "vacancy";},
    },
  };
  const handler = (replaceForTeacher as unknown as {_handler:(ctx:unknown,args:unknown) => Promise<unknown>})._handler;
  const args = {teacherId:"teacher",expectedSourceState:"[]",slots:[{dayOfWeek:1,startTime:"16:00",endTime:"17:00"}]};
  await handler(ctx,args);
  assert.equal(inserted.length,1);
  assert.equal(inserted[0].teacherId,"teacher");
  await assert.rejects(() => handler(ctx,{...args,teacherId:"other-teacher"}),/own availability/);
});


test("preview metadata cannot keep a matching booking draft stuck in Checking", async () => {
  const { canonicalizeBookings } = await import("../src/lib/calendarBookingPlan");
  const draft = [{date:"2026-10-08",startTime:"16:30"}];
  assert.deepEqual(canonicalizeBookings(draft.map(item => ({...item,ok:true,alreadyBooked:false}))),draft);
});
