"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

const KIND_LABELS: Record<string, string> = {
  session_published: "Session published",
  reschedule_request: "Reschedule request",
  reschedule_resolved: "Reschedule resolved",
  permission_request: "Permission request",
  achievement_unlocked: "Achievement unlocked",
  invoice: "Invoice",
  impersonation: "Impersonation",
  teacher_no_show: "Teacher no-show",
  makeup_credit_issued: "Make-up credit issued",
};

export function NotificationsBell() {
  const router = useRouter();
  const unreadList = useQuery(api.notifications.listUnread) ?? [];
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const allList = useQuery(api.notifications.listRecent, { limit: 20 }) ?? [];

  const unread = unreadList.length;

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Notifications"
        className="relative h-9 w-9 rounded-full hover:bg-zinc-100 flex items-center justify-center"
        style={{ color: "var(--omnic-gray-700)" }}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div
          className="px-4 py-3 border-b font-semibold text-sm flex items-center justify-between"
          style={{ borderColor: "var(--omnic-gray-100)" }}
        >
          <span>Notifications</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-auto py-0.5"
              onClick={() => markAllRead()}
            >
              Mark all read
            </Button>
          )}
        </div>
        {allList.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            No notifications yet.
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {allList.map((n) => (
              <button
                key={n._id}
                className={`w-full text-start px-4 py-2.5 border-b text-sm transition-colors hover:bg-zinc-50 ${
                  !n.readAt ? "bg-purple-50/40" : ""
                }`}
                style={{ borderColor: "var(--omnic-gray-100)" }}
                onClick={() => {
                  if (!n.readAt) markRead({ notificationId: n._id });
                  if (n.link) router.push(n.link);
                }}
              >
                <div className="font-medium text-xs" style={{ color: "var(--omnic-gray-500)" }}>
                  {KIND_LABELS[n.kind] ?? n.kind}
                </div>
                <div className="text-sm mt-0.5" style={{ color: "var(--omnic-gray-800)" }}>
                  {typeof n.payload === "object" && n.payload?.reason
                    ? n.payload.reason
                    : ""}
                </div>
                <div className="text-[10px] mt-1" style={{ color: "var(--omnic-gray-400)" }}>
                  {new Date(n.createdAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
