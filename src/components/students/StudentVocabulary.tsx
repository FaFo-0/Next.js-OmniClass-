"use client";
import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useTranslations } from "next-intl";
import { api } from "@convex";
export function StudentVocabulary({ studentId }: { studentId: string }) {
  const t = useTranslations("app.library");
  const [search, setSearch] = useState("");
  const words = useQuery(api.srs.listMyWords, { studentId });
  const filtered = words?.filter(w => `${w.word} ${w.translation ?? w.back}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <details id="vocabulary" className="card student-vocabulary" open><summary>{t("studentWords")} {words && <span>({words.length})</span>}</summary><div><input className="input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t("searchWords")} aria-label={t("searchWords")} /><div className="student-word-list">{words === undefined ? t("loading") : !filtered?.length ? t("noWords") : filtered.map(word => <article key={word._id}><strong>{word.word}</strong><span>{word.translation ?? word.back}</span>{word.exampleSentence && <p>{word.exampleSentence}</p>}</article>)}</div></div></details>;
}
