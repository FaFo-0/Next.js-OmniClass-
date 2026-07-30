"use client";

// Admins see the same student page teachers do — one component, so the two
// never drift. (Admin used to have no student detail view at all.)

import { use } from "react";
import { StudentDetail } from "@/components/students/StudentDetail";

export default function AdminStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <StudentDetail id={id} backHref="/admin/people" backLabel="People" />;
}
