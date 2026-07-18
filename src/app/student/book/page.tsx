import { redirect } from "next/navigation";

// C-9 — booking now lives on the calendar (§13.10). The old activity-picker
// flow predates the unified grid and used the legacy points wording;
// keep the route alive so old links/bookmarks land somewhere sensible.
export default function LegacyBookRedirect() {
  redirect("/student/calendar");
}
