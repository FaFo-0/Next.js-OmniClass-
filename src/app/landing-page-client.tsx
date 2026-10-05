"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { ArrowDown, ArrowRight, BookOpen, Check, MessageCircle, Mic2, Sparkles } from "lucide-react";
import { api } from "@convex";
import { LanguageSelectControl } from "@/components/layout/language-switcher";
import { TenantPublicLogo } from "@/components/public/tenant-logo";
import { parseAttribution, storeAttribution, withAttribution } from "@/lib/attribution";
import { LANDING_COPY, PUBLIC_LANGUAGE_OPTIONS } from "@/lib/publicLandingCopy";
import { buildLandingLanguageHref, buildPublicHref, formatLandingPrice, landingPackDetails, landingTrialHeading, resolveLandingLocale } from "@/lib/publicLandingLocale";

const WHATSAPP = "https://wa.me/message/7M72VAH5Z4Z4C1";

export function LandingPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = resolveLandingLocale(searchParams);
  const copy = LANDING_COPY[locale];
  const attribution = parseAttribution(searchParams);
  const signupHref = withAttribution("/sign-up", attribution);
  const catalogue = useQuery(api.pricing.getPublicCatalogue, { locale });
  const launchInfo = useQuery(api.tenantSettings.getPublicLaunchInfo);
  const name = launchInfo?.name ?? "Omnica English";
  const primary = launchInfo?.primaryColor ?? "#6716A4";
  const supportEmail = launchInfo?.supportEmail ?? "hello@omnica.app";
  const homeHref = buildLandingLanguageHref(locale, searchParams);

  useEffect(() => { storeAttribution(attribution); }, [attribution]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${copy.heroA} ${copy.heroB} — ${name}`;
  }, [locale, copy.heroA, copy.heroB, name]);

  return (
    <main id="top" lang={locale} data-public-landing className="min-h-screen overflow-x-clip bg-[#faf7ef] text-[#191327]" style={{ "--public-accent": primary } as React.CSSProperties}>
      <header className="sticky top-0 z-40 border-b border-[#26153b]/10 bg-[#faf7ef]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <Link href={homeHref} className="flex min-w-0 shrink-0 items-center rounded-lg font-black tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-600" aria-label={copy.home}>
            <TenantPublicLogo logoUrl={launchInfo?.logoUrl} name={name} size={48} className="h-10! w-auto! rounded-lg sm:h-12!" />
          </Link>
          <div className="ms-auto flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
            <div className="sm:order-2"><LanguageSelectControl value={locale} onChange={(nextLocale) => router.push(buildLandingLanguageHref(nextLocale, searchParams))} options={PUBLIC_LANGUAGE_OPTIONS} ariaLabel={copy.language} /></div>
            <nav className="flex items-center justify-end gap-2" aria-label={copy.register}>
              <Link href="/sign-in" className="rounded-full px-2 py-1 text-sm font-semibold hover:bg-[#281640]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 sm:px-3 sm:py-2">{copy.signIn}</Link>
              <Link href={signupHref} className="hidden rounded-full bg-[#26143f] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#4b2774] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 sm:inline-flex">{copy.register}</Link>
            </nav>
          </div>
        </div>
      </header>

      <section className="relative isolate px-4 pb-12 pt-6 sm:px-8 sm:pt-12 lg:pb-28" aria-labelledby="hero-heading">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full bg-[radial-gradient(ellipse_at_85%_20%,#f5db8e_0%,transparent_50%)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-8 sm:gap-12 lg:grid-cols-[1.08fr_.92fr] lg:gap-16">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#26143f]/15 bg-white/70 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[.12em] text-[#532879]"><span className="h-2 w-2 rounded-full bg-[#eab500]" />{copy.eyebrow}</p>
            <h1 id="hero-heading" className="max-w-[13ch] text-[clamp(2.25rem,11vw,2.75rem)] sm:text-[clamp(2.75rem,8vw,6.5rem)] font-black leading-[1.08] tracking-[-.04em] sm:leading-[.98] sm:tracking-[-.065em]">{copy.heroA}<br /><span style={{ color: primary }}>{copy.heroB}</span></h1>
            <p className="mt-5 max-w-xl text-base leading-[1.7] sm:mt-7 text-[#4c4558] sm:text-xl">{copy.hero}</p>
            <div className="mt-6 flex flex-col items-stretch gap-2 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <Link href={signupHref} className="inline-flex min-h-13 items-center justify-center gap-3 rounded-full bg-[#26143f] px-7 py-3 font-bold text-white shadow-[0_10px_30px_#26143f33] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-purple-600">{copy.start}<ArrowRight size={18} aria-hidden="true" /></Link>
              <a href="#how" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-3 font-bold text-[#38204e] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600">{copy.explore}<ArrowDown size={17} aria-hidden="true" /></a>
            </div>
            <p className="mt-7 border-s-2 border-[#e7bd36] ps-4 text-sm font-semibold text-[#645c66]">{copy.note}</p>
          </div>
          <div role="img" aria-label={copy.illustration} className="relative mx-auto w-full max-w-[540px] rotate-[-1deg] rounded-[2rem] border border-[#26143f]/10 bg-[#26143f] p-4 text-white shadow-[18px_22px_0_#e9ce80] sm:p-7">
            <p className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[#e7d8f7]"><span className="h-2 w-2 rounded-full bg-[#ffca00]" />{copy.lesson}</p>
            <div className="rounded-[1.5rem] bg-[#462572] p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#ffca00] text-[#26143f]"><Mic2 size={23} /></span><span className="text-sm font-semibold">{copy.live}</span></div><div aria-hidden="true" className="mt-8 flex h-16 items-end gap-1.5">{[26, 46, 34, 58, 39, 64, 29, 53, 40, 61, 35, 48, 27, 59, 33, 43, 25, 49, 30, 57, 35, 45].map((height, i) => <span key={i} className="min-w-0 flex-1 rounded-full bg-[#ffca00]" style={{ height: `${height}px`, opacity: i % 3 ? .8 : 1 }} />)}</div></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-white p-4 text-[#26143f]"><p className="text-xs font-bold uppercase tracking-wider text-[#705988]">{copy.review}</p><p className="mt-2 text-lg font-black">{copy.word}</p><p className="mt-1 text-sm">{copy.wordExample}</p></div><div className="rounded-2xl bg-[#ffca00] p-4 text-[#26143f]"><p className="text-xs font-bold uppercase tracking-wider">{copy.card}</p><p className="mt-2 text-lg font-black">{copy.cardFront}</p><p className="mt-1 text-sm">{copy.cardBack}</p></div></div>
            <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-[#e7d8f7]"><Check size={16} className="shrink-0" />{copy.teacher}</p>
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-24 bg-white px-4 py-12 sm:px-8 sm:py-28" aria-labelledby="pillars-heading">
        <div className="mx-auto max-w-7xl"><p className="text-xs font-black uppercase tracking-[.18em] text-[#6b329a]">{copy.pillarsEyebrow}</p><h2 id="pillars-heading" className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-[-.04em] sm:text-6xl">{copy.pillarsTitle}</h2><p className="mt-5 max-w-2xl text-lg leading-8 text-[#57505f]">{copy.pillarsIntro}</p>
          <div className="mt-8 grid sm:mt-12 gap-px overflow-hidden rounded-[1.75rem] border border-[#ddd5e3] bg-[#ddd5e3] md:grid-cols-2">{copy.features.map(([title, body], index) => <article key={title} className={`min-w-0 p-6 sm:p-9 ${index === 1 ? "bg-[#f6ecda]" : index === 2 ? "bg-[#f1ecf6]" : "bg-[#faf9f6]"}`}><span className="text-sm font-black text-[#6b329a]">{title.split(" / ")[0]}</span><h3 className="mt-6 text-2xl font-black tracking-tight">{title.split(" / ")[1]}</h3><p className="mt-3 max-w-md leading-7 text-[#57505f]">{body}</p></article>)}</div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-8 sm:py-28" aria-labelledby="reading-heading"><div className="mx-auto grid max-w-7xl items-center gap-8 sm:gap-12 lg:grid-cols-2 lg:gap-20"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#6b329a]">{copy.readingLabel}</p><h2 id="reading-heading" className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-6xl">{copy.readingTitle}</h2><p className="mt-6 max-w-lg text-lg leading-8 text-[#57505f]">{copy.readingText}</p></div><div role="img" aria-label={copy.illustration} className="rounded-[1.75rem] border border-[#d5c8dd] bg-white p-5 shadow-[12px_12px_0_#ddd2ed] sm:p-9"><div className="flex items-center justify-between gap-3 border-b border-[#ddd5e3] pb-5"><div className="flex items-center gap-3 font-bold text-[#3d2459]"><BookOpen size={21} />{copy.readingSample}</div><span className="rounded-full bg-[#f2e9fb] px-3 py-1 text-xs font-bold text-[#5b2b85]">A2</span></div><p lang="en" className="mt-9 font-serif text-3xl leading-snug tracking-tight sm:text-4xl">Every small <mark className="rounded bg-[#ffdf70] px-1 text-inherit">step</mark> helps you grow.</p><p className="mt-8 border-s-4 border-[#ffca00] ps-4 text-sm leading-6 text-[#57505f]">{copy.readingHint}</p></div></div></section>

      <section className="bg-[#26143f] px-4 py-12 text-white sm:px-8 sm:py-28" aria-labelledby="teacher-heading"><div className="mx-auto grid max-w-7xl gap-9 lg:grid-cols-[.55fr_1fr]"><div className="grid h-24 w-24 place-items-center rounded-[2rem] bg-[#ffca00] text-5xl text-[#26143f]" aria-hidden="true">“</div><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#ffdb6c]">{copy.teacherEyebrow}</p><h2 id="teacher-heading" className="mt-4 max-w-3xl text-4xl font-black tracking-[-.04em] sm:text-6xl">{copy.teacherTitle}</h2><p className="mt-6 max-w-2xl text-lg leading-8 text-[#e2d9e9]">{copy.teacherText}</p></div></div></section>

      <section className="px-4 py-12 sm:px-8 sm:py-28" aria-labelledby="process-heading"><div className="mx-auto max-w-7xl"><p className="text-xs font-black uppercase tracking-[.18em] text-[#6b329a]">{copy.processEyebrow}</p><h2 id="process-heading" className="mt-4 max-w-3xl text-4xl font-black tracking-[-.04em] sm:text-5xl">{copy.processTitle}</h2><ol className="mt-8 grid sm:mt-12 gap-7 md:grid-cols-3">{copy.process.map((step, i) => <li key={step} className="border-t-2 border-[#583481] pt-5"><span className="text-3xl font-black text-[#6b329a]">0{i + 1}</span><p className="mt-5 max-w-xs text-lg font-semibold leading-7">{step}</p></li>)}</ol></div></section>

      <section id="prices" className="scroll-mt-24 bg-white px-4 py-12 sm:px-8 sm:py-28" aria-labelledby="prices-heading"><div className="mx-auto max-w-7xl"><p className="text-xs font-black uppercase tracking-[.18em] text-[#6b329a]">{copy.pricesEyebrow}</p><h2 id="prices-heading" className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-6xl">{copy.pricesTitle}</h2><p className="mt-5 max-w-2xl text-lg leading-8 text-[#57505f]">{copy.pricesText}</p>
        {catalogue === undefined ? <p role="status" className="mt-10 animate-pulse">{copy.loading}</p> : catalogue.length === 0 ? <p className="mt-10 rounded-2xl bg-[#faf7ef] p-6">{copy.empty}</p> : catalogue.map((group) => <div key={group.familyId} className="mt-10 sm:mt-14"><h3 className="text-2xl font-black">{group.label}</h3>{group.description && <p className="mt-2 text-[#57505f]">{group.description}</p>}<div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{group.packs.map((offer, index) => <article key={offer.packId} className={`flex min-w-0 flex-col rounded-[1.5rem] border p-6 sm:p-7 ${index === 1 ? "border-[#66318f] bg-[#f7f0ff]" : "border-[#ded5e4] bg-[#faf9f6]"}`}><p className="text-xs font-black uppercase tracking-[.14em] text-[#6b329a]">{group.label}</p><h4 className="mt-3 break-words text-2xl font-black">{offer.name}</h4><div className="mt-7 flex flex-wrap items-baseline gap-2"><strong dir="ltr" className="text-3xl tracking-tight">{formatLandingPrice(offer.netPrice, offer.currency, locale)}</strong>{offer.onSale && <del dir="ltr" className="text-[#776c80]">{formatLandingPrice(offer.listPrice, offer.currency, locale)}</del>}</div><p className="mt-2 text-sm font-semibold text-[#4d4357]">{landingPackDetails(offer.lessons, offer.expiryDays, locale)}</p><ul className="mt-6 flex-1 space-y-3">{offer.benefits.map((benefit, i) => <li key={`${i}-${benefit}`} className="flex gap-2 text-sm leading-6"><Check size={17} className="mt-1 shrink-0 text-[#63318c]" aria-hidden="true" /><span>{benefit}</span></li>)}</ul><Link href={signupHref} className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-[#26143f] px-5 py-2 font-bold text-white hover:bg-[#4b2774] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600">{copy.choose}</Link></article>)}</div></div>)}
      </div></section>

      <section className="px-4 py-12 sm:px-8 sm:py-28" aria-labelledby="final-heading"><div className="mx-auto grid max-w-7xl gap-8 rounded-[2rem] bg-[#ffca00] p-7 sm:p-12 lg:grid-cols-[1fr_auto] lg:items-end"><div><Sparkles className="mb-5 text-[#462572]" size={30} aria-hidden="true" /><h2 id="final-heading" className="max-w-2xl text-4xl font-black tracking-[-.04em] sm:text-5xl">{copy.finalTitle}</h2><p className="mt-5 max-w-xl text-lg leading-8">{copy.finalText}</p>{launchInfo?.trial.enabled && <p className="mt-4 max-w-xl text-sm font-semibold"><span className="font-black">{landingTrialHeading(launchInfo.trial.lessonCount, locale)}.</span> {copy.trialBody(launchInfo.trial.lessonCount)}</p>}</div><div className="flex flex-col gap-3"><Link href={signupHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#26143f] px-6 text-center font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600">{copy.start}<ArrowRight size={18} aria-hidden="true" /></Link><a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-[#26143f] px-6 text-center font-bold text-[#26143f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600" aria-label={copy.whatsapp}><MessageCircle size={18} className="shrink-0" aria-hidden="true" />{copy.whatsapp}</a></div></div></section>

      <footer className="border-t border-[#26143f]/15 bg-white px-4 py-10 sm:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-7 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3 font-black"><TenantPublicLogo logoUrl={launchInfo?.logoUrl} name={name} size={34} className="rounded-lg" /></div><nav className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold" aria-label={copy.legal}><Link href={buildPublicHref("/privacy", locale, searchParams)} className="hover:underline">{copy.privacy}</Link><Link href={buildPublicHref("/terms", locale, searchParams)} className="hover:underline">{copy.terms}</Link><a href={`mailto:${supportEmail}`} className="break-all hover:underline">{copy.email}: {supportEmail}</a><a href="#top" className="hover:underline">{copy.back}</a></nav></div></footer>
    </main>
  );
}
