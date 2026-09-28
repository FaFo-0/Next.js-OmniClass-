import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildAttributionValue,
  parseAttribution,
  sanitizeAttributionValue,
  withAttribution,
} from "../src/lib/attribution.ts";
import { buildPublicCatalogue } from "../convex/lib/publicCatalogue.ts";
import {
  cleanReferralSource,
  trialGrantExpiry,
} from "../convex/lib/onboardingPolicy.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

const family = {
  _id: "family-1",
  organizationId: "academy",
  labels: { default: "Standard", ru: "Разговорный английский" },
  visibility: "visible" as const,
  isArchived: false,
  sortOrder: 1,
};
const plan = {
  _id: "plan-1",
  organizationId: "academy",
  familyId: "family-1",
  labels: { default: "8 lessons", ru: "8 уроков" },
  visibility: "visible" as const,
  isArchived: false,
  sortOrder: 1,
};
const published = {
  _id: "version-public",
  organizationId: "academy",
  familyId: "family-1",
  planId: "plan-1",
  version: 2,
  status: "published" as const,
  visibility: "visible" as const,
  currency: "KZT",
  listPrice: 26_000,
  lessonCount: 8,
  expiryDays: 60,
  sortOrder: 1,
};

test("public catalogue returns only published buyer-visible commercial fields", () => {
  const result = buildPublicCatalogue({
    organizationId: "academy",
    locale: "ru",
    families: [family],
    plans: [plan],
    versions: [
      published,
      { ...published, _id: "draft-private", version: 3, status: "draft" as const, listPrice: 99_999 },
      { ...published, _id: "other-tenant", organizationId: "other", version: 4, listPrice: 1 },
    ],
    benefits: [
      { _id: "benefit-1", organizationId: "academy", planVersionId: "version-public", sortOrder: 1, labels: { default: "Feedback", ru: "Обратная связь" } },
      { _id: "benefit-private", organizationId: "academy", planVersionId: "draft-private", sortOrder: 1, labels: { default: "Private" } },
    ],
  });

  assert.deepEqual(result, [{
    family: "Разговорный английский",
    packName: "8 уроков",
    priceKzt: 26_000,
    lessonCount: 8,
    expiryDays: 60,
    benefits: ["Обратная связь"],
  }]);
  assert.deepEqual(Object.keys(result[0]).sort(), ["benefits", "expiryDays", "family", "lessonCount", "packName", "priceKzt"]);
});

test("public catalogue query is fixed to the academy and does not authenticate or expose documents", () => {
  const billing = fs.readFileSync(path.join(ROOT, "convex/billing.ts"), "utf8");
  const block = billing.match(/export const getPublicCatalogue = query\([\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.match(block, /ACADEMY_ID/);
  assert.match(block, /buildPublicCatalogue/);
  assert.doesNotMatch(block, /requireTenant|requireTenantPermission|organizationId:\s*v\.string/);
});

test("public catalogue fails closed for mismatched or invalid commercial rows", () => {
  const result = buildPublicCatalogue({
    organizationId: "academy",
    locale: "ru",
    families: [family, { ...family, _id: "family-2", sortOrder: 2 }],
    plans: [plan],
    versions: [
      { ...published, _id: "wrong-family", familyId: "family-2", version: 9 },
      { ...published, _id: "negative-price", listPrice: -1, version: 8 },
      { ...published, _id: "zero-lessons", lessonCount: 0, version: 7 },
      { ...published, _id: "zero-expiry", expiryDays: 0, version: 6 },
      published,
    ],
    benefits: [],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.priceKzt, 26_000);
});

test("attribution allowlists, sanitizes, bounds, and preserves the four launch parameters", () => {
  const parsed = parseAttribution("?utm_source=%20test-ad%20&utm_medium=social%00&utm_campaign=" + "x".repeat(300) + "&ref=friend&evil=ignored");
  assert.deepEqual(parsed, {
    utm_source: "test-ad",
    utm_medium: "social",
    utm_campaign: "x".repeat(150),
    ref: "friend",
  });
  assert.equal(sanitizeAttributionValue("  hello\nworld  ", 100), "helloworld");
  assert.equal(buildAttributionValue(parsed), `utm_source=test-ad&utm_medium=social&utm_campaign=${"x".repeat(150)}&ref=friend`);
  assert.equal(withAttribution("/sign-up", parsed), `/sign-up?utm_source=test-ad&utm_medium=social&utm_campaign=${"x".repeat(150)}&ref=friend`);
});

test("mounted onboarding gives captured attribution precedence at every save boundary", () => {
  const onboarding = fs.readFileSync(path.join(ROOT, "src/app/onboarding/student/page.tsx"), "utf8");
  assert.match(onboarding, /readStoredAttribution/);
  assert.match(onboarding, /referralSource: attributionValue \|\| referral \|\| undefined/g);
  assert.match(onboarding, /clearStoredAttribution\(\)/);
});

test("sign-in sends existing users through the role-aware portal route", () => {
  const signIn = fs.readFileSync(
    path.join(ROOT, "src/app/(auth)/sign-in/[[...sign-in]]/page.tsx"),
    "utf8",
  );
  assert.match(signIn, /forceRedirectUrl="\/portal"/);
});

test("a partial onboarding row does not suppress the first completion trial", () => {
  const onboarding = fs.readFileSync(path.join(ROOT, "convex/onboarding.ts"), "utf8");
  assert.match(onboarding, /const firstTime = !existing\?\.completedAt/);
  assert.doesNotMatch(onboarding, /const firstTime = !existing;/);
});

test("onboarding referral cleanup never persists an empty or unbounded value", () => {
  assert.equal(cleanReferralSource(" \u0000 \n "), undefined);
  assert.equal(cleanReferralSource("x".repeat(3_000)), "x".repeat(2_048));
});

test("a zero-day trial uses the non-expiring grant path", () => {
  assert.equal(trialGrantExpiry(0, Date.UTC(2026, 8, 28)), undefined);
  assert.equal(trialGrantExpiry(7, Date.UTC(2026, 8, 28)), "2026-10-05");
});
