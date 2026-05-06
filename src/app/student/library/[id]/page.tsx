"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { ReadingView } from "@/components/library/ReadingView";

export default function StudentLibraryDetail() {
  const { id } = useParams<{ id: string }>();
  const material = useQuery(api.library.get, {
    id: id as Id<"libraryMaterials">,
  });
  if (material === undefined) return null;
  if (material === null) return <div className="p-6">Not found.</div>;
  return <ReadingView material={material} mode="self-study" />;
}
