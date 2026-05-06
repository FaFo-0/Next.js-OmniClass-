"use client";

import { OrganizationList } from "@clerk/nextjs";

// User lands here when signed in with no active org.
// Clerk's <OrganizationList /> shows existing orgs they belong to +
// (when enabled in dashboard) lets them create a new one.
export default function SelectOrgPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFCA00] p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-6 text-center text-[#6716A4]">
          Select your school
        </h1>
        <OrganizationList
          hidePersonal
          afterSelectOrganizationUrl="/"
          afterCreateOrganizationUrl="/"
        />
      </div>
    </div>
  );
}
