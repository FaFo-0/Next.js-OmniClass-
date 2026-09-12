import assert from "node:assert/strict";
import test from "node:test";
import {
  getBalance,
  getGrants,
  getTransactions,
  grantLessonAdjustment,
  NO_EXPIRY,
} from "../convex/points.ts";

type Row = Record<string, unknown>;
type QueryHandler = {
  _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
};

const ORG_ID = "org-a";

function createContext(caller: Row, tables: Record<string, Row[]>) {
  return {
    auth: {
      getUserIdentity: async () => ({
        tokenIdentifier: caller.tokenIdentifier,
        org_id: caller.organizationId,
      }),
    },
    db: {
      query: (table: string) => {
        const filters: Array<[string, unknown]> = [];
        let descending = false;
        const queryBuilder = {
          withIndex: (
            _indexName: string,
            configure: (q: {
              eq: (field: string, value: unknown) => unknown;
            }) => unknown
          ) => {
            const indexBuilder = {
              eq(field: string, value: unknown) {
                filters.push([field, value]);
                return indexBuilder;
              },
            };
            configure(indexBuilder);
            return queryBuilder;
          },
          order: (direction: "asc" | "desc") => {
            descending = direction === "desc";
            return queryBuilder;
          },
          collect: async () => matchingRows(),
          unique: async () => {
            const rows = matchingRows();
            if (rows.length > 1) throw new Error("Expected a unique row");
            return rows[0] ?? null;
          },
          take: async (limit: number) => matchingRows().slice(0, limit),
        };

        function matchingRows() {
          const rows = (tables[table] ?? []).filter((row) =>
            filters.every(([field, value]) => row[field] === value)
          );
          return descending ? [...rows].reverse() : rows;
        }

        return queryBuilder;
      },
    },
  };
}

function fixture(callerId: string) {
  const users = [
    {
      _id: "user-row-a",
      organizationId: ORG_ID,
      externalId: "student-a",
      tokenIdentifier: "token-a",
      role: "student",
      name: "Student A",
    },
    {
      _id: "user-row-b",
      organizationId: ORG_ID,
      externalId: "student-b",
      tokenIdentifier: "token-b",
      role: "student",
      name: "Student B",
      teacherId: "teacher-assigned",
    },
    {
      _id: "teacher-row-assigned",
      organizationId: ORG_ID,
      externalId: "teacher-assigned",
      tokenIdentifier: "token-teacher-assigned",
      role: "teacher",
      name: "Assigned Teacher",
    },
    {
      _id: "teacher-row-unassigned",
      organizationId: ORG_ID,
      externalId: "teacher-unassigned",
      tokenIdentifier: "token-teacher-unassigned",
      role: "teacher",
      name: "Unassigned Teacher",
    },
    {
      _id: "billing-row",
      organizationId: ORG_ID,
      externalId: "billing-staff",
      tokenIdentifier: "token-billing-staff",
      role: "admin",
      permissions: ["billing.view", "billing.edit"],
      name: "Billing Staff",
    },
  ];
  const caller = users.find((user) => user.externalId === callerId);
  if (!caller) throw new Error(`Missing fixture caller ${callerId}`);

  return createContext(caller, {
    users,
    pointGrants: [
      {
        _id: "grant-b",
        organizationId: ORG_ID,
        studentId: "student-b",
        remainingPoints: 6,
        expiresAt: NO_EXPIRY,
        isExpired: false,
        notes: "private billing note",
      },
    ],
    pointTransactions: [
      {
        _id: "transaction-b",
        organizationId: ORG_ID,
        studentId: "student-b",
        type: "grant",
        amount: 6,
        balanceAfter: 6,
        performedBy: "admin-a",
        reason: "private billing reason",
        createdAt: "2026-09-07T00:00:00.000Z",
      },
    ],
  });
}

async function invoke(
  query: unknown,
  ctx: ReturnType<typeof createContext>,
  args: Record<string, unknown>
) {
  return await (query as QueryHandler)._handler(ctx, args);
}

test("getBalance rejects a student targeting another same-tenant student", async () => {
  await assert.rejects(
    () => invoke(getBalance, fixture("student-a"), { studentId: "student-b" }),
    /Access denied/
  );
});

test("getGrants rejects a student targeting another same-tenant student", async () => {
  await assert.rejects(
    () => invoke(getGrants, fixture("student-a"), { studentId: "student-b" }),
    /Access denied/
  );
});

test("getTransactions rejects a student targeting another same-tenant student", async () => {
  await assert.rejects(
    () =>
      invoke(getTransactions, fixture("student-a"), {
        studentId: "student-b",
      }),
    /Access denied/
  );
});

test("an assigned teacher sees only the student's aggregate balance", async () => {
  const balance = await invoke(getBalance, fixture("teacher-assigned"), {
    studentId: "student-b",
  });
  assert.deepEqual(balance, { balance: 6, nextExpiresAt: NO_EXPIRY });

  await assert.rejects(
    () =>
      invoke(getBalance, fixture("teacher-unassigned"), {
        studentId: "student-b",
      }),
    /Access denied/
  );
  await assert.rejects(
    () =>
      invoke(getGrants, fixture("teacher-assigned"), {
        studentId: "student-b",
      }),
    /Access denied/
  );
  await assert.rejects(
    () =>
      invoke(getTransactions, fixture("teacher-assigned"), {
        studentId: "student-b",
      }),
    /Access denied/
  );
});

test("billing.view staff can inspect a student's full lesson ledger", async () => {
  const ctx = fixture("billing-staff");

  assert.deepEqual(
    await invoke(getBalance, ctx, { studentId: "student-b" }),
    { balance: 6, nextExpiresAt: NO_EXPIRY }
  );

  const grants = (await invoke(getGrants, ctx, {
    studentId: "student-b",
  })) as Row[];
  assert.equal(grants[0]?.notes, "private billing note");

  const transactions = (await invoke(getTransactions, ctx, {
    studentId: "student-b",
  })) as Row[];
  assert.equal(transactions[0]?.reason, "private billing reason");
});

test("lesson adjustments reject purchase grants while manual adjustments remain available", async () => {
  const ctx = fixture("billing-staff") as ReturnType<typeof createContext> & {
    db: ReturnType<typeof createContext>["db"] & {
      insert: (table: string, value: Row) => Promise<string>;
    };
  };
  const rows: Record<string, Row[]> = { pointGrants: [], pointTransactions: [] };
  ctx.db.insert = async (table, value) => {
    const id = `${table}-${rows[table]?.length ?? 0}`;
    (rows[table] ??= []).push({ _id: id, ...value });
    return id;
  };
  await assert.rejects(
    () =>
      invoke(grantLessonAdjustment, ctx, {
        studentId: "student-b",
        points: 4,
        source: "purchase",
      }),
    /purchase grants must use billing orders|billing order/i,
  );
  await assert.doesNotReject(() =>
    invoke(grantLessonAdjustment, ctx, {
      studentId: "student-b",
      points: 2,
      source: "manual",
      notes: "Approved correction",
    }),
  );
});
