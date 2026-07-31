"use client";

import { use } from "react";
import { TeacherDetail } from "@/components/teachers/TeacherDetail";

export default function AdminTeacherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <TeacherDetail id={id} />;
}
