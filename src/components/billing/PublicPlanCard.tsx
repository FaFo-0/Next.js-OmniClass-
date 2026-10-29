"use client";

import Link from "next/link";
import { Check, MessageCircle, ArrowUpRight } from "lucide-react";
import type { CataloguePackOffer } from "../../../convex/lib/pricingCatalogue";
import { currencyDigits } from "../../../convex/lib/money";

const themes = [
  { header: "bg-purple-100 text-purple-950", number: "text-purple-800", dot: "bg-purple-200", border: "border-purple-200" },
  { header: "bg-cyan-100 text-cyan-950", number: "text-cyan-800", dot: "bg-cyan-200", border: "border-cyan-200" },
  { header: "bg-amber-100 text-amber-950", number: "text-amber-800", dot: "bg-amber-200", border: "border-amber-200" },
  { header: "bg-rose-100 text-rose-950", number: "text-rose-800", dot: "bg-rose-200", border: "border-rose-200" },
];
const words = {
  en: { choose: "Choose this pack", whatsapp: "Ask on WhatsApp", off: (n: string) => `${n}% off`, validity: (n: string) => `${n} ${n === "1" ? "day" : "days"} from first use` },
  ru: { choose: "Выбрать пакет", whatsapp: "Спросить в WhatsApp", off: (n: string) => `Скидка ${n}%`, validity: (n: string) => `${n} дн. с первого использования` },
  kk: { choose: "Пакетті таңдау", whatsapp: "WhatsApp арқылы сұрау", off: (n: string) => `${n}% жеңілдік`, validity: (n: string) => `Алғаш пайдаланғаннан бастап ${n} күн` },
  ar: { choose: "اختر الباقة", whatsapp: "اسأل عبر واتساب", off: (n: string) => `خصم ${n}٪`, validity: (n: string) => `الصلاحية بالأيام: ${n} من أول استخدام` },
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
    // Message short links carry their own server-managed message. Numeric links
    // support a customer-editable prefilled enquiry without changing the route.
    if (/^\/\d+\/?$/.test(url.pathname)) url.searchParams.set("text", `${offer.name} — ${price}`);
    return url.href;
  } catch { return null; }
}

export function PublicPlanCard({ offer, locale, primaryHref, onChoose, primaryLabel, whatsappUrl, disabled = false }: {
  offer: CataloguePackOffer;
  locale: string;
  primaryHref?: string;
  onChoose?: () => void;
  primaryLabel?: string;
  whatsappUrl?: string;
  disabled?: boolean;
}) {
  const lang = (locale in words ? locale : "en") as keyof typeof words;
  const t = words[lang];
  const hash = [...offer.packId].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 0);
  const theme = themes[hash % themes.length];
  const money = (amount: number) => new Intl.NumberFormat(lang, { style: "currency", currency: offer.currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: Number.isInteger(amount) ? 0 : currencyDigits(offer.currency), maximumFractionDigits: currencyDigits(offer.currency) }).format(amount);
  const price = money(offer.netPrice);
  const percentage = (offer as CataloguePackOffer & { salePercent?: number }).salePercent ?? (offer.listPrice > 0 ? Math.round((1 - offer.netPrice / offer.listPrice) * 100) : 0);
  const contact = contactHref(whatsappUrl, offer, price);
  const primaryClass = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-sm font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-600 disabled:cursor-not-allowed disabled:opacity-50";
  return <article className={`flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border bg-white shadow-[0_8px_25px_-18px_#26143f44] ${offer.onSale ? "border-red-300 ring-1 ring-red-100" : theme.border}`}>
    <div className={`relative overflow-hidden p-6 ${theme.header}`}>
      <span aria-hidden="true" className={`pointer-events-none absolute -end-6 -top-8 h-28 w-28 rounded-full opacity-60 ${theme.dot}`} />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs font-extrabold uppercase tracking-wider opacity-70">{offer.familyLabel}</p>
        {offer.onSale && percentage > 0 && <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-extrabold text-white">{t.off(new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(percentage))}</span>}
      </div>
      <h3 className="relative mt-4 break-words text-xl font-extrabold leading-snug">{offer.name}</h3>
      <p className={`relative mt-4 text-3xl font-black tracking-tight ${theme.number}`}>{lessonLabel(offer.lessons, lang)}</p>
      <p className="relative mt-2 text-xs font-medium opacity-75">{t.validity(new Intl.NumberFormat(lang).format(offer.expiryDays))}</p>
    </div>
    <div className="flex flex-1 flex-col p-6">
      <div className="flex min-h-12 flex-wrap items-baseline gap-x-3 gap-y-1" dir="ltr">
        <strong className={`break-words text-3xl font-black tracking-tight ${offer.onSale ? "text-red-600" : "text-[#26143f]"}`}>{price}</strong>
        {offer.onSale && <del className="text-sm font-medium text-slate-500">{money(offer.listPrice)}</del>}
      </div>
      <ul className="mb-7 mt-5 flex-1 space-y-3">{offer.benefits.map((benefit, index) => <li key={`${index}-${benefit}`} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700"><Check size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600" /><span dir="auto">{benefit}</span></li>)}</ul>
      <div className="grid gap-2">
        {primaryHref && !disabled ? <Link href={primaryHref} className={primaryClass} style={{ backgroundColor: "var(--public-accent, var(--brand-purple, #6716A4))" }}>{primaryLabel ?? t.choose}<ArrowUpRight size={16} aria-hidden="true" /></Link> : <button type="button" onClick={onChoose} disabled={disabled} className={primaryClass} style={{ backgroundColor: "var(--public-accent, var(--brand-purple, #6716A4))" }}>{primaryLabel ?? t.choose}<ArrowUpRight size={16} aria-hidden="true" /></button>}
        {contact && <a href={contact} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"><MessageCircle size={17} aria-hidden="true" />{t.whatsapp}</a>}
      </div>
    </div>
  </article>;
}
