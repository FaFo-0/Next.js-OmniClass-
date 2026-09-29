"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { LanguageSelectControl } from "@/components/layout/language-switcher";
import { TenantPublicLogo } from "@/components/public/tenant-logo";
import { parseAttribution, storeAttribution, withAttribution } from "@/lib/attribution";
import {
  buildLandingLanguageHref,
  formatLandingKzt,
  landingTrialHeading,
  landingUnit,
  resolveLandingLocale,
} from "@/lib/publicLandingLocale";

const FALLBACK_NAME = "Omnica English";
const PUBLIC_LANGUAGE_OPTIONS = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
] as const;

const LANDING_COPY = {
  ru: {
    homeLabel: (name: string) => `${name}: главная`,
    languageLabel: "Язык страницы",
    authLabel: "Аккаунт",
    signIn: "Войти",
    getStarted: "Зарегистрироваться",
    eyebrow: "Индивидуальные уроки английского",
    heroLead: "Практикуйте английский",
    heroAccent: "один на один с преподавателем",
    heroBody: "Для тех, кто хочет лучше говорить и понимать английский. Каждый онлайн-урок длится 60 минут и проходит в Google Meet. Преподаватель учитывает вашу цель и даёт материал для повторения после занятия.",
    startLearning: "Создать аккаунт",
    viewPacks: "Выбрать пакет",
    interfaceLine: "Интерфейс на русском. Время занятий указано в вашем часовом поясе.",
    nextLesson: "Следующий урок",
    conversationPractice: "Разговорная практика",
    convenientTime: "Время по вашему поясу",
    realConversation: "60 минут один на один",
    lessonBenefits: [
      "Конспект после урока",
      "Новые слова и карточки",
      "Домашняя работа с проверкой преподавателя",
    ],
    academyEyebrow: "Что входит",
    academyHeading: "Урок и материалы для повторения",
    academyBody: "Вы занимаетесь с преподавателем один на один. После урока можно повторить новые слова, выполнить домашнюю работу и посмотреть конспект.",
    featureCards: [
      ["Уроки под вашу цель", "Преподаватель подбирает темы и практику с учётом вашего уровня и цели."],
      ["Проверка преподавателем", "Преподаватель проверяет домашнюю работу и объясняет, что стоит повторить."],
      ["Понятные условия", "Для каждого пакета указаны цена, количество уроков и срок действия."],
    ],
    flowHeading: "Как проходит обучение",
    flow: [
      ["01", "Выберите время", "Посмотрите свободные часы преподавателя в вашем часовом поясе."],
      ["02", "Подключитесь к уроку", "Занимайтесь с преподавателем в Google Meet 60 минут."],
      ["03", "Откройте материалы", "После урока получите конспект, новые слова и домашнюю работу."],
      ["04", "Повторите пройденное", "Используйте карточки и комментарии преподавателя перед следующим уроком."],
    ],
    pricesEyebrow: "Пакеты уроков",
    pricesHeading: "Выберите пакет уроков",
    pricesBody: "Выберите 4, 8 или 12 индивидуальных уроков. Пакет действует 60 дней после первого занятия.",
    loadingPacks: "Загружаем пакеты уроков",
    noPacks: "Пакеты сейчас не отображаются. Напишите нам, и мы поможем записаться.",
    choosePack: "Выбрать пакет",
    consultationHeading: "Обсудите цель с нами",
    trialBody: (lessonCount: number) => `Создайте аккаунт, и после регистрации мы добавим ${lessonCount === 1 ? "пробный урок" : `${lessonCount} пробных ${landingUnit(lessonCount, "lesson", "ru")}`}.`,
    consultationBody: "Напишите нам, если хотите обсудить уровень, цель или расписание до регистрации.",
    createAccount: "Создать аккаунт",
    questionsHeading: "Нужна помощь?",
    questionsLead: "Напишите, если хотите уточнить уровень, расписание или выбор пакета. Электронная почта:",
    legalLabel: "Юридическая информация",
    privacy: "Политика конфиденциальности",
    terms: "Условия обучения",
  },
  en: {
    homeLabel: (name: string) => `${name} home`,
    languageLabel: "Page language",
    authLabel: "Account",
    signIn: "Sign in",
    getStarted: "Register",
    eyebrow: "One-to-one English lessons",
    heroLead: "Practise English",
    heroAccent: "one-to-one with a tutor",
    heroBody: "For students who want to speak and understand English better. Each online lesson lasts 60 minutes and takes place on Google Meet. Your tutor works with your goal and gives you material to review afterwards.",
    startLearning: "Create an account",
    viewPacks: "Choose a lesson pack",
    interfaceLine: "Use the site in English. Lesson times appear in your time zone.",
    nextLesson: "Next lesson",
    conversationPractice: "Conversation practice",
    convenientTime: "Time shown in your zone",
    realConversation: "60 minutes one-to-one",
    lessonBenefits: [
      "A summary after the lesson",
      "New words and flashcards",
      "Homework checked by your tutor",
    ],
    academyEyebrow: "What you get",
    academyHeading: "A lesson and material to review",
    academyBody: "You work with a tutor one-to-one. After the lesson, you can review new words, complete your homework, and read the lesson summary.",
    featureCards: [
      ["Lessons for your goal", "Your tutor chooses topics and practice for your level and goal."],
      ["Feedback from your tutor", "Your tutor checks your homework and tells you what to review."],
      ["Clear pack details", "Every pack shows its price, lesson count, and validity period."],
    ],
    flowHeading: "How lessons work",
    flow: [
      ["01", "Choose a time", "See your tutor's available hours in your time zone."],
      ["02", "Join the lesson", "Meet your tutor on Google Meet for 60 minutes."],
      ["03", "Open your materials", "Get a summary, new words, and homework after the lesson."],
      ["04", "Review the lesson", "Use flashcards and your tutor's comments before the next lesson."],
    ],
    pricesEyebrow: "Lesson packs",
    pricesHeading: "Choose a lesson pack",
    pricesBody: "Choose 4, 8, or 12 one-to-one lessons. Each pack is valid for 60 days after your first lesson.",
    loadingPacks: "Loading lesson packs",
    noPacks: "Lesson packs are not showing right now. Message us and we will help you book.",
    choosePack: "Choose a pack",
    consultationHeading: "Talk to us about your goal",
    trialBody: (lessonCount: number) => `Create your account, and we will add ${lessonCount === 1 ? "your trial lesson" : `${lessonCount} trial lessons`} after registration.`,
    consultationBody: "Message us if you want to discuss your level, goal, or schedule before registering.",
    createAccount: "Create your account",
    questionsHeading: "Need help?",
    questionsLead: "Ask us about your level, the schedule, or which pack to choose. Email:",
    legalLabel: "Legal information",
    privacy: "Privacy policy",
    terms: "Terms of learning",
  },
} as const;

