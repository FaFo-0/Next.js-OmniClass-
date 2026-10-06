import assert from "node:assert/strict";
import test from "node:test";
import schema from "../convex/schema.ts";
import { completeStudentOnboarding, saveStudentOnboardingStep } from "../convex/onboarding.ts";
import { ACADEMY_ID } from "../convex/lib/tenant.ts";

type Row = Record<string, unknown>;
type Handler = { _handler: (ctx: unknown, args: Row) => Promise<unknown> };

test("student timezone survives step save and schema-checked completion, with one signup notification", async () => {
  const user: Row = { _id: "student", organizationId: ACADEMY_ID, externalId: "student", role: "student", name: "QA Student" };
  let onboarding: Row | null = null;
  let notifications = 0;
  const allowed = schema.tables.studentOnboarding.validator.fields;
  const validate = (row: Row) => {
    for (const key of Object.keys(row)) {
      if (key !== "_id") assert.ok(key in allowed, `Unknown onboarding field: ${key}`);
    }
  };
  const ctx = {
    auth: { getUserIdentity: async () => ({ tokenIdentifier: "qa" }) },
    db: {
      query(table: string) {
        const result = {
          withIndex: () => result,
          unique: async () => table === "users" ? user : table === "studentOnboarding" ? onboarding : { trialPolicy: { enabled: false, points: 0, durationDays: 0 } },
          collect: async () => [{ externalId: "admin" }],
        };
        return result;
      },
      insert: async (table: string, row: Row) => {
        assert.equal(table, "studentOnboarding");
        validate(row);
        onboarding = { ...row, _id: "onboarding" };
        return "onboarding";
      },
      patch: async (id: string, fields: Row) => {
        if (id === "student") Object.assign(user, fields);
        else {
          validate(fields);
          onboarding = { ...onboarding, ...fields };
        }
      },
    },
    runMutation: async () => { notifications += 1; },
  };
  const args = { timezone: "Asia/Almaty", phoneWhatsapp: "+70000000000", l1: "ru" };
  await (saveStudentOnboardingStep as unknown as Handler)._handler(ctx, args);
  assert.equal((onboarding as Row | null)?.timezone, args.timezone);
  assert.equal(user.onboardingComplete, undefined);
  assert.equal(notifications, 0);
  assert.deepEqual(await (completeStudentOnboarding as unknown as Handler)._handler(ctx, { ...args, consent: true }), { firstTime: true, trialLessonsGranted: 0 });
  assert.equal(user.timezone, args.timezone);
  assert.equal(user.onboardingComplete, true);
  assert.deepEqual(await (completeStudentOnboarding as unknown as Handler)._handler(ctx, { ...args, consent: true }), { firstTime: false, trialLessonsGranted: 0 });
  assert.equal(notifications, 1);
});
