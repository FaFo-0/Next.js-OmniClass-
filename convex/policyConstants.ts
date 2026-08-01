// The parts of POLICY.md that are compiled into `lib/policy.ts` rather than
// stored per-tenant. Admin Settings reads them so the page can show what the
// system actually enforces instead of offering a knob that changes nothing.

import { query } from "./_generated/server";
import { requireTenant } from "./lib/tenant";
import { POLICY } from "./lib/policy";

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireTenant(ctx);
    return POLICY;
  },
});
