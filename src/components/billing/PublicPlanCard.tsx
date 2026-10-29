"use client";

import Link from "next/link";
import { Check, ArrowUpRight } from "lucide-react";
import type { CataloguePackOffer } from "../../../convex/lib/pricingCatalogue";
import { currencyDigits } from "../../../convex/lib/money";

const accent = "var(--public-accent, var(--brand-purple, #6716A4))";
const words = {
  en: { signup: "Sign up", choose: "Choose this pack", whatsapp: "Ask on WhatsApp", payment: "Payment is arranged on WhatsApp.", off: (n: string) => `${n}% off`, validity: (n: string) => `${n} ${n === "1" ? "day" : "days"} from first use` },
  ru: { signup: "Зарегистрироваться", choose: "Выбрать пакет", whatsapp: "Спросить в WhatsApp", payment: "Оплату согласуем в WhatsApp.", off: (n: string) => `Скидка ${n}%`, validity: (n: string) => `${n} дн. с первого использования` },
  kk: { signup: "Тіркелу", choose: "Пакетті таңдау", whatsapp: "WhatsApp арқылы сұрау", payment: "Төлем WhatsApp арқылы келісіледі.", off: (n: string) => `${n}% жеңілдік`, validity: (n: string) => `Алғаш пайдаланғаннан бастап ${n} күн` },
  ar: { signup: "إنشاء حساب", choose: "اختر الباقة", whatsapp: "اسأل عبر واتساب", payment: "يتم ترتيب الدفع عبر واتساب.", off: (n: string) => `خصم ${n}٪`, validity: (n: string) => `الصلاحية بالأيام: ${n} من أول استخدام` },
};
function lessonLabel(count: number, locale: keyof typeof words) {
  const n = new Intl.NumberFormat(locale).format(count);
  const rule = new Intl.PluralRules(locale).select(count);
  if (locale === "ru") return `${n} ${rule === "one" ? "урок" : rule === "few" ? "урока" : "уроков"}`;
  if (locale === "ar") return rule === "one" ? "درس واحد" : rule === "two" ? "درسان" : `${n} ${rule === "few" ? "دروس" : "درسًا"}`;
  return `${n} ${locale === "kk" ? "сабақ" : count === 1 ? "lesson" : "lessons"}`;
}
function contactHref(value: string | undefined, offer: CataloguePackOffer, price: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "wa.me") return null;
    if (/^\/\d+\/?$/.test(url.pathname)) url.searchParams.set("text", `${offer.name} — ${price}`);
    return url.href;
  } catch { return null; }
}
function signupHref(value: string | undefined, offer: CataloguePackOffer) {
  if (!value) return undefined;
  const url = new URL(value, "https://omnica.invalid");
  url.searchParams.set("pack", offer.packId);
  url.searchParams.set("currency", offer.currency);
  return value.startsWith("/") ? `${url.pathname}${url.search}${url.hash}` : url.href;
}
function WhatsAppIcon() {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor" aria-hidden="true"><path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.49 0 .14 5.35.13 11.92c0 2.1.55 4.16 1.59 5.98L.03 24l6.27-1.64a11.9 11.9 0 0 0 5.75 1.46h.01c6.57 0 11.92-5.35 11.93-11.92a11.85 11.85 0 0 0-3.47-8.42ZM12.06 21.8h-.01a9.9 9.9 0 0 1-5.03-1.38l-.36-.21-3.72.98.99-3.63-.24-.37a9.88 9.88 0 0 1-1.52-5.27c0-5.46 4.44-9.9 9.91-9.9a9.84 9.84 0 0 1 7 2.9 9.84 9.84 0 0 1 2.9 7.01c-.01 5.46-4.45 9.9-9.92 9.9Zm5.43-7.41c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.09 4.49.71.3 1.26.49 1.69.62.71.23 1.35.2 1.86.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" /></svg>;
}

