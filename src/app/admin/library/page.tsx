import { redirect } from "next/navigation";

// The library is now the works/units model at /admin/library/works. Redirect
// any old /admin/library link (or bookmark) to the single unified surface.
export default function AdminLibraryIndex() {
  redirect("/admin/library/works");
}
