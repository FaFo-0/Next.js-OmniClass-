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
import { Icon } from "@/components/shared/icons";
import {
  notificationView,
  relativeTime,
  type NotifTone,
} from "@/lib/notificationText";

const TONE: Record<NotifTone, { fg: string; bg: string }> = {
  info: { fg: "var(--brand-purple, #6716A4)", bg: "rgba(103,22,164,0.10)" },
  success: { fg: "#15803D", bg: "rgba(22,163,74,0.12)" },
  warning: { fg: "#B45309", bg: "rgba(217,119,6,0.14)" },
  danger: { fg: "#B91C1C", bg: "rgba(220,38,38,0.12)" },
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
          <div className="px-4 py-10 text-center">
            <Icon name="bell" size={28} stroke="var(--omnic-gray-300)" />
            <div className="text-sm mt-2" style={{ color: "var(--omnic-gray-500)" }}>
              You&apos;re all caught up
            </div>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {allList.map((n) => {
              const v = notificationView(n.kind, n.payload as any);
              const tone = TONE[v.tone];
              const unreadRow = !n.readAt;
              return (
                <button
                  key={n._id}
                  className="w-full text-start px-3 py-3 border-b transition-colors hover:bg-zinc-50 flex gap-3 items-start"
                  style={{ borderColor: "var(--omnic-gray-100)" }}
                  onClick={() => {
                    if (unreadRow) markRead({ notificationId: n._id });
                    if (n.link) router.push(n.link);
                  }}
                >
                  <span
                    className="flex items-center justify-center rounded-full shrink-0"
                    style={{ width: 32, height: 32, background: tone.bg, color: tone.fg }}
                  >
                    <Icon name={v.icon as any} size={15} stroke={tone.fg} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span
                        className="text-sm truncate"
                        style={{
                          fontWeight: unreadRow ? 700 : 600,
                          color: "var(--omnic-gray-800)",
                        }}
                      >
                        {v.title}
                      </span>
                      {unreadRow && (
                        <span
                          className="rounded-full shrink-0"
                          style={{ width: 7, height: 7, background: "var(--brand-purple, #6716A4)" }}
                          aria-label="unread"
                        />
                      )}
                    </span>
                    {v.body && (
                      <span
                        className="block text-xs mt-0.5"
                        style={{ color: "var(--omnic-gray-600)", lineHeight: 1.45 }}
                      >
                        {v.body}
                      </span>
                    )}
                    <span
                      className="block text-[11px] mt-1"
                      style={{ color: "var(--omnic-gray-400)" }}
                    >
                      {relativeTime(n.createdAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
