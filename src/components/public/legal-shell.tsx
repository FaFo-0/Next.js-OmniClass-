"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { LanguageSelectControl } from "@/components/layout/language-switcher";
import { TenantPublicLogo } from "@/components/public/tenant-logo";
import { PUBLIC_LANGUAGE_OPTIONS } from "@/lib/publicLandingCopy";
import { buildPublicHref, resolveLandingLocale } from "@/lib/publicLandingLocale";
import { LEGAL_COPY } from "@/lib/publicLegalCopy";

export function LegalShell({ kind }: { kind: "privacy" | "terms" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = resolveLandingLocale(searchParams);
  const { shell, [kind]: documentCopy } = LEGAL_COPY[locale];
  const info = useQuery(api.tenantSettings.getPublicLaunchInfo);
  const name = info?.name ?? "Omnica English";
  const supportEmail = info?.supportEmail ?? "hello@omnica.app";
  const href = (path: string) => buildPublicHref(path, locale, searchParams);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${documentCopy.title} — ${name}`;
  }, [locale, documentCopy.title, name]);

  return (
    <main lang={locale} className="min-h-screen overflow-x-clip bg-[#faf7ef] text-[#191327]">
      <header className="sticky top-0 z-40 border-b border-[#26143f]/10 bg-[#faf7ef]/95 backdrop-blur-xl">
        <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:flex sm:px-8">
          <Link href={href("/")} className="flex min-w-0 items-center gap-2.5 rounded-lg font-black focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-purple-600" aria-label={`${name} — ${shell.home}`}><TenantPublicLogo logoUrl={info?.logoUrl} name={name} size={38} className="rounded-lg" /><span className="truncate">{name}</span></Link>
          <LanguageSelectControl value={locale} onChange={(next) => router.push(buildPublicHref(`/${kind}`, next, searchParams))} options={PUBLIC_LANGUAGE_OPTIONS} ariaLabel={shell.language} />
          <Link href="/sign-in" className="col-span-2 justify-self-end rounded-full bg-[#26143f] px-4 py-2 text-sm font-bold text-white hover:bg-[#4b2774] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 sm:ms-auto">{shell.signIn}</Link>
        </div>
      </header>
      <article className="mx-auto max-w-5xl px-4 pb-20 pt-14 sm:px-8 sm:pt-20">
        <div className="border-b border-[#26143f]/20 pb-10"><p className="text-xs font-black uppercase tracking-[.17em] text-[#6b329a]">{shell.label}</p><h1 className="mt-4 max-w-3xl text-4xl font-black tracking-[-.045em] sm:text-6xl">{documentCopy.title}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-[#57505f]">{documentCopy.intro}</p><p className="mt-5 text-sm font-semibold text-[#645b70]">{shell.updated}</p></div>
        <div className="mt-5 divide-y divide-[#26143f]/15">{documentCopy.sections.map((section) => <section key={section.heading} className="grid gap-4 py-8 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-10 sm:py-10"><h2 className="text-xl font-black tracking-tight">{section.heading}</h2><div className="min-w-0 space-y-4 text-[1.025rem] leading-8 text-[#4d4657]">{section.paragraphs?.map((text) => <p key={text}>{text.includes("{privacy}") ? <>{text.split("{privacy}")[0]}<Link className="font-bold text-[#653290] underline underline-offset-4" href={href("/privacy")}>{shell.privacyLink}</Link>{text.split("{privacy}")[1]}</> : text}</p>)}{section.points && <ul className="space-y-3 ps-5 [list-style-type:square]">{section.points.map((point) => <li key={point}>{point}</li>)}</ul>}</div></section>)}</div>
        <aside className="mt-8 rounded-[1.5rem] bg-[#eae0f2] p-6 sm:p-8"><h2 className="text-xl font-black">{shell.contact}</h2><a className="mt-3 inline-block break-all font-bold text-[#4b2672] underline underline-offset-4" href={`mailto:${supportEmail}`}>{supportEmail}</a></aside>
      </article>
      <footer className="border-t border-[#26143f]/15 bg-white px-4 py-8 sm:px-8"><nav className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-3 text-sm font-semibold" aria-label={shell.label}><Link href={href("/")} className="hover:underline">{shell.home}</Link><Link href={href("/privacy")} aria-current={kind === "privacy" ? "page" : undefined} className="hover:underline">{shell.privacy}</Link><Link href={href("/terms")} aria-current={kind === "terms" ? "page" : undefined} className="hover:underline">{shell.terms}</Link></nav></footer>
    </main>
  );
}
