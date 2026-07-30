"use client";

import { use } from "react";
import { StudentDetail } from "@/components/students/StudentDetail";

export default function TeacherStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <StudentDetail id={id} backHref="/teacher/students" backLabel="All students" />;
}
