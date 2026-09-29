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
import {
  buildCatalogue,
  type CatalogueFamilyRow,
  type CataloguePackRow,
} from "../convex/lib/pricingCatalogue.ts";
import {
  cleanReferralSource,
  trialGrantExpiry,
} from "../convex/lib/onboardingPolicy.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

const family: CatalogueFamilyRow = {
  _id: "family-1",
  label: "Standard",
  labelEn: "Standard",
  labelRu: "Разговорный английский",
  description: "Everyday English.",
  descriptionRu: "Английский для жизни.",
  sortOrder: 1,
  isVisible: true,
  isArchived: false,
};
const pack: CataloguePackRow = {
  _id: "pack-8",
  familyId: "family-1",
  name: "8 lessons",
  nameEn: "8 lessons",
  nameRu: "8 уроков",
  lessons: 8,
  currency: "KZT",
  price: 26_000,
  expiryDays: 60,
  benefits: [{ default: "Feedback", en: "Tutor feedback", ru: "Обратная связь преподавателя" }],
  sortOrder: 1,
  isVisible: true,
  isArchived: false,
};

test("the public catalogue exposes every offered family, in order, with sale-aware prices", () => {
  const ieltsFamily: CatalogueFamilyRow = { _id: "family-ielts", label: "IELTS", sortOrder: 2, isVisible: true, isArchived: false };
  const result = buildCatalogue({
    locale: "en",
    now: "2026-09-29T10:00:00.000Z",
    families: [family, ieltsFamily, { ...family, _id: "family-hidden", isVisible: false }],
    packs: [
      { ...pack, salePrice: 21_000, saleEndsAt: "2026-10-31T23:59:59.000Z" },
      { ...pack, _id: "pack-ielts-8", familyId: "family-ielts", price: 35_000, benefits: [{ default: "QA localized" }] },
      { ...pack, _id: "pack-hidden", familyId: "family-hidden" },
      { ...pack, _id: "pack-archived", isArchived: true },
    ],
  });

  // Every published family reaches the website, in the academy's explicit order.
  assert.deepEqual(result.map((group) => group.label), ["Standard", "IELTS"]);
  // A stale benefit is the academy's data to fix, not the code's to filter.
  assert.deepEqual(result[1]?.packs[0]?.benefits, ["QA localized"]);
  // A sale price is what the website shows, with the base price beside it.
  assert.deepEqual(
    { net: result[0]?.packs[0]?.netPrice, list: result[0]?.packs[0]?.listPrice, onSale: result[0]?.packs[0]?.onSale },
    { net: 21_000, list: 26_000, onSale: true },
  );
  assert.deepEqual(Object.keys(result[0]!.packs[0]!).sort(), [
    "benefits", "currency", "discountAmount", "expiryDays", "familyId", "familyLabel",
    "lessons", "listPrice", "name", "netPrice", "onSale", "packId",
  ]);
});

