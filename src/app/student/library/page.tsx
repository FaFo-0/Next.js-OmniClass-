"use client";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { LibraryCatalogue } from "@/components/library/LibraryCatalogue";
export default function LibraryPage() {
  const works = useQuery(api.libraryWorks.listRecommendedForStudent);
  const activity = useQuery(api.libraryWorks.myReadingActivity);
  return <LibraryCatalogue works={works} activity={activity ?? { recent: [], completed: 0 }} baseHref="/student/library/work" />;
}
