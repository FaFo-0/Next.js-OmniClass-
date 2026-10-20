"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useTranslations } from "next-intl";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { LibraryCatalogue } from "@/components/library/LibraryCatalogue";
export default function TeacherLibraryPage() {
  const t = useTranslations("app.library");
  const { user } = useAuth();
  const works = useQuery(api.libraryWorks.listPublished);
  const students = useQuery(api.users.getStudentsForTeacher, user ? { teacherId: user.externalId } : "skip") ?? [];
  const [studentId, setStudentId] = useState("");
  return <LibraryCatalogue works={works} baseHref="/teacher/library/work" suffix={studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}>
    <div className="catalogue-student"><label>{t("readWith")}<select value={studentId} onChange={e => setStudentId(e.target.value)}><option value="">{t("readOnly")}</option>{students.map(s => <option key={s.externalId} value={s.externalId}>{s.name}</option>)}</select></label>{studentId && <Link className="btn-outline" href={`/teacher/students/${studentId}#vocabulary`}>{t("studentWords")}</Link>}</div>
  </LibraryCatalogue>;
}