test("the public catalogue localizes family, pack, and benefit copy to the landing locale", () => {
  const input = { now: "2026-09-29T10:00:00.000Z", families: [family], packs: [pack] };

  assert.deepEqual(
    buildCatalogue({ ...input, locale: "ru" }).map((group) => ({
      label: group.label,
      description: group.description,
      name: group.packs[0]?.name,
      benefits: group.packs[0]?.benefits,
    })),
    [{
      label: "Разговорный английский",
      description: "Английский для жизни.",
      name: "8 уроков",
      benefits: ["Обратная связь преподавателя"],
    }],
  );
  assert.deepEqual(
    buildCatalogue({ ...input, locale: "en" }).map((group) => group.packs[0]?.benefits),
    [["Tutor feedback"]],
  );
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

test("the platform and public landing share one controlled native language select", () => {
  const switcher = fs.readFileSync(path.join(ROOT, "src/components/layout/language-switcher.tsx"), "utf8");
  const landing = fs.readFileSync(path.join(ROOT, "src/app/landing-page-client.tsx"), "utf8");

  assert.match(switcher, /export function LanguageSelectControl/);
  assert.match(switcher, /value:\s*T/);
  assert.match(switcher, /onChange:\s*\(value:\s*T\)/);
  assert.match(switcher, /options:\s*readonly/);
  assert.match(switcher, /ariaLabel:\s*string/);
  assert.match(switcher, /<Globe[^>]*aria-hidden="true"/);
  assert.match(switcher, /<select/);
  assert.match(switcher, /aria-label=\{ariaLabel\}/);
  assert.match(switcher, /className="h-8 rounded-md border bg-background px-2 text-sm"/);
  assert.match(switcher, /<LanguageSelectControl/);
  assert.match(switcher, /useLocale\(\)/);
  assert.match(switcher, /locales\.map/);
  assert.match(switcher, /localeNames\[locale\]/);

  assert.match(landing, /import \{ LanguageSelectControl \}/);
  assert.match(landing, /<LanguageSelectControl/);
  assert.match(landing, /const PUBLIC_LANGUAGE_OPTIONS = \[/);
  assert.match(landing, /\{ value: "ru", label: "Русский" \}/);
  assert.match(landing, /\{ value: "en", label: "English" \}/);
  assert.doesNotMatch(landing, /value: "(?:ar|kk)"/);
  assert.match(landing, /router\.push\(buildLandingLanguageHref\(nextLocale, searchParams\)/);
  assert.doesNotMatch(landing, /LocaleProvider|aria-current=|russianHref|englishHref/);
  assert.doesNotMatch(landing, /rounded-full border border-zinc-200 bg-white p-1 text-xs font-bold/);
});

test("the public header has an explicit two-row mobile and single-row desktop contract", () => {
  const landing = fs.readFileSync(path.join(ROOT, "src/app/landing-page-client.tsx"), "utf8");

  assert.match(landing, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(landing, /col-span-2/);
  assert.match(landing, /sm:flex/);
  assert.match(landing, /overflow-x-clip/);
});

test("public landing formats pack prices and lesson/day units for the selected language", async () => {
  const modulePath = path.join(ROOT, "src/lib/publicLandingLocale.ts");
  assert.equal(fs.existsSync(modulePath), true, "public landing locale behavior is not implemented");
  const { formatLandingPrice, landingTrialHeading, landingUnit } = await import(pathToFileURL(modulePath).href);

  assert.equal(formatLandingPrice(26_000, "KZT", "ru"), new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(26_000));
  assert.equal(formatLandingPrice(26_000, "KZT", "en"), new Intl.NumberFormat("en-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(26_000));
  assert.equal(formatLandingPrice(1_250.5, "USD", "en"), new Intl.NumberFormat("en-KZ", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(1_250.5));
  assert.deepEqual([1, 2, 5, 11, 21, 22].map((value) => landingUnit(value, "lesson", "ru")), ["урок", "урока", "уроков", "уроков", "урок", "урока"]);
  assert.deepEqual([1, 2, 5, 11, 21, 22].map((value) => landingUnit(value, "day", "ru")), ["день", "дня", "дней", "дней", "день", "дня"]);
  assert.equal(landingUnit(1, "lesson", "en"), "lesson");
  assert.equal(landingUnit(2, "lesson", "en"), "lessons");
  assert.equal(landingUnit(1, "day", "en"), "day");
  assert.equal(landingUnit(2, "day", "en"), "days");
  assert.equal(landingTrialHeading(1, "ru"), "Начните с пробного урока");
  assert.equal(landingTrialHeading(2, "ru"), "Начните с 2 пробных уроков");
  assert.equal(landingTrialHeading(5, "ru"), "Начните с 5 пробных уроков");
  assert.equal(landingTrialHeading(1, "en"), "Start with a trial lesson");
  assert.equal(landingTrialHeading(2, "en"), "Start with 2 trial lessons");
});

test("pricing-card lesson-count headings use natural Russian and English forms", async () => {
  const modulePath = path.join(ROOT, "src/lib/publicLandingLocale.ts");
  const { formatLandingLessonCount } = await import(pathToFileURL(modulePath).href);

  assert.deepEqual(
    [1, 2, 4, 5, 8, 12].map((value) => formatLandingLessonCount(value, "ru")),
    ["1 урок", "2 урока", "4 урока", "5 уроков", "8 уроков", "12 уроков"],
  );
  assert.deepEqual(
    [1, 4, 8, 12].map((value) => formatLandingLessonCount(value, "en")),
    ["1 lesson", "4 lessons", "8 lessons", "12 lessons"],
  );
});

test("public landing binds locale and uses direct student-focused copy in both languages", () => {
  const landing = fs.readFileSync(path.join(ROOT, "src/app/landing-page-client.tsx"), "utf8");
  const localeHelpers = fs.readFileSync(path.join(ROOT, "src/lib/publicLandingLocale.ts"), "utf8");
  const publicCopy = `${landing}\n${localeHelpers}`;

  assert.match(landing, /resolveLandingLocale\(searchParams\)/);
  assert.match(landing, /getPublicCatalogue, \{ locale \}/);
  assert.match(landing, /document\.documentElement\.lang = locale/);
  assert.match(landing, /<main[^>]*lang=\{locale\}/);
  assert.match(landing, /Русский/);
  assert.match(landing, /English/);
  assert.match(landing, /Практикуйте английский/);
  assert.match(landing, /Для тех, кто хочет лучше говорить и понимать английский/);
  assert.match(landing, /Practise English/);
  assert.match(landing, /For students who want to speak and understand English better/);
  assert.match(landing, /Выберите пакет уроков/);
  assert.match(landing, /Choose a lesson pack/);
  assert.match(landing, /Выберите 4, 8 или 12 индивидуальных уроков\. Пакет действует 60 дней после первого занятия\./);
  assert.match(landing, /Choose 4, 8, or 12 one-to-one lessons\. Each pack is valid for 60 days after your first lesson\./);
  assert.match(publicCopy, /Начните с пробного урока/);
  assert.match(publicCopy, /Start with a trial lesson/);
  assert.match(landing, /Создайте аккаунт, и после регистрации мы добавим/);
  assert.match(landing, /Create your account, and we will add/);
  assert.match(landing, /Юридическая информация/);
  assert.match(landing, /Legal information/);
  assert.doesNotMatch(landing, /launchInfo\?\.tagline/);
  assert.match(landing, /landingUnit\(offer\.lessons, "lesson", locale\)/);
  assert.match(landing, /landingUnit\(offer\.expiryDays, "day", locale\)/);
  assert.match(landing, /formatLandingPrice\(offer\.netPrice, offer\.currency, locale\)/);
  assert.match(landing, /formatLandingPrice\(offer\.listPrice, offer\.currency, locale\)/);

  const forbidden = [
    "published catalogue", "in your account", "every learning feature available to every student",
    "current options", "platform keeps", "automated response", "trial credit", "trial lesson balance",
    "опубликованного каталога", "личном кабинете", "искусственных уровней доступа",
    "актуальные варианты", "платформа сохраняет", "автоматическим ответом", "пробный кредит",
  ];
  for (const phrase of forbidden) {
    assert.equal(landing.toLocaleLowerCase().includes(phrase), false, `internal/system phrase remains: ${phrase}`);
  }
  assert.doesNotMatch(landing, /[—–]/);
});

test("public catalogue query is fixed to the academy and does not authenticate or expose documents", () => {
  const pricing = fs.readFileSync(path.join(ROOT, "convex/pricing.ts"), "utf8");
  const block = pricing.match(/export const getPublicCatalogue = query\([\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.match(block, /ACADEMY_ID/);
  assert.match(block, /catalogueFor/);
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

test("the public catalogue never renders a pack without its family, and never invents a family", () => {
  const result = buildCatalogue({
    locale: "ru",
    now: "2026-09-29T10:00:00.000Z",
    families: [family],
    packs: [pack, { ...pack, _id: "pack-orphan", familyId: "family-missing" }],
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0]?.packs.map((offer) => offer.packId), ["pack-8"]);
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