const FEATURE_ICONS = [BookOpenCheck, MessageCircle, ShieldCheck] as const;

export function LandingPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = resolveLandingLocale(searchParams);
  const copy = LANDING_COPY[locale];
  const attribution = parseAttribution(searchParams);
  const signupHref = withAttribution("/sign-up", attribution);
  const homeHref = buildLandingLanguageHref(locale, searchParams);
  const catalogue = useQuery(api.billing.getPublicCatalogue, { locale });
  const launchInfo = useQuery(api.tenantSettings.getPublicLaunchInfo);
  const name = launchInfo?.name ?? FALLBACK_NAME;
  const primary = launchInfo?.primaryColor ?? "#6716A4";
  const canvas = launchInfo?.backgroundColor ?? "#FFCA00";
  const supportEmail = launchInfo?.supportEmail ?? "hello@omnica.app";
  const whatsappHref = "https://wa.me/message/7M72VAH5Z4Z4C1";

  useEffect(() => {
    storeAttribution(attribution);
  }, [attribution]);

  useEffect(() => {
    const previousLanguage = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      if (document.documentElement.lang === locale) {
        document.documentElement.lang = previousLanguage;
      }
    };
  }, [locale]);

  return (
    <main className="min-h-screen overflow-x-clip bg-[#fffaf0] text-zinc-950" lang={locale}>
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#fffaf0]/95 backdrop-blur">
        <div className="mx-auto grid min-h-16 max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 sm:flex sm:gap-3 sm:px-6">
          <Link href={homeHref} className="flex min-w-0 items-center gap-2.5 font-extrabold tracking-tight" aria-label={copy.homeLabel(name)}>
            <TenantPublicLogo logoUrl={launchInfo?.logoUrl} name={name} size={36} className="rounded-lg" />
            <span className="truncate text-base sm:text-lg">{name}</span>
          </Link>
          <LanguageSelectControl
            value={locale}
            onChange={(nextLocale) => router.push(buildLandingLanguageHref(nextLocale, searchParams))}
            options={PUBLIC_LANGUAGE_OPTIONS}
            ariaLabel={copy.languageLabel}
          />
          <nav className="col-span-2 flex w-full shrink-0 items-center justify-end gap-2 border-t border-black/5 py-2 sm:ms-auto sm:w-auto sm:border-0 sm:py-0" aria-label={copy.authLabel}>
            <Link href="/sign-in" className="rounded-full px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-black/5 sm:px-4">
              {copy.signIn}
            </Link>
            <Link href={signupHref} className="rounded-full px-4 py-2 text-sm font-bold text-white shadow-sm" style={{ backgroundColor: primary }}>
              {copy.getStarted}
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative isolate overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20">
        <div className="absolute inset-x-0 top-0 -z-10 h-80 opacity-30" style={{ background: `radial-gradient(circle at 20% 20%, ${canvas} 0, transparent 58%)` }} />
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white px-3 py-1.5 text-xs font-bold text-purple-900 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" /> {copy.eyebrow}
            </div>
            <h1 className="max-w-3xl text-balance text-4xl font-black leading-[1.05] tracking-[-0.04em] sm:text-6xl">
              {copy.heroLead} <span style={{ color: primary }}>{copy.heroAccent}</span>
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-zinc-600 sm:text-xl">
              {copy.heroBody}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={signupHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 font-bold text-white shadow-lg" style={{ backgroundColor: primary }}>
                {copy.startLearning} <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#prices" className="inline-flex min-h-12 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 font-bold text-zinc-800">
                {copy.viewPacks}
              </a>
            </div>
            <p className="mt-4 text-sm text-zinc-500">{copy.interfaceLine}</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-[0_24px_70px_rgba(103,22,164,0.14)] sm:p-7">
            <div className="rounded-3xl p-5 text-white" style={{ backgroundColor: primary }}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white/70">{copy.nextLesson}</p>
                  <p className="mt-1 text-2xl font-black">{copy.conversationPractice}</p>
                </div>
                <CirclePlay className="h-12 w-12" aria-hidden="true" />
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/10 p-3"><CalendarDays className="mb-2 h-5 w-5" />{copy.convenientTime}</div>
                <div className="rounded-2xl bg-white/10 p-3"><Headphones className="mb-2 h-5 w-5" />{copy.realConversation}</div>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {copy.lessonBenefits.map((item) => (
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
            <p className="text-sm font-black uppercase tracking-[0.18em]" style={{ color: primary }}>{copy.academyEyebrow}</p>
            <h2 id="academy-heading" className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{copy.academyHeading}</h2>
            <p className="mt-5 text-lg leading-8 text-zinc-600">{copy.academyBody}</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {copy.featureCards.map(([title, body], index) => {
              const CardIcon = FEATURE_ICONS[index];
              return <article key={title} className="rounded-3xl border border-zinc-200 bg-[#fffaf0] p-6"><CardIcon className="h-7 w-7" style={{ color: primary }} /><h3 className="mt-5 text-xl font-black">{title}</h3><p className="mt-2 leading-7 text-zinc-600">{body}</p></article>;
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24" aria-labelledby="flow-heading">
        <div className="mx-auto max-w-6xl">
          <h2 id="flow-heading" className="text-3xl font-black tracking-tight sm:text-5xl">{copy.flowHeading}</h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {copy.flow.map(([number, title, body]) => <article key={number} className="rounded-3xl bg-white p-6 shadow-sm"><span className="text-sm font-black" style={{ color: primary }}>{number}</span><h3 className="mt-8 text-xl font-black">{title}</h3><p className="mt-2 leading-7 text-zinc-600">{body}</p></article>)}
          </div>
        </div>
      </section>

      <section id="prices" className="bg-zinc-950 px-4 py-16 text-white sm:px-6 sm:py-24" aria-labelledby="prices-heading">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-yellow-300">{copy.pricesEyebrow}</p>
            <h2 id="prices-heading" className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{copy.pricesHeading}</h2>
            <p className="mt-5 text-lg leading-8 text-zinc-300">{copy.pricesBody}</p>
          </div>
          {catalogue === undefined ? (
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label={copy.loadingPacks}>{[1, 2, 3].map((item) => <div key={item} className="h-72 animate-pulse rounded-3xl bg-white/10" />)}</div>
          ) : catalogue.length === 0 ? (
            <div className="mt-10 rounded-3xl border border-white/15 bg-white/5 p-6 text-zinc-200">{copy.noPacks}</div>
          ) : (
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {catalogue.map((offer) => (
                <article key={`${offer.family}-${offer.packName}`} className="flex min-w-0 flex-col rounded-3xl bg-white p-6 text-zinc-950">
                  <p className="text-sm font-bold" style={{ color: primary }}>{offer.family}</p>
                  <h3 className="mt-2 text-2xl font-black">{offer.packName}</h3>
                  <p className="mt-5 text-3xl font-black tracking-tight">{formatLandingKzt(offer.priceKzt, locale)}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {locale === "ru"
                    ? `${offer.lessonCount} ${landingUnit(offer.lessonCount, "lesson", locale)}. Действует ${offer.expiryDays} ${landingUnit(offer.expiryDays, "day", locale)} после первого урока.`
                    : `${offer.lessonCount} ${landingUnit(offer.lessonCount, "lesson", locale)}. Valid for ${offer.expiryDays} ${landingUnit(offer.expiryDays, "day", locale)} after your first lesson.`}
                  </p>
                  <ul className="mt-6 flex-1 space-y-3 text-sm text-zinc-700">
                    {offer.benefits.map((benefit) => <li key={benefit} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> <span>{benefit}</span></li>)}
                  </ul>
                  <Link href={signupHref} className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full px-5 font-bold text-white" style={{ backgroundColor: primary }}>{copy.choosePack}</Link>
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
            <h2 className="mt-5 text-2xl font-black">{launchInfo?.trial.enabled ? landingTrialHeading(launchInfo.trial.lessonCount, locale) : copy.consultationHeading}</h2>
            <p className="mt-3 leading-7 text-white/80">{launchInfo?.trial.enabled ? copy.trialBody(launchInfo.trial.lessonCount) : copy.consultationBody}</p>
            <Link href={signupHref} className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 font-bold" style={{ color: primary }}>{copy.createAccount}</Link>
          </article>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-[2rem] p-7 sm:p-10 lg:flex-row lg:items-center" style={{ backgroundColor: canvas }}>
          <div className="max-w-2xl"><h2 className="text-3xl font-black tracking-tight sm:text-4xl">{copy.questionsHeading}</h2><p className="mt-3 text-lg text-zinc-800">{copy.questionsLead} <a className="font-bold underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p></div>
          <a href={whatsappHref} target="_blank" rel="noreferrer" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-center font-bold text-white sm:w-auto" style={{ backgroundColor: primary }} aria-label="Message Omnica English on WhatsApp"><MessageCircle className="h-5 w-5 shrink-0" /> Message Omnica English on WhatsApp</a>
        </div>
      </section>

      <footer className="border-t border-zinc-200 bg-white px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-bold text-zinc-900"><TenantPublicLogo logoUrl={launchInfo?.logoUrl} name={name} size={28} className="rounded-md" /> {name}</div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label={copy.legalLabel}><Link href="/privacy" className="hover:text-zinc-950">{copy.privacy}</Link><Link href="/terms" className="hover:text-zinc-950">{copy.terms}</Link><Link href="/sign-in" className="hover:text-zinc-950">{copy.signIn}</Link></nav>
        </div>
      </footer>
    </main>
  );
}
