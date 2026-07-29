"use client";

// Admin account page — reached from the avatar menu, same as every role.

import Link from "next/link";
import { AccountCard } from "@/components/shared/AccountCard";
import { Icon } from "@/components/shared/icons";

export default function AdminProfilePage() {
  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <AccountCard />

      <div className="card" style={{ padding: 20 }}>
        <div className="h3" style={{ marginBottom: 8 }}>Academy settings</div>
        <p className="body-sm" style={{ marginBottom: 12 }}>
          Branding, AI prompts, achievements and scheduling rules are
          academy-wide, not personal.
        </p>
        <Link href="/admin/settings" className="btn btn-secondary btn-block">
          <Icon name="settings" size={14} /> Open academy settings
        </Link>
      </div>
    </div>
  );
}
