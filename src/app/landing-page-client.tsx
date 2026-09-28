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
  return new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 0,
  }).format(value);
}

export function LandingPageClient() {
  const searchParams = useSearchParams();
  const attribution = useMemo(() => parseAttribution(searchParams), [searchParams]);
  const signupHref = withAttribution("/sign-up", attribution);
  const catalogue = useQuery(api.billing.getPublicCatalogue, { locale: "ru" });
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
    <main className="min-h-screen overflow-x-clip bg-[#fffaf0] text-zinc-950" lang="ru">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#fffaf0]/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 font-extrabold tracking-tight" aria-label={`${name} — главная`}>
            <TenantPublicLogo logoUrl={launchInfo?.logoUrl} name={name} size={36} className="rounded-lg" />
            <span className="truncate text-base sm:text-lg">{name}</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-2" aria-label="Вход и регистрация">
            <Link href="/sign-in" className="rounded-full px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-black/5 sm:px-4">
              Войти
            </Link>
            <Link href={signupHref} className="rounded-full px-4 py-2 text-sm font-bold text-white shadow-sm" style={{ backgroundColor: primary }}>
              Начать
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative isolate overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20">
        <div className="absolute inset-x-0 top-0 -z-10 h-80 opacity-30" style={{ background: `radial-gradient(circle at 20% 20%, ${canvas} 0, transparent 58%)` }} />
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white px-3 py-1.5 text-xs font-bold text-purple-900 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" /> Персональные уроки английского онлайн
            </div>
            <h1 className="max-w-3xl text-balance text-4xl font-black leading-[1.05] tracking-[-0.04em] sm:text-6xl">
              Говорите по-английски увереннее — <span style={{ color: primary }}>на каждом уроке</span>
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-zinc-600 sm:text-xl">
              Индивидуальные занятия в Google Meet, преподаватель, который знает вашу цель, и понятный кабинет с расписанием, домашними заданиями и прогрессом.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={signupHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 font-bold text-white shadow-lg" style={{ backgroundColor: primary }}>
                Начать обучение <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#prices" className="inline-flex min-h-12 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 font-bold text-zinc-800">
                Посмотреть пакеты
              </a>
            </div>
            <p className="mt-4 text-sm text-zinc-500">Русский интерфейс · ваш часовой пояс · 1-на-1</p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-[0_24px_70px_rgba(103,22,164,0.14)] sm:p-7">
            <div className="rounded-3xl p-5 text-white" style={{ backgroundColor: primary }}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white/70">Ваш следующий урок</p>
                  <p className="mt-1 text-2xl font-black">Разговорная практика</p>
                </div>
                <CirclePlay className="h-12 w-12" aria-hidden="true" />
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/10 p-3"><CalendarDays className="mb-2 h-5 w-5" />В удобное время</div>
                <div className="rounded-2xl bg-white/10 p-3"><Headphones className="mb-2 h-5 w-5" />Живая речь</div>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {["Краткий конспект после урока", "Слова и карточки из вашей речи", "Домашнее задание с обратной связью"].map((item) => (
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
            <p className="text-sm font-black uppercase tracking-[0.18em]" style={{ color: primary }}>Не просто видеозвонок</p>
            <h2 id="academy-heading" className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Академия, где урок продолжается после звонка</h2>
            <p className="mt-5 text-lg leading-8 text-zinc-600">{launchInfo?.tagline ?? "Учитесь говорить уверенно."} Преподаватель проводит урок, а платформа сохраняет расписание, материалы и следующий понятный шаг.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              [BookOpenCheck, "План под вашу цель", "Индивидуальная программа для уверенного разговорного английского — без закрытых функций и искусственных уровней доступа."],
              [MessageCircle, "Обратная связь", "Преподаватель проверяет материалы и домашнюю работу, а не оставляет вас с автоматическим ответом."],
              [ShieldCheck, "Прозрачные правила", "Количество уроков, срок пакета и правила расписания видны заранее."],
            ].map(([Icon, title, body]) => {
              const CardIcon = Icon as typeof BookOpenCheck;
              return <article key={String(title)} className="rounded-3xl border border-zinc-200 bg-[#fffaf0] p-6"><CardIcon className="h-7 w-7" style={{ color: primary }} /><h3 className="mt-5 text-xl font-black">{String(title)}</h3><p className="mt-2 leading-7 text-zinc-600">{String(body)}</p></article>;
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24" aria-labelledby="flow-heading">
        <div className="mx-auto max-w-6xl">
          <h2 id="flow-heading" className="text-3xl font-black tracking-tight sm:text-5xl">Как проходит обучение</h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {[
              ["01", "Вы выбираете время", "Свободные часы преподавателя видны в вашем часовом поясе."],
              ["02", "Встречаетесь в Meet", "60 минут индивидуальной практики с учётом вашей цели и уровня."],
              ["03", "Получаете материалы", "Запись и транскрипт помогают подготовить конспект, слова и задания."],
              ["04", "Закрепляете", "Карточки, домашняя работа и обратная связь ведут к следующему уроку."],
            ].map(([number, title, body]) => <article key={number} className="rounded-3xl bg-white p-6 shadow-sm"><span className="text-sm font-black" style={{ color: primary }}>{number}</span><h3 className="mt-8 text-xl font-black">{title}</h3><p className="mt-2 leading-7 text-zinc-600">{body}</p></article>)}
          </div>
        </div>
      </section>

      <section id="prices" className="bg-zinc-950 px-4 py-16 text-white sm:px-6 sm:py-24" aria-labelledby="prices-heading">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-yellow-300">Актуальные цены</p>
            <h2 id="prices-heading" className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Выберите ритм занятий</h2>
            <p className="mt-5 text-lg leading-8 text-zinc-300">Цены загружаются из опубликованного каталога академии — те же пакеты вы увидите в личном кабинете.</p>
          </div>
          {catalogue === undefined ? (
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Загрузка пакетов">{[1, 2, 3].map((item) => <div key={item} className="h-72 animate-pulse rounded-3xl bg-white/10" />)}</div>
          ) : catalogue.length === 0 ? (
            <div className="mt-10 rounded-3xl border border-white/15 bg-white/5 p-6 text-zinc-200">Опубликованные пакеты временно недоступны. Напишите нам — подскажем актуальные варианты.</div>
          ) : (
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {catalogue.map((offer) => (
                <article key={`${offer.family}-${offer.packName}`} className="flex min-w-0 flex-col rounded-3xl bg-white p-6 text-zinc-950">
                  <p className="text-sm font-bold" style={{ color: primary }}>{offer.family}</p>
                  <h3 className="mt-2 text-2xl font-black">{offer.packName}</h3>
                  <p className="mt-5 text-3xl font-black tracking-tight">{formatKzt(offer.priceKzt)}</p>
                  <p className="mt-1 text-sm text-zinc-500">{offer.lessonCount} уроков · срок {offer.expiryDays} дней с первого использования</p>
                  <ul className="mt-6 flex-1 space-y-3 text-sm text-zinc-700">
                    {offer.benefits.map((benefit) => <li key={benefit} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> <span>{benefit}</span></li>)}
                  </ul>
                  <Link href={signupHref} className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full px-5 font-bold text-white" style={{ backgroundColor: primary }}>Выбрать пакет</Link>
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
            <h2 className="mt-5 text-2xl font-black">{launchInfo?.trial.enabled ? `${launchInfo.trial.lessonCount} пробный урок` : "Начните с консультации"}</h2>
            <p className="mt-3 leading-7 text-white/80">{launchInfo?.trial.enabled ? "Пробный кредит зачисляется после завершения регистрации. Это не подписка и не покупка пакета." : "Расскажите о цели — поможем подобрать подходящий формат."}</p>
            <Link href={signupHref} className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 font-bold" style={{ color: primary }}>Создать аккаунт</Link>
          </article>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-[2rem] p-7 sm:p-10 lg:flex-row lg:items-center" style={{ backgroundColor: canvas }}>
          <div className="max-w-2xl"><h2 className="text-3xl font-black tracking-tight sm:text-4xl">Остались вопросы?</h2><p className="mt-3 text-lg text-zinc-800">Напишите об уровне, цели или расписании. Контакт академии: <a className="font-bold underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p></div>
          <a href={whatsappHref} target="_blank" rel="noreferrer" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-center font-bold text-white sm:w-auto" style={{ backgroundColor: primary }} aria-label="Message Omnica English on WhatsApp"><MessageCircle className="h-5 w-5 shrink-0" /> Message Omnica English on WhatsApp</a>
        </div>
      </section>

      <footer className="border-t border-zinc-200 bg-white px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-bold text-zinc-900"><TenantPublicLogo logoUrl={launchInfo?.logoUrl} name={name} size={28} className="rounded-md" /> {name}</div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Юридическая информация"><Link href="/privacy" className="hover:text-zinc-950">Конфиденциальность</Link><Link href="/terms" className="hover:text-zinc-950">Условия обучения</Link><Link href="/sign-in" className="hover:text-zinc-950">Войти</Link></nav>
        </div>
      </footer>
    </main>
  );
}
