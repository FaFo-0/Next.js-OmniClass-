import assert from "node:assert/strict";
import { ACADEMY_ID } from "../../convex/lib/tenant";
type Row = Record<string, unknown>;
export function fixture(role = "admin") {
  const rows: Record<string, Row[]> = { users: [{ _id: "actor", tokenIdentifier: "issuer|actor", externalId: "actor", organizationId: ACADEMY_ID, role, timezone: "UTC" }] };
  let serial = 0;
  const jobs: unknown[] = [];
  const db = {
    query(table: string) {
      const predicates: Array<(row: Row) => boolean> = [];
      const index = {
        eq(key: string, value: unknown) { predicates.push(row => row[key] === value); return index; },
        lte(key: string, value: string) { predicates.push(row => String(row[key]) <= value); return index; },
      };
      const result = () => (rows[table] ?? []).filter(row => predicates.every(p => p(row)));
      const chain = {
        withIndex(_name: string, callback: (q: typeof index) => unknown) { callback?.(index); return chain; },
        filter() { return chain; }, order() { return chain; },
        collect: async () => result(), take: async (n: number) => result().slice(0, n),
        first: async () => result()[0] ?? null,
        unique: async () => { const matches = result(); assert.ok(matches.length <= 1); return matches[0] ?? null; },
      };
      return chain;
    },
    get: async (id: string) => Object.values(rows).flat().find(row => row._id === id) ?? null,
    insert: async (table: string, row: Row) => { const id = `${table}-${++serial}`; (rows[table] ??= []).push({ ...row, _id: id, _creationTime: serial }); return id; },
    patch: async (id: string, patch: Row) => { const row = await db.get(id); assert.ok(row); Object.assign(row, patch); },
    delete: async (id: string) => { for (const table of Object.keys(rows)) rows[table] = rows[table].filter(row => row._id !== id); },
  };
  const ctx = { auth: { getUserIdentity: async () => ({ tokenIdentifier: "issuer|actor" }) }, db, scheduler: { runAfter: async (...job: unknown[]) => { jobs.push(job); } } };
  const add = (table: string, row: Row) => db.insert(table, { organizationId: ACADEMY_ID, ...row });
  return { ctx, rows, add, jobs };
}

