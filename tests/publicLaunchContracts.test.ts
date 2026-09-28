import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
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
  key: "basic_tutoring",
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

test("public catalogue exposes only Standard Tutoring and removes placeholder benefits", () => {
  const ieltsFamily = { ...family, _id: "family-ielts", key: "ielts", labels: { default: "IELTS" }, sortOrder: 2 };
  const ieltsPlan = { ...plan, _id: "plan-ielts", familyId: "family-ielts", labels: { default: "IELTS 8" } };
  const result = buildPublicCatalogue({
    organizationId: "academy",
    locale: "en",
    families: [family, ieltsFamily],
    plans: [plan, ieltsPlan],
    versions: [
      published,
      { ...published, _id: "ielts-public", familyId: "family-ielts", planId: "plan-ielts", version: 1 },
      { ...published, _id: "draft-private", version: 3, status: "draft" as const, listPrice: 99_999 },
      { ...published, _id: "other-tenant", organizationId: "other", version: 4, listPrice: 1 },
    ],
    benefits: [
      { _id: "benefit-1", organizationId: "academy", planVersionId: "version-public", sortOrder: 1, labels: { default: "Feedback", ru: "Обратная связь" } },
      { _id: "benefit-placeholder", organizationId: "academy", planVersionId: "version-public", sortOrder: 2, labels: { default: "QA localized", ru: "QA localized" } },
      { _id: "benefit-ielts", organizationId: "academy", planVersionId: "ielts-public", sortOrder: 1, labels: { default: "Exam strategy" } },
      { _id: "benefit-private", organizationId: "academy", planVersionId: "draft-private", sortOrder: 1, labels: { default: "Private" } },
    ],
  });

  assert.deepEqual(result, [{
    family: "Standard Tutoring",
    packName: "8 lessons",
    priceKzt: 26_000,
    lessonCount: 8,
    expiryDays: 60,
    benefits: ["Feedback"],
  }]);
  assert.deepEqual(Object.keys(result[0]).sort(), ["benefits", "expiryDays", "family", "lessonCount", "packName", "priceKzt"]);
});

test("public catalogue localizes pack names and benefits to the requested landing locale", () => {
  const input = {
    organizationId: "academy",
    families: [family],
    plans: [plan],
    versions: [published],
    benefits: [
      { _id: "benefit-1", organizationId: "academy", planVersionId: "version-public", sortOrder: 1, labels: { default: "Feedback", en: "Tutor feedback", ru: "Обратная связь преподавателя" } },
    ],
  };

  assert.deepEqual(buildPublicCatalogue({ ...input, locale: "ru" }).map(({ packName, benefits }) => ({ packName, benefits })), [
    { packName: "8 уроков", benefits: ["Обратная связь преподавателя"] },
  ]);
  assert.deepEqual(buildPublicCatalogue({ ...input, locale: "en" }).map(({ packName, benefits }) => ({ packName, benefits })), [
    { packName: "8 lessons", benefits: ["Tutor feedback"] },
  ]);
});

test("public landing locale defaults to Russian, falls back from invalid values, and accepts English", async () => {
  const modulePath = path.join(ROOT, "src/lib/publicLandingLocale.ts");
  assert.equal(fs.existsSync(modulePath), true, "public landing locale behavior is not implemented");
  const { resolveLandingLocale } = await import(pathToFileURL(modulePath).href);

  assert.equal(resolveLandingLocale(new URLSearchParams()), "ru");
  assert.equal(resolveLandingLocale(new URLSearchParams("lang=invalid")), "ru");
  assert.equal(resolveLandingLocale(new URLSearchParams("lang=ru")), "ru");
  assert.equal(resolveLandingLocale(new URLSearchParams("lang=en")), "en");
});

test("public landing language links are shareable and preserve unrelated search parameters", async () => {
  const modulePath = path.join(ROOT, "src/lib/publicLandingLocale.ts");
  assert.equal(fs.existsSync(modulePath), true, "public landing locale behavior is not implemented");
  const { buildLandingLanguageHref } = await import(pathToFileURL(modulePath).href);

  assert.equal(buildLandingLanguageHref("en", new URLSearchParams()), "/?lang=en");
  assert.equal(
    buildLandingLanguageHref("ru", new URLSearchParams("lang=en&utm_source=launch&ref=friend&preview=1")),
    "/?lang=ru&utm_source=launch&ref=friend&preview=1",
  );
});

