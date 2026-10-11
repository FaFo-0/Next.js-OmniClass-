import assert from "node:assert/strict";
import test from "node:test";
import { tzOffsetMin } from "../src/lib/tz.ts";

test("timezone offsets retain the correct minute throughout a clock minute", () => {
  for (const seconds of [0, 29, 30, 59]) {
    const instant = new Date(`2026-10-11T06:49:${String(seconds).padStart(2, "0")}.999Z`);
    for (const [zone, offset] of [
      ["Asia/Almaty", 300],
      ["Asia/Kathmandu", 345],
      ["America/St_Johns", -150],
      ["UTC", 0],
    ] as const) {
      assert.equal(tzOffsetMin(zone, instant), offset, `${zone}, second ${seconds}`);
    }
  }
});
