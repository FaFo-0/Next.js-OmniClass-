import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildAttributionValue, parseAttribution, sanitizeAttributionValue, withAttribution } from "../src/lib/attribution.ts";
import { buildLandingLanguageHref, buildPublicHref, formatLandingPrice, landingPackDetails, landingTrialHeading, resolveLandingLocale } from "../src/lib/publicLandingLocale.ts";
import { LANDING_COPY, PUBLIC_LANGUAGE_OPTIONS } from "../src/lib/publicLandingCopy.ts";
import { LEGAL_COPY } from "../src/lib/publicLegalCopy.ts";
import { buildCatalogue, type CatalogueFamilyRow, type CataloguePackRow } from "../convex/lib/pricingCatalogue.ts";
import { cleanReferralSource, trialGrantExpiry } from "../convex/lib/onboardingPolicy.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const family: CatalogueFamilyRow = { _id: "family-1", label: "Standard", labelEn: "Standard", labelRu: "Разговорный английский", description: "Everyday English.", descriptionRu: "Английский для жизни.", sortOrder: 1, isVisible: true, isArchived: false };
const pack: CataloguePackRow = { _id: "pack-8", familyId: "family-1", name: "8 lessons", nameEn: "8 lessons", nameRu: "8 уроков", lessons: 8, currency: "KZT", price: 26_000, expiryDays: 60, benefits: [{ default: "Feedback", en: "Tutor feedback", ru: "Обратная связь преподавателя" }], sortOrder: 1, isVisible: true, isArchived: false };

test("public catalogue keeps every offered family and mandatory commercial fields, with sale pricing", () => {
  const result = buildCatalogue({ locale: "en", now: "2026-09-29T10:00:00.000Z", families: [family, { ...family, _id: "ielts", label: "IELTS", labelEn: "IELTS", sortOrder: 2 }, { ...family, _id: "hidden", isVisible: false }], packs: [{ ...pack, salePrice: 21_000 }, { ...pack, _id: "ielts-pack", familyId: "ielts", benefits: [{ default: "QA localized" }] }, { ...pack, _id: "orphan", familyId: "missing" }, { ...pack, _id: "hidden-pack", familyId: "hidden" }] });
  assert.deepEqual(result.map((group) => group.label), ["Standard", "IELTS"]);
  assert.deepEqual(result[1]?.packs[0]?.benefits, ["QA localized"]);
  assert.deepEqual(Object.keys(result[0]!.packs[0]!).sort(), ["benefits", "currency", "discountAmount", "expiryDays", "familyId", "familyLabel", "lessons", "listPrice", "name", "netPrice", "onSale", "packId"]);
  assert.equal(result[0]?.packs[0]?.netPrice, 21_000);
  assert.equal(result[0]?.packs[0]?.listPrice, 26_000);
  assert.equal(result[0]?.packs[0]?.onSale, true);
});

test("commercial Kazakh falls back to English where translations are not authored; static Kazakh does not", () => {
  const input = { now: "2026-09-29T10:00:00.000Z", families: [family], packs: [pack] };
  assert.equal(buildCatalogue({ ...input, locale: "ru" })[0]?.packs[0]?.name, "8 уроков");
  assert.equal(buildCatalogue({ ...input, locale: "kk" })[0]?.packs[0]?.name, "8 lessons");
  assert.equal(buildCatalogue({ ...input, locale: "kk" })[0]?.packs[0]?.benefits[0], "Tutor feedback");
  assert.match(LANDING_COPY.kk.hero, /Әртүрлі елдерден/);
  assert.match(LEGAL_COPY.kk.privacy.sections[0]?.heading ?? "", /Қандай деректер/);
});

test("Russian is the default; locale and attribution survive landing and legal switches", () => {
  assert.equal(resolveLandingLocale(new URLSearchParams()), "ru");
  assert.equal(resolveLandingLocale(new URLSearchParams("lang=invalid")), "ru");
  assert.equal(resolveLandingLocale(new URLSearchParams("lang=kk")), "kk");
  assert.equal(resolveLandingLocale(new URLSearchParams("lang=en")), "en");
  const current = new URLSearchParams("lang=ru&utm_source=launch&ref=friend&preview=1");
  assert.equal(buildLandingLanguageHref("kk", current), "/?lang=kk&utm_source=launch&ref=friend&preview=1");
  assert.equal(buildPublicHref("/privacy", "en", current), "/privacy?lang=en&utm_source=launch&ref=friend&preview=1");
  assert.deepEqual(PUBLIC_LANGUAGE_OPTIONS.map((item) => item.value), ["ru", "kk", "en"]);
});

