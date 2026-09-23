import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const producer = readFileSync("convex/achievements.ts", "utf8");
const bell = readFileSync("src/components/shared/NotificationsBell.tsx", "utf8");

test("achievement toggle gates producer writes and notification actionability", () => {
  const guard = "if (settings?.features?.achievements === false) return [];";
  assert.ok(producer.includes(guard));
  assert.ok(
    producer.indexOf(guard) < producer.indexOf('query("achievements")'),
    "disabled achievements must return before definitions or writes are evaluated",
  );
  assert.match(bell, /feature\("achievements"\)/);
  assert.match(bell, /n\.kind !== "achievement_unlocked"/);
});
