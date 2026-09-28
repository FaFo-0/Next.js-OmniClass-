"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  CirclePlay,
  Headphones,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "@convex";
import { TenantPublicLogo } from "@/components/public/tenant-logo";
import { parseAttribution, storeAttribution, withAttribution } from "@/lib/attribution";

const FALLBACK_NAME = "Omnica English";

function formatKzt(value: number) {
  return new Intl.NumberFormat("en-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 0,
  }).format(value);
}

function pluralize(value: number, singular: string) {
  return value === 1 ? singular : `${singular}s`;
}

export function LandingPageClient() {
  const searchParams = useSearchParams();
  const attribution = useMemo(() => parseAttribution(searchParams), [searchParams]);
  const signupHref = withAttribution("/sign-up", attribution);
  const catalogue = useQuery(api.billing.getPublicCatalogue, { locale: "en" });
  const launchInfo = useQuery(api.tenantSettings.getPublicLaunchInfo);
  const name = launchInfo?.name ?? FALLBACK_NAME;
  const primary = launchInfo?.primaryColor ?? "#6716A4";
  const canvas = launchInfo?.backgroundColor ?? "#FFCA00";
  const supportEmail = launchInfo?.supportEmail ?? "hello@omnica.app";
  const whatsappHref = "https://wa.me/message/7M72VAH5Z4Z4C1";

  useEffect(() => {
    storeAttribution(attribution);
  }, [attribution]);

  return (
    <main className="min-h-screen overflow-x-clip bg-[#fffaf0] text-zinc-950" lang="en">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#fffaf0]/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 font-extrabold tracking-tight" aria-label={`${name} home`}>
            <TenantPublicLogo logoUrl={launchInfo?.logoUrl} name={name} size={36} className="rounded-lg" />
            <span className="truncate text-base sm:text-lg">{name}</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-2" aria-label="Sign in and sign up">
            <Link href="/sign-in" className="rounded-full px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-black/5 sm:px-4">
              Sign in
            </Link>
            <Link href={signupHref} className="rounded-full px-4 py-2 text-sm font-bold text-white shadow-sm" style={{ backgroundColor: primary }}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative isolate overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20">
        <div className="absolute inset-x-0 top-0 -z-10 h-80 opacity-30" style={{ background: `radial-gradient(circle at 20% 20%, ${canvas} 0, transparent 58%)` }} />
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white px-3 py-1.5 text-xs font-bold text-purple-900 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" /> Personal English lessons online
            </div>
            <h1 className="max-w-3xl text-balance text-4xl font-black leading-[1.05] tracking-[-0.04em] sm:text-6xl">
              Speak English with more confidence — <span style={{ color: primary }}>in every lesson</span>
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-zinc-600 sm:text-xl">
              One-to-one lessons on Google Meet, a tutor who understands your goals, and one clear place for your schedule, homework, and progress.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={signupHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 font-bold text-white shadow-lg" style={{ backgroundColor: primary }}>
                Start learning <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#prices" className="inline-flex min-h-12 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 font-bold text-zinc-800">
                View lesson packs
              </a>
            </div>
            <p className="mt-4 text-sm text-zinc-500">English interface · your time zone · one-to-one lessons</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-[0_24px_70px_rgba(103,22,164,0.14)] sm:p-7">
            <div className="rounded-3xl p-5 text-white" style={{ backgroundColor: primary }}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white/70">Your next lesson</p>
                  <p className="mt-1 text-2xl font-black">Conversation practice</p>
                </div>
                <CirclePlay className="h-12 w-12" aria-hidden="true" />
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/10 p-3"><CalendarDays className="mb-2 h-5 w-5" />At a time that suits you</div>
                <div className="rounded-2xl bg-white/10 p-3"><Headphones className="mb-2 h-5 w-5" />Real conversation</div>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {["A concise summary after each lesson", "Vocabulary and flashcards from your conversations", "Homework with tutor feedback"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-4 w-4" /></span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 sm:py-24" aria-labelledby="academy-heading">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.18em]" style={{ color: primary }}>More than a video call</p>
            <h2 id="academy-heading" className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">An academy where learning continues after the call</h2>
            <p className="mt-5 text-lg leading-8 text-zinc-600">Learn to speak with confidence. Your tutor leads the lesson while the platform keeps your schedule, materials, and next steps in one place.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              [BookOpenCheck, "A plan built around your goal", "A personal path to confident spoken English, with every learning feature available to every student."],
              [MessageCircle, "Tutor feedback", "Your tutor reviews your materials and homework instead of leaving you with an automated response."],
              [ShieldCheck, "Clear terms", "You can see the lesson count, pack validity, and scheduling rules before you begin."],
            ].map(([Icon, title, body]) => {
              const CardIcon = Icon as typeof BookOpenCheck;
              return <article key={String(title)} className="rounded-3xl border border-zinc-200 bg-[#fffaf0] p-6"><CardIcon className="h-7 w-7" style={{ color: primary }} /><h3 className="mt-5 text-xl font-black">{String(title)}</h3><p className="mt-2 leading-7 text-zinc-600">{String(body)}</p></article>;
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24" aria-labelledby="flow-heading">
        <div className="mx-auto max-w-6xl">
          <h2 id="flow-heading" className="text-3xl font-black tracking-tight sm:text-5xl">How learning works</h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {[
              ["01", "Choose a time", "See your tutor's available hours in your own time zone."],
              ["02", "Meet on Google Meet", "Spend 60 minutes practising one-to-one at your level and toward your goals."],
              ["03", "Receive your materials", "Your recording and transcript help create a summary, vocabulary, and practice activities."],
              ["04", "Keep improving", "Flashcards, homework, and tutor feedback prepare you for the next lesson."],
            ].map(([number, title, body]) => <article key={number} className="rounded-3xl bg-white p-6 shadow-sm"><span className="text-sm font-black" style={{ color: primary }}>{number}</span><h3 className="mt-8 text-xl font-black">{title}</h3><p className="mt-2 leading-7 text-zinc-600">{body}</p></article>)}
          </div>
        </div>
      </section>

      <section id="prices" className="bg-zinc-950 px-4 py-16 text-white sm:px-6 sm:py-24" aria-labelledby="prices-heading">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-yellow-300">Current prices</p>
            <h2 id="prices-heading" className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Choose your learning pace</h2>
            <p className="mt-5 text-lg leading-8 text-zinc-300">Prices come directly from the academy&apos;s published catalogue—the same lesson packs you will see in your account.</p>
          </div>
          {catalogue === undefined ? (
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Loading lesson packs">{[1, 2, 3].map((item) => <div key={item} className="h-72 animate-pulse rounded-3xl bg-white/10" />)}</div>
          ) : catalogue.length === 0 ? (
            <div className="mt-10 rounded-3xl border border-white/15 bg-white/5 p-6 text-zinc-200">Published lesson packs are temporarily unavailable. Message us for the current options.</div>
          ) : (
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {catalogue.map((offer) => (
                <article key={`${offer.family}-${offer.packName}`} className="flex min-w-0 flex-col rounded-3xl bg-white p-6 text-zinc-950">
                  <p className="text-sm font-bold" style={{ color: primary }}>{offer.family}</p>
                  <h3 className="mt-2 text-2xl font-black">{offer.packName}</h3>
                  <p className="mt-5 text-3xl font-black tracking-tight">{formatKzt(offer.priceKzt)}</p>
                  <p className="mt-1 text-sm text-zinc-500">{offer.lessonCount} {pluralize(offer.lessonCount, "lesson")} · valid for {offer.expiryDays} {pluralize(offer.expiryDays, "day")} from first use</p>
                  <ul className="mt-6 flex-1 space-y-3 text-sm text-zinc-700">
                    {offer.benefits.map((benefit) => <li key={benefit} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> <span>{benefit}</span></li>)}
                  </ul>
                  <Link href={signupHref} className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full px-5 font-bold text-white" style={{ backgroundColor: primary }}>Choose this pack</Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <article className="max-w-2xl rounded-3xl p-6 text-white sm:p-8" style={{ backgroundColor: primary }}>
            <Sparkles className="h-8 w-8" />
            <h2 className="mt-5 text-2xl font-black">{launchInfo?.trial.enabled ? `${launchInfo.trial.lessonCount} trial ${pluralize(launchInfo.trial.lessonCount, "lesson")}` : "Start with a consultation"}</h2>
            <p className="mt-3 leading-7 text-white/80">{launchInfo?.trial.enabled ? "Your trial lesson balance is added after you complete registration. It is not a subscription or a lesson-pack purchase." : "Tell us about your goals and we will help you choose the right format."}</p>
            <Link href={signupHref} className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 font-bold" style={{ color: primary }}>Create an account</Link>
          </article>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-[2rem] p-7 sm:p-10 lg:flex-row lg:items-center" style={{ backgroundColor: canvas }}>
          <div className="max-w-2xl"><h2 className="text-3xl font-black tracking-tight sm:text-4xl">Have questions?</h2><p className="mt-3 text-lg text-zinc-800">Tell us about your level, goals, or schedule. Email the academy at <a className="font-bold underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p></div>
          <a href={whatsappHref} target="_blank" rel="noreferrer" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-center font-bold text-white sm:w-auto" style={{ backgroundColor: primary }} aria-label="Message Omnica English on WhatsApp"><MessageCircle className="h-5 w-5 shrink-0" /> Message Omnica English on WhatsApp</a>
        </div>
      </section>

      <footer className="border-t border-zinc-200 bg-white px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-bold text-zinc-900"><TenantPublicLogo logoUrl={launchInfo?.logoUrl} name={name} size={28} className="rounded-md" /> {name}</div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Legal information"><Link href="/privacy" className="hover:text-zinc-950">Privacy</Link><Link href="/terms" className="hover:text-zinc-950">Terms of learning</Link><Link href="/sign-in" className="hover:text-zinc-950">Sign in</Link></nav>
        </div>
      </footer>
    </main>
  );
}