test("complete public copy exists for three locales, including accessibility and legal scope", () => {
  const landingKeys = Object.keys(LANDING_COPY.ru).sort();
  const shellKeys = Object.keys(LEGAL_COPY.ru.shell).sort();
  for (const locale of ["ru", "kk", "en"] as const) {
    assert.deepEqual(Object.keys(LANDING_COPY[locale]).sort(), landingKeys);
    assert.deepEqual(Object.keys(LEGAL_COPY[locale].shell).sort(), shellKeys);
    assert.equal(LEGAL_COPY[locale].privacy.sections.length, 7);
    assert.equal(LEGAL_COPY[locale].terms.sections.length, 9);
    assert.equal(LEGAL_COPY[locale].privacy.sections[0]?.points?.length, 5);
    assert.equal(LEGAL_COPY[locale].terms.sections[7]?.paragraphs?.[0]?.includes("{privacy}"), true);
    for (const kind of ["privacy", "terms"] as const) {
      for (const section of LEGAL_COPY[locale][kind].sections) {
        assert.ok(section.heading && (section.paragraphs?.length || section.points?.length));
      }
    }
    assert.ok(LANDING_COPY[locale].features.length === 4 && LANDING_COPY[locale].process.length === 3);
    assert.match(LANDING_COPY[locale].whatsapp, /WhatsApp/);
  }
  assert.match(LANDING_COPY.ru.hero, /носителями/);
  assert.match(LANDING_COPY.en.features[0]?.[1] ?? "", /teacher.*Real-time transcription/);
  assert.match(LANDING_COPY.kk.features[1]?.[1] ?? "", /Жарияланған сөздер/);
  assert.match(LEGAL_COPY.en.privacy.sections[4]?.paragraphs?.[0] ?? "", /indefinitely/);
  assert.match(LEGAL_COPY.ru.terms.sections[3]?.paragraphs?.[0] ?? "", /цену и валюту/);
});

test("public rendering binds locale, catalogue, dynamic packs, conditional trial and truthful illustrations", () => {
  const landing = source("src/app/landing-page-client.tsx");
  const shell = source("src/components/public/legal-shell.tsx");
  const switcher = source("src/components/layout/language-switcher.tsx");
  assert.match(switcher, /export function LanguageSelectControl/);
  assert.match(landing, /<LanguageSelectControl/);
  assert.match(shell, /<LanguageSelectControl/);
  assert.match(landing, /getPublicCatalogue, \{ locale \}/);
  assert.match(landing, /<main id="top" lang=\{locale\}/);
  assert.match(shell, /<main lang=\{locale\}/);
  assert.match(landing, /launchInfo\?\.trial\.enabled/);
  assert.match(landing, /group\.packs\.map/);
  assert.match(landing, /offer\.benefits\.map/);
  assert.match(landing, /formatLandingPrice\(offer\.netPrice, offer\.currency, locale\)/);
  assert.match(landing, /formatLandingPrice\(offer\.listPrice, offer\.currency, locale\)/);
  assert.match(landing, /landingPackDetails\(offer\.lessons, offer\.expiryDays, locale\)/);
  assert.match(landing, /aria-label=\{copy\.illustration\}/);
  assert.doesNotMatch(landing, /launchInfo\?\.tagline|<img[^>]*screenshot/);
});

