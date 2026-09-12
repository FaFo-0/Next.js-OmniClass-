import assert from "node:assert/strict";
import test from "node:test";
import { provisionStudentLoop } from "../convex/e2eFixtures.ts";

type Row = Record<string, unknown> & { _id: string; _creationTime: number };
type Tables = Record<string, Row[]>;
type FunctionHandler = {
  _handler: (ctx: unknown, args: ProvisionArgs) => Promise<ProvisionResult>;
};

type ProvisionArgs = {
  organizationId: string;
  fixtureKey: string;
  persona: "Russian" | "Kazakh" | "Arabic";
  booking: { date: string; startTime: string; endTime: string };
  actors: {
    student: { externalId: string; email: string; name: string };
    teacher: { externalId: string; email: string; name: string };
    admin: { externalId: string; email: string; name: string };
  };
  teacherMeetLink: string;
};

type ProvisionResult = {
  ids: {
    student: string;
    teacher: string;
    admin: string;
    trialGrant: string;
    libraryWork: string;
    libraryUnit: string;
    teacherVacancy: string;
  };
};

const ORG = "org-e2e";
const OTHER_ORG = "org-other";
const LAUNCH_ORG = "org_3DIbJAWeR5CjVaBRlB4AZXL1UpD";
const originalEnabled = process.env.E2E_FIXTURES_ENABLED;
const originalOrg = process.env.E2E_ORGANIZATION_ID;
const originalDedicatedOrg = process.env.E2E_DEDICATED_ORGANIZATION_ID;
const originalDedicatedAuth = process.env.E2E_DEDICATED_ORGANIZATION_AUTH;

test.after(() => {
  if (originalEnabled === undefined) delete process.env.E2E_FIXTURES_ENABLED;
  else process.env.E2E_FIXTURES_ENABLED = originalEnabled;
  if (originalOrg === undefined) delete process.env.E2E_ORGANIZATION_ID;
  else process.env.E2E_ORGANIZATION_ID = originalOrg;
  if (originalDedicatedOrg === undefined) delete process.env.E2E_DEDICATED_ORGANIZATION_ID;
  else process.env.E2E_DEDICATED_ORGANIZATION_ID = originalDedicatedOrg;
  if (originalDedicatedAuth === undefined) delete process.env.E2E_DEDICATED_ORGANIZATION_AUTH;
  else process.env.E2E_DEDICATED_ORGANIZATION_AUTH = originalDedicatedAuth;
});

function args(organizationId = ORG): ProvisionArgs {
  return {
    organizationId,
    fixtureKey: "student-loop-001",
    persona: "Russian",
    booking: {
      date: "2026-09-21",
      startTime: "18:00",
      endTime: "19:00",
    },
    actors: {
      student: {
        externalId: "clerk-student",
        email: "student-e2e@example.test",
        name: "E2E Student",
      },
      teacher: {
        externalId: "clerk-teacher",
        email: "teacher-e2e@example.test",
        name: "E2E Teacher",
      },
      admin: {
        externalId: "clerk-admin",
        email: "admin-e2e@example.test",
        name: "E2E Admin",
      },
    },
    teacherMeetLink: "https://meet.google.com/lookup/omniclass-e2e",
  };
}

function createContext(initial: Record<string, Array<Record<string, unknown>>> = {}) {
  let sequence = 0;
  const tables: Tables = {};
  for (const [table, rows] of Object.entries(initial)) {
    tables[table] = rows.map((row) => ({
      _id: String(row._id ?? `${table}:seed:${++sequence}`),
      _creationTime: Number(row._creationTime ?? ++sequence),
      ...row,
    }));
  }

  const matching = (
    table: string,
    filters: Array<[string, unknown]>,
    descending: boolean,
  ) => {
    const rows = (tables[table] ?? []).filter((row) =>
      filters.every(([field, value]) => row[field] === value),
    );
    return descending ? [...rows].reverse() : [...rows];
  };

  const db = {
    query(table: string) {
      const filters: Array<[string, unknown]> = [];
      let descending = false;
      const builder = {
        withIndex(
          _name: string,
          configure: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
        ) {
          const index = {
            eq(field: string, value: unknown) {
              filters.push([field, value]);
              return index;
            },
          };
          configure(index);
          return builder;
        },
        order(direction: "asc" | "desc") {
          descending = direction === "desc";
          return builder;
        },
        async collect() {
          return matching(table, filters, descending);
        },
        async take(limit: number) {
          return matching(table, filters, descending).slice(0, limit);
        },
        async first() {
          return matching(table, filters, descending)[0] ?? null;
        },
        async unique() {
          const rows = matching(table, filters, descending);
          if (rows.length > 1) throw new Error("Expected unique row");
          return rows[0] ?? null;
        },
      };
      return builder;
    },
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const row = rows.find((candidate) => candidate._id === id);
        if (row) return row;
      }
      return null;
    },
    async insert(table: string, value: Record<string, unknown>) {
      const id = `${table}:generated:${++sequence}`;
      const row: Row = {
        _id: id,
        _creationTime: ++sequence,
        ...value,
      };
      (tables[table] ??= []).push(row);
      return id;
    },
    async patch(id: string, value: Record<string, unknown>) {
      const row = await db.get(id);
      if (!row) throw new Error(`Missing row ${id}`);
      Object.assign(row, value);
    },
    async delete(id: string) {
      for (const [table, rows] of Object.entries(tables)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index >= 0) {
          tables[table].splice(index, 1);
          return;
        }
      }
      throw new Error(`Missing row ${id}`);
    },
  };

  return { ctx: { db }, tables };
}

async function invoke(
  ctx: ReturnType<typeof createContext>["ctx"],
  value = args(),
): Promise<ProvisionResult> {
  return await (provisionStudentLoop as unknown as FunctionHandler)._handler(ctx, value);
}