export function PublicPlanCard({ offer, locale, primaryHref, onChoose, primaryLabel, whatsappUrl, disabled = false, preview = false, compact = false }: {
  offer: CataloguePackOffer;
  locale: string;
  primaryHref?: string;
  onChoose?: () => void;
  primaryLabel?: string;
  whatsappUrl?: string;
  disabled?: boolean;
  preview?: boolean;
  compact?: boolean;
}) {
  const lang = (locale in words ? locale : "en") as keyof typeof words;
  const t = words[lang];
  const money = (amount: number) => new Intl.NumberFormat(lang, { style: "currency", currency: offer.currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: Number.isInteger(amount) ? 0 : currencyDigits(offer.currency), maximumFractionDigits: currencyDigits(offer.currency) }).format(amount);
  const price = money(offer.netPrice);
  const percentage = (offer as CataloguePackOffer & { salePercent?: number }).salePercent ?? (offer.listPrice > 0 ? Math.round((1 - offer.netPrice / offer.listPrice) * 100) : 0);
  const contact = contactHref(whatsappUrl, offer, price);
  const destination = signupHref(primaryHref, offer);
  const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase(lang).replace(/[\s\p{P}]/gu, "");
  const genericTitle = Object.keys(words).some(code => normalize(offer.name) === normalize(lessonLabel(offer.lessons, code as keyof typeof words)));
  const primaryClass = `inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-sm font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-600 ${preview ? "" : "disabled:cursor-not-allowed disabled:opacity-50"}`;
  function rememberSelection() {
    if (preview) return;
    try {
      localStorage.setItem("omnica-selected-pack", offer.packId);
      localStorage.setItem("omnica-currency", offer.currency);
    } catch { /* Links retain the selection when browser storage is unavailable. */ }
  }
  return <article className={`min-w-0 overflow-hidden rounded-3xl border border-purple-200 bg-white text-[#26143f] shadow-[0_8px_25px_-18px_#26143f44] ${compact ? "grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)]" : "flex h-full flex-col"}`}>
    <div className="relative overflow-hidden bg-[#f3edfa] p-6">
      <span aria-hidden="true" className="pointer-events-none absolute -end-8 -top-10 h-32 w-32 rounded-full bg-[#fff3bf]" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs font-extrabold uppercase tracking-wider opacity-65">{offer.familyLabel}</p>
        {offer.onSale && percentage > 0 && <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">{t.off(new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(percentage))}</span>}
      </div>
      <h3 className={`relative mt-5 break-words font-extrabold leading-snug ${genericTitle ? "text-3xl tracking-tight" : "text-2xl"}`} style={{ color: accent }}>{offer.name}</h3>
      {!genericTitle && <p className="relative mt-3 text-sm font-semibold">{lessonLabel(offer.lessons, lang)}</p>}
      <p className="relative mt-3 text-xs leading-relaxed opacity-70">{t.validity(new Intl.NumberFormat(lang).format(offer.expiryDays))}</p>
    </div>
    <div className="flex flex-1 flex-col p-6">
      <div className="flex min-h-10 flex-wrap items-baseline gap-x-3 gap-y-1" dir="ltr">
        <strong className="break-words text-3xl font-black tracking-tight" style={{ color: accent }}>{price}</strong>
        {offer.onSale && <del className="text-lg font-semibold text-red-600 decoration-2">{money(offer.listPrice)}</del>}
      </div>
      <ul className={`mb-6 mt-5 flex-1 space-y-3 ${compact ? "lg:grid lg:grid-cols-2 lg:gap-x-5 lg:gap-y-2 lg:space-y-0" : ""}`}>{offer.benefits.map((benefit, index) => <li key={`${index}-${benefit}`} className="flex items-start gap-2.5 text-sm leading-relaxed text-[#594668]"><Check size={17} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: accent }} /><span dir="auto">{benefit}</span></li>)}</ul>
      <div className="flex items-stretch gap-2">
        {destination && !disabled && !preview ? <Link href={destination} onClick={rememberSelection} className={primaryClass} style={{ backgroundColor: accent }}>{t.signup}<ArrowUpRight size={16} aria-hidden="true" className="shrink-0" /></Link> : <button type="button" onClick={preview ? undefined : onChoose} disabled={disabled || preview} className={primaryClass} style={{ backgroundColor: accent }}>{destination || preview ? t.signup : primaryLabel ?? t.choose}<ArrowUpRight size={16} aria-hidden="true" className="shrink-0" /></button>}
        {contact && (preview ? <button type="button" disabled aria-label={t.whatsapp} title={t.whatsapp} className="inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-purple-200 bg-[#f3edfa]" style={{ color: accent }}><WhatsAppIcon /></button> : <a href={contact} target="_blank" rel="noreferrer" aria-label={t.whatsapp} title={t.whatsapp} className="inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-purple-200 bg-[#f3edfa] transition-colors hover:bg-purple-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-600" style={{ color: accent }}><WhatsAppIcon /></a>)}
      </div>
      {(destination || preview) && <p className="mt-3 text-xs leading-relaxed text-[#776587]">{t.payment}</p>}
    </div>
  </article>;
}
