import assert from "node:assert/strict";
import test from "node:test";
import { myPayroll } from "../convex/payroll";
import { ACADEMY_ID } from "../convex/lib/tenant";

type Row = Record<string, unknown>;
const invoke = myPayroll as unknown as { _handler: (ctx: unknown, args: Row) => Promise<{ currency: string; rate: number; amountUnpaid: number; amountEarned: number; lastPayment: {amount: number; currency: string} }> };
function fixture(payoutCurrency?: string, payoutPerLesson?: number) {
  const month = new Date().toISOString().slice(0, 7);
  const teacher = { organizationId: ACADEMY_ID, externalId: "teacher", tokenIdentifier: "teacher-token", role: "teacher", payoutCurrency, payoutPerLesson };
  const settings = { organizationId: ACADEMY_ID, baseCurrency: "KZT", defaultPayoutPerLesson: 12, defaultPayoutCurrency: "USD", fxRatesKzt: {KZT: 1, USD: 600} };
  const tables: Record<string, Row[]> = {
    users: [teacher], tenantSettings: [settings],
    scheduleEvents: ["paid", "unpaid"].map(id => ({ _id:id, organizationId:ACADEMY_ID, teacherId:"teacher", date:`${month}-01`, status:"completed", type:"1on1" })),
    payrollRuns: [{ organizationId:ACADEMY_ID, teacherId:"teacher", month, lessonEventIds:["paid"], lessonCount:1, amount:10, currency:"USD", amountBase:4500, baseCurrency:"KZT", fxRatesKzt:{KZT:1,USD:450}, paidAt:`${month}-02T00:00:00Z` }],
  };
  const ctx = { auth: {getUserIdentity: async () => ({tokenIdentifier:"teacher-token"})}, db: {query(table: string) {
    const constraints: Array<[string,unknown]> = [];
    const q = { withIndex(_name:string, callback:(builder: unknown)=>unknown) { const b={eq(k:string,v:unknown){constraints.push([k,v]);return b;}}; callback(b);return q; },
      collect: async () => tables[table].filter(row=>constraints.every(([k,v])=>row[k]===v)), unique: async () => (await q.collect())[0] ?? null };
    return q;
  }}};
  return {ctx, settings};
}
test("USD teacher sees original dollars earned and owed despite changed KZT exchange rate", async () => {
  const {ctx} = fixture("USD",10);
  const pay = await invoke._handler(ctx,{});
  assert.equal(pay.currency,"USD"); assert.equal(pay.rate,10); assert.equal(pay.amountUnpaid,10); assert.equal(pay.amountEarned,20);
  assert.deepEqual(pay.lastPayment && {amount:pay.lastPayment.amount,currency:pay.lastPayment.currency},{amount:10,currency:"USD"});
});
test("default USD agreements are used; historical payment keeps its actual currency after agreement changes", async () => {
  const defaultPay = await invoke._handler(fixture().ctx,{});
  assert.equal(defaultPay.currency,"USD"); assert.equal(defaultPay.rate,12); assert.equal(defaultPay.amountEarned,22);
  const kzt = await invoke._handler(fixture("KZT",2500).ctx,{});
  assert.equal(kzt.currency,"KZT"); assert.equal(kzt.amountEarned,7000); assert.equal(kzt.lastPayment.currency,"USD"); assert.equal(kzt.lastPayment.amount,10);
});
