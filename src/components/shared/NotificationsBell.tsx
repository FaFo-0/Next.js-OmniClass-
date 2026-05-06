"use client";

// In-app notifications bell. Phase B stub: renders the icon + 0-state
// dropdown. Wired to `notifications` Convex table in Phase F.

import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function NotificationsBell() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Notifications"
        className="relative h-9 w-9 rounded-full hover:bg-zinc-100 flex items-center justify-center"
        style={{ color: "var(--omnic-gray-700)" }}
      >
        <Bell size={18} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div
          className="px-4 py-3 border-b font-semibold text-sm"
          style={{ borderColor: "var(--omnic-gray-100)" }}
        >
          Notifications
        </div>
        <div className="px-4 py-8 text-center text-sm text-zinc-500">
          No notifications yet.
        </div>
      </PopoverContent>
    </Popover>
  );
}