function enableFor(org = ORG) {
  process.env.E2E_FIXTURES_ENABLED = "true";
  process.env.E2E_ORGANIZATION_ID = org;
  process.env.E2E_DEDICATED_ORGANIZATION_ID = org;
  process.env.E2E_DEDICATED_ORGANIZATION_AUTH = "verified";
}

test("fixture guard throws when disabled", async () => {
  delete process.env.E2E_FIXTURES_ENABLED;
  process.env.E2E_ORGANIZATION_ID = ORG;
  const { ctx } = createContext();
  await assert.rejects(() => invoke(ctx), /E2E fixtures are disabled/);
});

test("fixture guard throws for the wrong organization", async () => {
  enableFor(ORG);
  const { ctx } = createContext();
  await assert.rejects(() => invoke(ctx, args(OTHER_ORG)), /organization mismatch/);
});

test("fixture guard requires explicit dedicated-E2E authorization", async () => {
  process.env.E2E_FIXTURES_ENABLED = "true";
  process.env.E2E_ORGANIZATION_ID = ORG;
  delete process.env.E2E_DEDICATED_ORGANIZATION_ID;
  delete process.env.E2E_DEDICATED_ORGANIZATION_AUTH;
  const { ctx } = createContext({
    tenantSettings: [{ organizationId: ORG, timezone: "Asia/Almaty" }],
  });
  await assert.rejects(() => invoke(ctx), /dedicated E2E.*authorization/i);
});

test("fixture guard rejects an arbitrary environment-selected organization without a verified marker", async () => {
  enableFor(OTHER_ORG);
  const { ctx } = createContext({
    tenantSettings: [{ organizationId: OTHER_ORG, timezone: "UTC" }],
  });
  await assert.rejects(() => invoke(ctx, args(OTHER_ORG)), /dedicated E2E.*authorization/i);
});

test("fixture guard rejects the launch organization even with explicit E2E authorization", async () => {
  enableFor(LAUNCH_ORG);
  const { ctx } = createContext({
    tenantSettings: [{ organizationId: LAUNCH_ORG, timezone: "Asia/Almaty" }],
  });
  await assert.rejects(() => invoke(ctx, args(LAUNCH_ORG)), /launch organization/i);
});

test("same fixture key is idempotent and preserves every returned id", async () => {
  enableFor();
  const { ctx, tables } = createContext({
    tenantSettings: [
      {
        organizationId: ORG,
        name: "E2E Academy",
        timezone: "Asia/Almaty",
        e2eFixtureAuthorization: {
          dedicated: true,
          verifiedAt: "2026-09-11T00:00:00.000Z",
        },
        trialPolicy: {
          enabled: false,
          points: 0,
          durationDays: 7,
        },
      },
    ],
  });

  const first = await invoke(ctx);
  const second = await invoke(ctx);

  assert.deepEqual(second.ids, first.ids);
  assert.equal(tables.users.filter((row) => row.organizationId === ORG).length, 3);
  assert.equal(tables.billingFamilies.filter((row) => row.organizationId === ORG).length, 2);
  assert.equal(tables.billingPlans.filter((row) => row.organizationId === ORG).length, 6);
  assert.equal(tables.pointGrants.filter((row) => row.organizationId === ORG && row.source === "trial").length, 1);
  assert.equal(tables.financeEntries?.filter((row) => row.organizationId === ORG).length ?? 0, 0);
  assert.equal(
    tables.libraryWorks.filter((row) => row.organizationId === ORG).length,
    1,
  );
});

test("reset deletes only the requested organization and seeds only canonical catalogue rows", async () => {
  enableFor();
  const { ctx, tables } = createContext({
    tenantSettings: [
      {
        organizationId: ORG,
        name: "E2E Academy",
        timezone: "Asia/Almaty",
        e2eFixtureAuthorization: { dedicated: true, verifiedAt: "2026-09-11T00:00:00.000Z" },
      },
      { organizationId: OTHER_ORG, name: "Other Academy", timezone: "UTC" },
    ],
    users: [
      { _id: "stale-user-e2e", organizationId: ORG, externalId: "stale-e2e-user", email: "stale@example.test", name: "Stale", role: "student" },
      { _id: "other-user", organizationId: OTHER_ORG, externalId: "other-student", email: "other@example.test", name: "Other", role: "student" },
    ],
    scheduleEvents: [
      { _id: "stale-event-e2e", organizationId: ORG, title: "Delete me" },
      { _id: "other-event", organizationId: OTHER_ORG, title: "Keep me" },
    ],
    homework: [
      { _id: "stale-homework-e2e", organizationId: ORG, title: "Delete me" },
      { _id: "other-homework", organizationId: OTHER_ORG, title: "Keep me" },
    ],
  });

  await invoke(ctx);

  assert.equal(tables.users.some((row) => row._id === "stale-user-e2e"), false);
  assert.equal(tables.scheduleEvents.some((row) => row._id === "stale-event-e2e"), false);
  assert.equal(tables.homework.some((row) => row._id === "stale-homework-e2e"), false);
  assert.equal(tables.billingFamilies.filter((row) => row.organizationId === ORG).length, 2);
  assert.equal(tables.billingPlans.filter((row) => row.organizationId === ORG).length, 6);

  assert.equal(tables.users.some((row) => row._id === "other-user"), true);
  assert.equal(tables.scheduleEvents.some((row) => row._id === "other-event"), true);
  assert.equal(tables.homework.some((row) => row._id === "other-homework"), true);
  assert.equal(tables.billingFamilies?.filter((row) => row.organizationId === OTHER_ORG).length ?? 0, 0);
});
