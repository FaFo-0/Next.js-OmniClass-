"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { PublicPlanCard } from "@/components/billing/PublicPlanCard";
import { CurrencySelector } from "@/components/billing/CurrencySelector";
import { TenantPublicLogo } from "@/components/public/tenant-logo";

const copy = {
  en: { title: "Lesson prices", intro: "Choose your lesson pack and currency. We will contact you to arrange payment after your request.", lessons: "lessons", days: "days from first use", choose: "Choose this pack", loading: "Loading lesson packs…", empty: "No lesson packs are available. Please contact the academy.", share: "Copy prices link", copied: "Link copied", failed: "Could not copy the link. Copy the address from your browser.", billing: "Already a student? Open billing", home: "Home", language: "Language", price: "Prices" },
  ru: { title: "Стоимость занятий", intro: "Выберите пакет и валюту. После заявки мы свяжемся с вами и согласуем оплату.", lessons: "уроков", days: "дней с первого использования", choose: "Выбрать пакет", loading: "Загружаем пакеты…", empty: "Пакеты пока недоступны. Свяжитесь с академией.", share: "Скопировать ссылку на цены", copied: "Ссылка скопирована", failed: "Не удалось скопировать ссылку. Скопируйте адрес из браузера.", billing: "Уже учитесь у нас? Открыть оплату", home: "Главная", language: "Язык", price: "Цены" },
  kk: { title: "Сабақ бағалары", intro: "Сабақ пакеті мен валютаны таңдаңыз. Өтінімнен кейін төлемді келісу үшін сізбен байланысамыз.", lessons: "сабақ", days: "алғаш пайдаланғаннан бастап күн", choose: "Пакетті таңдау", loading: "Пакеттер жүктелуде…", empty: "Пакеттер әзірге қолжетімсіз. Академияға хабарласыңыз.", share: "Бағалар сілтемесін көшіру", copied: "Сілтеме көшірілді", failed: "Сілтеме көшірілмеді. Мекенжайды браузерден көшіріңіз.", billing: "Біздің студентсіз бе? Төлемдерге өту", home: "Басты бет", language: "Тіл", price: "Бағалар" },
  ar: { title: "أسعار الدروس", intro: "اختر باقة الدروس والعملة. سنتواصل معك لترتيب الدفع بعد إرسال الطلب.", lessons: "دروس", days: "يومًا من أول استخدام", choose: "اختر الباقة", loading: "جارٍ تحميل الباقات…", empty: "لا توجد باقات متاحة حاليًا. تواصل مع الأكاديمية.", share: "نسخ رابط الأسعار", copied: "تم نسخ الرابط", failed: "تعذر نسخ الرابط. انسخ العنوان من المتصفح.", billing: "هل أنت طالب لدينا؟ افتح صفحة الدفع", home: "الرئيسية", language: "اللغة", price: "الأسعار" },
} as const;
type Locale = keyof typeof copy;

const subscribeCurrency = (notify: () => void) => {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};
const savedCurrency = () => {
  try { return localStorage.getItem("omnica-currency") ?? "USD"; } catch { return "USD"; }
};

function Prices() {
  const params = useSearchParams();
  const router = useRouter();
  const requestedLocale = params.get("lang");
  const locale: Locale = requestedLocale && requestedLocale in copy ? requestedLocale as Locale : "ru";
  const t = copy[locale];
  const settings = useQuery(api.currencies.publicSettings, {});
  const launch = useQuery(api.tenantSettings.getPublicLaunchInfo);
  const rememberedCurrency = useSyncExternalStore(subscribeCurrency, savedCurrency, () => "USD");
  const [shareStatus, setShareStatus] = useState("");
  const requestedCurrency = params.get("currency")?.toUpperCase();
  const candidate = requestedCurrency ?? rememberedCurrency;
  const currency = settings?.enabledCurrencies.includes(candidate) ? candidate : "USD";
  const catalogue = useQuery(api.pricing.getPublicCatalogue, { locale, currency });
  useEffect(() => { document.title = `${t.title} — ${launch?.name ?? "Omnica English"}`; }, [t.title, launch?.name]);
  const href = (path: string) => `${path}?${new URLSearchParams({ lang: locale, currency })}`;
  function selectCurrency(code: string) {
    router.replace(`/prices?${new URLSearchParams({ lang: locale, currency: code })}`, { scroll: false });
    setShareStatus("");
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(new URL(href("/prices"), window.location.origin).href);
      setShareStatus(t.copied);
    } catch { setShareStatus(t.failed); }
  }
  return <main lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className="min-h-screen bg-[#faf7ef] px-4 py-6 text-[#26143f] sm:px-8" style={{ "--public-accent": launch?.primaryColor ?? "#6716A4" } as CSSProperties}>
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#26143f]/15 pb-5">
        <Link href={`/?lang=${locale}`} aria-label={t.home}><TenantPublicLogo logoUrl={launch?.logoUrl} name={launch?.name ?? "Omnica English"} size={48} /></Link>
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label={t.language} className="input w-auto" value={locale} onChange={event => router.replace(`/prices?${new URLSearchParams({ lang: event.target.value, currency })}`, { scroll: false })}>
            <option value="ru">Русский</option><option value="en">English</option><option value="kk">Қазақша</option><option value="ar">العربية</option>
          </select>
          <CurrencySelector value={currency} onChange={selectCurrency} />
        </div>
      </header>
      <section className="py-10 sm:py-14">
        <p className="mb-4 inline-flex rounded-full bg-[#ffca00] px-3 py-1 text-xs font-extrabold uppercase tracking-widest">{launch?.name ?? "Omnica English"}</p>
        <h1 className="text-4xl font-black tracking-tight sm:text-6xl" style={{ color: "var(--public-accent)" }}>{t.title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#63566e] sm:text-lg">{t.intro}</p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button className="rounded-full border border-[#26143f]/30 px-5 py-3 font-semibold" onClick={share}>{t.share}</button>
          <Link className="underline underline-offset-4" href={href("/student/billing")}>{t.billing}</Link>
        </div>
        <p aria-live="polite" className="mt-3 text-sm">{shareStatus}</p>
        {catalogue === undefined ? <p className="mt-8" role="status">{t.loading}</p> : catalogue.length === 0 ? <p className="mt-8">{t.empty}</p> : catalogue.map(group => <section className="mt-10" key={group.familyId}>
          <h2 className="text-2xl font-bold">{group.label}</h2>
          {group.description && <p className="mt-2">{group.description}</p>}
          <div className={group.packs.length === 1 ? "mt-5 grid max-w-lg gap-5" : "mt-5 grid auto-rows-fr gap-5 md:grid-cols-2 xl:grid-cols-3"}>{group.packs.map(offer => <PublicPlanCard key={offer.packId} offer={offer} locale={locale} primaryHref={href("/sign-up")} primaryLabel={t.choose} whatsappUrl={launch?.supportWhatsappUrl} />)}</div>
        </section>)}
      </section>
    </div>
  </main>;
}

export default function PricesPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#faf7ef]" />}><Prices /></Suspense>;
}