test("public landing formats KZT and lesson/day units for the selected language", async () => {
  const modulePath = path.join(ROOT, "src/lib/publicLandingLocale.ts");
  assert.equal(fs.existsSync(modulePath), true, "public landing locale behavior is not implemented");
  const { formatLandingKzt, landingTrialHeading, landingUnit } = await import(pathToFileURL(modulePath).href);

  assert.equal(formatLandingKzt(26_000, "ru"), new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(26_000));
  assert.equal(formatLandingKzt(26_000, "en"), new Intl.NumberFormat("en-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(26_000));
  assert.deepEqual([1, 2, 5, 11, 21, 22].map((value) => landingUnit(value, "lesson", "ru")), ["урок", "урока", "уроков", "уроков", "урок", "урока"]);
  assert.deepEqual([1, 2, 5, 11, 21, 22].map((value) => landingUnit(value, "day", "ru")), ["день", "дня", "дней", "дней", "день", "дня"]);
  assert.equal(landingUnit(1, "lesson", "en"), "lesson");
  assert.equal(landingUnit(2, "lesson", "en"), "lessons");
  assert.equal(landingUnit(1, "day", "en"), "day");
  assert.equal(landingUnit(2, "day", "en"), "days");
  assert.equal(landingTrialHeading(1, "ru"), "1 пробный урок");
  assert.equal(landingTrialHeading(2, "ru"), "2 пробных урока");
  assert.equal(landingTrialHeading(5, "ru"), "5 пробных уроков");
  assert.equal(landingTrialHeading(2, "en"), "2 trial lessons");
});

test("public landing binds selected locale to catalogue, page language, and both complete copy sets", () => {
  const landing = fs.readFileSync(path.join(ROOT, "src/app/landing-page-client.tsx"), "utf8");

  assert.match(landing, /resolveLandingLocale\(searchParams\)/);
  assert.match(landing, /getPublicCatalogue, \{ locale \}/);
  assert.match(landing, /document\.documentElement\.lang = locale/);
  assert.match(landing, /<main[^>]*lang=\{locale\}/);
  assert.match(landing, /Русский/);
  assert.match(landing, /English/);
  assert.match(landing, /Говорите по-английски увереннее/);
  assert.match(landing, /Speak English with more confidence/);
  assert.match(landing, /Академия, где урок продолжается после звонка/);
  assert.match(landing, /An academy where learning continues after the call/);
  assert.match(landing, /Опубликованные пакеты временно недоступны/);
  assert.match(landing, /Published lesson packs are temporarily unavailable/);
  assert.match(landing, /Юридическая информация/);
  assert.match(landing, /Legal information/);
  assert.doesNotMatch(landing, /launchInfo\?\.tagline/);
  assert.match(landing, /Учитесь говорить уверенно\./);
  assert.match(landing, /Learn to speak with confidence\./);
  assert.match(landing, /landingUnit\(offer\.lessonCount, "lesson", locale\)/);
  assert.match(landing, /landingUnit\(offer\.expiryDays, "day", locale\)/);
});

test("public catalogue query is fixed to the academy and does not authenticate or expose documents", () => {
  const billing = fs.readFileSync(path.join(ROOT, "convex/billing.ts"), "utf8");
  const block = billing.match(/export const getPublicCatalogue = query\([\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.match(block, /ACADEMY_ID/);
  assert.match(block, /buildPublicCatalogue/);
  assert.doesNotMatch(block, /requireTenant|requireTenantPermission|organizationId:\s*v\.string/);
});

test("public branding uses the exact supplied tenant logo and keeps tenant upload overrides", () => {
  const logo = fs.readFileSync(path.join(ROOT, "public/brand/tenant/logo.svg"));
  assert.equal(createHash("sha256").update(logo).digest("hex"), "5874a58cb29f7ae16b3b15aa02b7cc47d83d84526d26bc4707826edc0ef6a67a");

  const component = fs.readFileSync(path.join(ROOT, "src/components/public/tenant-logo.tsx"), "utf8");
  const landing = fs.readFileSync(path.join(ROOT, "src/app/landing-page-client.tsx"), "utf8");
  const legal = fs.readFileSync(path.join(ROOT, "src/components/public/legal-shell.tsx"), "utf8");
  assert.match(component, /logoUrl \|\| DEFAULT_PUBLIC_TENANT_LOGO/);
  assert.match(component, /\/brand\/tenant\/logo\.svg/);
  assert.match(landing, /<TenantPublicLogo logoUrl=\{launchInfo\?\.logoUrl\}/);
  assert.match(legal, /<TenantPublicLogo logoUrl=\{info\?\.logoUrl\}/);
});

test("public pages use the exact WhatsApp CTA and expose no payment method content", () => {
  const landing = fs.readFileSync(path.join(ROOT, "src/app/landing-page-client.tsx"), "utf8");
  const privacy = fs.readFileSync(path.join(ROOT, "src/app/privacy/page.tsx"), "utf8");
  const terms = fs.readFileSync(path.join(ROOT, "src/app/terms/page.tsx"), "utf8");
  const settings = fs.readFileSync(path.join(ROOT, "convex/tenantSettings.ts"), "utf8");
  const publicInfo = settings.match(/export const getPublicLaunchInfo = query\([\s\S]*?\n\}\);/)?.[0] ?? "";

  assert.match(landing, /<a href=\{whatsappHref\}[\s\S]*?<MessageCircle[^>]*\/> Message Omnica English on WhatsApp<\/a>/);
  assert.match(landing, /const whatsappHref = "https:\/\/wa\.me\/message\/7M72VAH5Z4Z4C1"/);
  assert.doesNotMatch(landing, /wa\.me\/\?text|Kaspi|IELTS|CreditCard/);
  assert.doesNotMatch(`${privacy}\n${terms}`, /Kaspi|CVC|банковск|реквизит|<h2>[^<]*Оплат/);
  assert.doesNotMatch(publicInfo, /manualPayment|kaspiEnabled/);
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
