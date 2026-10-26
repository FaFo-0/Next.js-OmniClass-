import assert from "node:assert/strict";
import { ACADEMY_ID } from "../../convex/lib/tenant";
type Row = Record<string, unknown>;
export function fixture(role = "admin") {
  const rows: Record<string, Row[]> = { users: [{ _id: "actor", tokenIdentifier: "issuer|actor", externalId: "actor", organizationId: ACADEMY_ID, role, timezone: "UTC" }] };
  let serial = 0;
  const jobs: unknown[] = [];
  const reads: Array<{ table: string; bytes: number; count: number }> = [];
  const record = <T extends Row | Row[] | null>(table: string, value: T): T => {
    reads.push({ table, bytes: value ? Buffer.byteLength(JSON.stringify(value)) : 0, count: Array.isArray(value) ? value.length : value ? 1 : 0 });
    return value;
  };
  const db = {
    query(table: string) {
      let descending = false;
      let byPosition = false;
      const predicates: Array<(row: Row) => boolean> = [];
      const index = {
        eq(key: string, value: unknown) { predicates.push(row => row[key] === value); return index; },
        gt(key: string, value: number) { predicates.push(row => Number(row[key]) > value); return index; },
        lte(key: string, value: string) { predicates.push(row => String(row[key]) <= value); return index; },
      };
      const result = () => {
        const found = (rows[table] ?? []).filter(row => predicates.every(p => p(row)));
        if (byPosition) found.sort((a, b) => Number(a.position) - Number(b.position));
        return descending ? found.reverse() : found;
      };
      const chain = {
        withIndex(name: string, callback: (q: typeof index) => unknown) { byPosition = name.endsWith("_position"); callback?.(index); return chain; },
        filter() { return chain; }, order(direction: string) { descending = direction === "desc"; return chain; },
        collect: async () => record(table, result()), take: async (n: number) => record(table, result().slice(0, n)),
        paginate: async ({ cursor, numItems }: { cursor: string | null; numItems: number }) => {
          const start = Number(cursor ?? 0); const all = result();
          return { page: record(table, all.slice(start, start + numItems)), continueCursor: String(start + numItems), isDone: start + numItems >= all.length };
        },
        first: async () => record(table, result()[0] ?? null),
        unique: async () => { const matches = result(); assert.ok(matches.length <= 1); return record(table, matches[0] ?? null); },
      };
      return chain;
    },
    get: async (id: string) => {
      for (const [table, entries] of Object.entries(rows)) {
        const found = entries.find(row => row._id === id);
        if (found) return record(table, found);
      }
      return null;
    },
    insert: async (table: string, row: Row) => { const id = `${table}-${++serial}`; (rows[table] ??= []).push({ ...row, _id: id, _creationTime: serial }); return id; },
    patch: async (id: string, patch: Row) => { const row = await db.get(id); assert.ok(row); Object.assign(row, patch); },
    delete: async (id: string) => { for (const table of Object.keys(rows)) rows[table] = rows[table].filter(row => row._id !== id); },
  };
  const ctx = { auth: { getUserIdentity: async () => ({ tokenIdentifier: "issuer|actor" }) }, db, scheduler: { runAfter: async (...job: unknown[]) => { jobs.push(job); } } };
  const add = (table: string, row: Row) => db.insert(table, { organizationId: ACADEMY_ID, ...row });
  return { ctx, rows, add, jobs, reads };
}

