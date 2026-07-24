// Convex redacts a plain `throw new Error(...)` to a generic "Server Error" in
// production; only `ConvexError` data crosses to the client. Backend validation
// throws ConvexError(string), so read `.data` first and fall back to `.message`
// (dev) — never surface the raw "[CONVEX ...] Server Error" wrapper to users.
export function errText(e: unknown): string {
  if (e && typeof e === "object") {
    const data = (e as { data?: unknown }).data;
    if (typeof data === "string" && data) return data;
    if (data && typeof data === "object" && "message" in data) {
      const m = (data as { message?: unknown }).message;
      if (typeof m === "string" && m) return m;
    }
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === "string" && msg) {
      // Strip the Convex prefix if a plain Error leaked through in dev.
      const m = msg.match(/(?:Uncaught (?:Convex)?Error:\s*)(.+?)(?:\n|$)/);
      return m ? m[1] : msg;
    }
  }
  return "Something went wrong. Please try again.";
}
