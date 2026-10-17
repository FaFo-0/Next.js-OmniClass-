"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const serverSnapshot = () => false;
export function isFirefox(userAgent: string) {
  return /Firefox\/|FxiOS\//.test(userAgent);
}
function browserSnapshot() {
  return isFirefox(navigator.userAgent);
}

/** Browser compatibility is advisory; it must never prevent portal access. */
export function TeacherBrowserGate({ children, role }: { children: React.ReactNode; role?: string }) {
  const firefox = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  return <div translate="no" className="notranslate">
    {role === "teacher" && firefox && (
      <aside role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Live sessions don’t work in Firefox. Use desktop Google Chrome for live sessions.
      </aside>
    )}
    {children}
  </div>;
}
