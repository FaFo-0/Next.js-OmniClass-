import assert from "node:assert/strict";
import test from "node:test";
import { getStudentDetailForTeacher, getTeacherDetailForAdmin, listAdmins, listAllUsers } from "../convex/users.ts";
import { createLinkForStudent, disconnectMine, getMyStatus } from "../convex/telegram.ts";
import { ACADEMY_ID } from "../convex/lib/tenant.ts";

type Row = Record<string, unknown> & { _id: string };
type Status = { connected: boolean; connectedAt: string | null };
type Person = { externalId: string; telegram: Status };
const CONNECTED_AT = "2026-10-30T17:00:00.000Z";

function invoke<T>(fn: unknown, ctx: unknown, args: Record<string, unknown> = {}): Promise<T> {
  return (fn as { _handler(ctx: unknown, args: Record<string, unknown>): Promise<T> })._handler(ctx, args);
}

function fixture() {
  const users: Row[] = [
    { _id: "admin", externalId: "admin", organizationId: ACADEMY_ID, tokenIdentifier: "admin-token", role: "admin", name: "Admin", email: "admin@example.test", telegramChatId: "admin-private-chat", telegramConnectedAt: CONNECTED_AT },
    { _id: "teacher", externalId: "teacher", organizationId: ACADEMY_ID, tokenIdentifier: "teacher-token", role: "teacher", name: "Teacher", email: "teacher@example.test", telegramLinkCode: "pending-private-link", telegramLinkCodeExpiresAt: "2999-01-01T00:00:00.000Z" },
    { _id: "student", externalId: "student", organizationId: ACADEMY_ID, tokenIdentifier: "student-token", role: "student", name: "Student", email: "student@example.test", teacherId: "teacher", telegramChatId: "student-private-chat", telegramConnectedAt: CONNECTED_AT },
    { _id: "foreign", externalId: "foreign", organizationId: "another-academy", role: "student", name: "Foreign", telegramChatId: "foreign-private-chat" },
  ];
  let actor = "admin";
  const ctx = {
    auth: { getUserIdentity: async () => ({ tokenIdentifier: `${actor}-token` }) },
    db: {
      query(table: string) {
        return {
          withIndex(_name: string, configure: (q: { eq(key: string, value: unknown): unknown }) => unknown) {
            const conditions: Record<string, unknown> = {};
            const q = { eq(key: string, value: unknown) { conditions[key] = value; return q; } };
            configure(q);
            const matched = () => (table === "users" ? users : []).filter(row => Object.entries(conditions).every(([key, value]) => row[key] === value));
            return { unique: async () => matched()[0] ?? null, collect: async () => matched() };
          },
        };
      },
      async patch(id: string, patch: Record<string, unknown>) {
        const row = users.find(user => user._id === id);
        assert.ok(row);
        Object.assign(row, patch);
      },
    },
  };
  return { ctx, users, setActor(next: string) { actor = next; } };
}

test("People and role detail queries show real Telegram connections, not pending links", async () => {
  const f = fixture();
  const people = await invoke<Person[]>(listAllUsers, f.ctx);
  assert.equal(people.length, 3);
  assert.deepEqual(people.find(person => person.externalId === "student")?.telegram, { connected: true, connectedAt: CONNECTED_AT });
  assert.deepEqual(people.find(person => person.externalId === "teacher")?.telegram, { connected: false, connectedAt: null });
  const student = await invoke<{ student: Person }>(getStudentDetailForTeacher, f.ctx, { studentId: "student" });
  const teacher = await invoke<{ teacher: Person }>(getTeacherDetailForAdmin, f.ctx, { teacherId: "teacher" });
  const admins = await invoke<{ admins: Person[] }>(listAdmins, f.ctx);
  assert.deepEqual(student.student.telegram, { connected: true, connectedAt: CONNECTED_AT });
  assert.deepEqual(teacher.teacher.telegram, { connected: false, connectedAt: null });
  assert.deepEqual(admins.admins[0].telegram, { connected: true, connectedAt: CONNECTED_AT });
  // These new detail projections expose status, never the bot binding or link secret.
  assert.doesNotMatch(JSON.stringify([student, teacher, admins]), /private-chat|private-link|telegramChatId|telegramLinkCode/);
});

