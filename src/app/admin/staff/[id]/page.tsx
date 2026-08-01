"use client";

import { use } from "react";
import { AdminDetail } from "@/components/teachers/AdminDetail";

export default function AdminStaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <AdminDetail id={id} />;
}
