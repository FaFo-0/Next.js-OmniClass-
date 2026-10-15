"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const serverSnapshot = () => null;
function browserSnapshot() {
  return /Chrome\//.test(navigator.userAgent) && navigator.vendor === "Google Inc." &&
    !/Edg\/|OPR\/|Android|Mobile|CriOS/.test(navigator.userAgent);
}

export function TeacherBrowserGate({ children }: { children: React.ReactNode }) {
  const supported = useSyncExternalStore<boolean | null>(subscribe, browserSnapshot, serverSnapshot);
  return <div translate="no" className="notranslate">
    {supported === null ? null : supported ? children :
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">Open in Google Chrome</h1>
        <p className="mt-3">Teachers need desktop Chrome to record both voices.</p>
        <a className="mt-4 inline-block underline" href="https://www.google.com/chrome/">Get Google Chrome</a>
      </main>}
  </div>;
}