test("disconnecting Telegram immediately removes the connection and its date from staff reads", async () => {
  const f = fixture();
  f.setActor("student");
  await invoke(disconnectMine, f.ctx);
  f.setActor("admin");
  const detail = await invoke<{ student: Person }>(getStudentDetailForTeacher, f.ctx, { studentId: "student" });
  const people = await invoke<Person[]>(listAllUsers, f.ctx);
  assert.deepEqual(detail.student.telegram, { connected: false, connectedAt: null });
  assert.deepEqual(people.find(person => person.externalId === "student")?.telegram, detail.student.telegram);
});

test("staff status matches self-service for old bindings and ignores a date without a chat", async () => {
  const f = fixture();
  f.users[2].telegramConnectedAt = undefined;
  f.users[1].telegramConnectedAt = CONNECTED_AT;
  f.setActor("student");
  assert.equal((await invoke<{ connected: boolean }>(getMyStatus, f.ctx)).connected, true);
  f.setActor("admin");
  const people = await invoke<Person[]>(listAllUsers, f.ctx);
  assert.deepEqual(people.find(person => person.externalId === "student")?.telegram, { connected: true, connectedAt: null });
  assert.deepEqual(people.find(person => person.externalId === "teacher")?.telegram, { connected: false, connectedAt: null });
});

// The bot username normally comes from the Convex deployment env. Setting it
// here keeps the test self-contained; the mutation reads it per call.
process.env.TELEGRAM_BOT_USERNAME = "OmnicaEnglish_Bot";

test("staff can create a single-use Telegram link for a student to send over WhatsApp", async () => {
  const f = fixture();
  const link = await invoke<{ url: string; expiresAt: string }>(createLinkForStudent, f.ctx, { studentId: "student" });
  assert.match(link.url, /^https:\/\/t\.me\/OmnicaEnglish_Bot\?start=/);
  assert.ok(link.url.length > "https://t.me/OmnicaEnglish_Bot?start=".length);
  assert.ok(Date.parse(link.expiresAt) > Date.now());
  const student = f.users.find(user => user._id === "student");
  assert.ok(student);
  assert.equal(typeof student.telegramLinkCode, "string");
  assert.equal(student.telegramLinkCodeExpiresAt, link.expiresAt);
  // The response carries the link, never the chat binding or the code's field name.
  assert.doesNotMatch(JSON.stringify(link), /private-chat|telegramChatId|telegramLinkCode/);
});

test("a teacher can create a link only for their own student; students cannot create one", async () => {
  const f = fixture();
  f.setActor("teacher");
  const link = await invoke<{ url: string }>(createLinkForStudent, f.ctx, { studentId: "student" });
  assert.match(link.url, /\?start=/);
  f.users[2].teacherId = "another-teacher";
  await assert.rejects(() => invoke(createLinkForStudent, f.ctx, { studentId: "student" }), /Not your student/);
  f.setActor("student");
  await assert.rejects(() => invoke(createLinkForStudent, f.ctx, { studentId: "student" }), /Only staff/);
});

test("creating a link cannot reach a student outside the academy", async () => {
  const f = fixture();
  await assert.rejects(() => invoke(createLinkForStudent, f.ctx, { studentId: "foreign" }), /Student not found/);
});

test("Telegram visibility retains existing staff, assigned-student and academy boundaries", async () => {
  const f = fixture();
  f.setActor("student");
  await assert.rejects(() => invoke(listAllUsers, f.ctx), /staff-only/);
  await assert.rejects(() => invoke(listAdmins, f.ctx), /Access denied/);
  await assert.rejects(() => invoke(getTeacherDetailForAdmin, f.ctx, { teacherId: "teacher" }), /Admins only/);
  f.setActor("teacher");
  const assigned = await invoke<{ student: Person }>(getStudentDetailForTeacher, f.ctx, { studentId: "student" });
  assert.equal(assigned.student.telegram.connected, true);
  f.users[2].teacherId = "another-teacher";
  await assert.rejects(() => invoke(getStudentDetailForTeacher, f.ctx, { studentId: "student" }), /Not your student/);
  f.setActor("admin");
  assert.equal(await invoke(getStudentDetailForTeacher, f.ctx, { studentId: "foreign" }), null);
});