test("localized pack units and trial labels work without static catalogue assumptions", () => {
  assert.equal(landingPackDetails(8, 60, "ru"), "8 уроков · срок 60 дней с первого использования");
  assert.equal(landingPackDetails(8, 60, "kk"), "8 сабақ · алғашқы пайдаланудан бастап 60 күн жарамды");
  assert.equal(landingPackDetails(1, 1, "en"), "1 lesson · valid for 1 day from first use");
  assert.equal(landingTrialHeading(1, "kk"), "Сынақ сабағынан бастаңыз");
  assert.equal(formatLandingPrice(26_000, "KZT", "kk"), new Intl.NumberFormat("kk-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(26_000));
});

test("public catalogue is academy-scoped, branding preserves supplied artwork with adjusted lockup spacing and upload override", () => {
  const pricing = source("convex/pricing.ts");
  const block = pricing.match(/export const getPublicCatalogue = query\([\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.match(block, /ACADEMY_ID/);
  assert.match(block, /catalogueFor/);
  assert.doesNotMatch(block, /requireTenant|requireTenantPermission|organizationId:\s*v\.string/);
  for (const [asset, hash] of Object.entries({
    "src/app/icon.svg": "f8ba34885811a370501ccc4e35c6bf9976a896874d26c694d9c466b473a94ae5",
    "public/brand/tenant/logo.svg": "f8ba34885811a370501ccc4e35c6bf9976a896874d26c694d9c466b473a94ae5",
    "public/brand/tenant/lockup-light.svg": "122c6847fadc3da38218ef9b120cd0b325a67e037458ab5b07c90d02cddf3aa4",
    "public/brand/tenant/lockup-dark.svg": "82c2f2a2d13c7b4dbf16bb51f2605db3d4ee794afb89b855474ba29c7aebce16",
  })) {
    assert.equal(createHash("sha256").update(fs.readFileSync(path.join(ROOT, asset))).digest("hex"), hash, asset);
  }
  assert.deepEqual(
    fs.readFileSync(path.join(ROOT, "src/app/icon.svg")),
    fs.readFileSync(path.join(ROOT, "public/brand/tenant/logo.svg")),
    "Next metadata icon must be the canonical tenant mark byte-for-byte",
  );
  assert.match(source("src/app/landing-page-client.tsx"), /<TenantPublicLogo logoUrl=\{launchInfo\?\.logoUrl\}/);
  assert.match(source("src/components/public/legal-shell.tsx"), /<TenantPublicLogo logoUrl=\{info\?\.logoUrl\}/);
});

test("WhatsApp keeps its exact deep link while visible and accessible labels are localized; no public payment instructions", () => {
  const landing = source("src/app/landing-page-client.tsx");
  assert.match(landing, /const WHATSAPP = "https:\/\/wa\.me\/message\/7M72VAH5Z4Z4C1"/);
  assert.match(landing, /href=\{WHATSAPP\}[\s\S]*?aria-label=\{copy\.whatsapp\}/);
  assert.doesNotMatch(landing, /Kaspi|CreditCard/);
  assert.doesNotMatch(source("convex/tenantSettings.ts").match(/export const getPublicLaunchInfo = query\([\s\S]*?\n\}\);/)?.[0] ?? "", /manualPayment|kaspiEnabled/);
  assert.doesNotMatch(JSON.stringify(LEGAL_COPY), /Kaspi|CVC|реквизит/);
});

test("signup attribution is bounded and preserved by the mounted route", () => {
  const parsed = parseAttribution("?utm_source=%20test-ad%20&utm_medium=social%00&utm_campaign=" + "x".repeat(300) + "&ref=friend&evil=ignored");
  assert.deepEqual(parsed, { utm_source: "test-ad", utm_medium: "social", utm_campaign: "x".repeat(150), ref: "friend" });
  assert.equal(sanitizeAttributionValue("  hello\nworld  ", 100), "helloworld");
  assert.equal(buildAttributionValue(parsed), `utm_source=test-ad&utm_medium=social&utm_campaign=${"x".repeat(150)}&ref=friend`);
  assert.equal(withAttribution("/sign-up", parsed), `/sign-up?utm_source=test-ad&utm_medium=social&utm_campaign=${"x".repeat(150)}&ref=friend`);
  assert.match(source("src/app/landing-page-client.tsx"), /withAttribution\("\/sign-up", attribution\)/);
  const onboarding = source("src/app/onboarding/student/page.tsx");
  assert.match(onboarding, /readStoredAttribution/);
  assert.match(onboarding, /referralSource: attributionValue \|\| referral \|\| undefined/g);
  assert.match(onboarding, /clearStoredAttribution\(\)/);
});

test("sign-in, onboarding trial and referral boundaries remain intact", () => {
  assert.match(source("src/app/(auth)/sign-in/[[...sign-in]]/page.tsx"), /forceRedirectUrl="\/portal"/);
  assert.match(source("convex/onboarding.ts"), /const firstTime = !existing\?\.completedAt/);
  assert.equal(cleanReferralSource(" \u0000 \n "), undefined);
  assert.equal(cleanReferralSource("x".repeat(3_000)), "x".repeat(2_048));
  assert.equal(trialGrantExpiry(0, Date.UTC(2026, 8, 28)), undefined);
  assert.equal(trialGrantExpiry(7, Date.UTC(2026, 8, 28)), "2026-10-05");
});
