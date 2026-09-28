"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { OmnicaMark } from "@/components/brand/OmnicaMark";

export function LegalShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const info = useQuery(api.tenantSettings.getPublicLaunchInfo);
  const name = info?.name ?? "Omnica English";
  const primary = info?.primaryColor ?? "#6716A4";
  const canvas = info?.backgroundColor ?? "#FFCA00";
  const supportEmail = info?.supportEmail ?? "hello@omnica.app";

  return (
    <main className="min-h-screen overflow-x-clip bg-[#fffaf0] text-zinc-950" lang="ru">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex min-h-16 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 font-extrabold"><OmnicaMark size={34} ringColor={primary} lensColor={canvas} /><span className="truncate">{name}</span></Link>
          <Link href="/sign-in" className="shrink-0 rounded-full px-4 py-2 text-sm font-bold text-white" style={{ backgroundColor: primary }}>Войти</Link>
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-sm font-bold uppercase tracking-[0.16em]" style={{ color: primary }}>Информация для учеников</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-600">{intro}</p>
        <p className="mt-3 text-sm text-zinc-500">Последнее обновление: 28 сентября 2026 г.</p>
        <div className="prose prose-zinc mt-10 max-w-none prose-headings:font-black prose-h2:mt-10 prose-a:font-semibold" style={{ "--tw-prose-links": primary } as React.CSSProperties}>
          {children}
          <h2>Контакты</h2>
          <p>Вопросы по этим условиям, данным или записи уроков: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
        </div>
      </article>
      <footer className="border-t border-zinc-200 bg-white px-4 py-7 sm:px-6"><div className="mx-auto flex max-w-4xl flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-600"><Link href="/">Главная</Link><Link href="/privacy">Конфиденциальность</Link><Link href="/terms">Условия обучения</Link></div></footer>
    </main>
  );
}
