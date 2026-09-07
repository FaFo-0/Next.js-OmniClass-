"use client";

// P6 — microphone preflight for the live-session entry.
//
// Recording used to start and hope: no prompt, no device list, no way to
// know the mic was silent before the lesson began. This widget asks ONCE, on
// an explicit teacher action, then:
//   - lists the available input devices,
//   - shows a live level meter ("speak — do you see movement?"),
//   - names the failure clearly (no signal / denied / no device) with
//     browser-specific recovery guidance,
//   - remembers the chosen device id (localStorage) for next time.
//
// It deliberately does NOT drive Soniox's capture (Soniox uses the system
// default input); when the chosen device is not the OS default we say so
// plainly instead of pretending to switch the recording engine. It also
// never touches the browser's screen-sharing picker.

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/shared/icons";
import { useTranslations } from "next-intl";

const STORAGE_KEY = "omnic.micDeviceId";

type State =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "denied" }
  | { kind: "no-device" }
  | { kind: "error"; message: string }
  | { kind: "testing"; level: number; deviceId: string | null };

export function MicCheck() {
  const t = useTranslations("recording.micCheck");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [deviceId, setDeviceId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopAll = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setState({ kind: "idle" });
  };

  useEffect(() => stopAll, []);

  // Test the given device (or the default when none chosen): request the
  // microphone explicitly, wire a live level meter, and remember the device.
  async function startTest(preferredId?: string) {
    setState({ kind: "requesting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: preferredId
          ? { deviceId: { exact: preferredId } }
          : true,
      });
      streamRef.current = stream;

      const inputs = await navigator.mediaDevices.enumerateDevices();
      const mics = inputs.filter((d) => d.kind === "audioinput");
      setDevices(mics);

      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        // Voice ranges sit well below the flat-line of silence.
        let max = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i] - 128);
          if (v > max) max = v;
        }
        const level = Math.min(1, max / 128);
        setState({ kind: "testing", level, deviceId: preferredId ?? null });
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      const e = err as { name?: string; message?: string };
      if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
        setState({ kind: "denied" });
      } else if (e?.name === "NotFoundError" || e?.name === "DevicesNotFoundError") {
        setState({ kind: "no-device" });
      } else {
        setState({ kind: "error", message: e?.message ?? String(err) });
      }
    }
  }

  function remember(dev: string) {
    setDeviceId(dev);
    try {
      localStorage.setItem(STORAGE_KEY, dev);
    } catch {
      // private mode — the session still works, it just won't be remembered
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    setState({ kind: "idle" });
  }

  function startWithDefault() {
    void startTest(undefined);
  }

  return (
    <div
      className="rounded-xl border bg-card p-3 mb-3"
      style={{ borderColor: "var(--omnic-gray-150, var(--omnic-gray-200))" }}
    >
      {!open ? (
        <button
          className="btn btn-secondary btn-sm w-full"
          onClick={() => {
            setOpen(true);
            void startTest(deviceId || undefined);
          }}
        >
          <Icon name="mic" size={13} /> {t("check")}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="body-sm" style={{ fontWeight: 600 }}>
              {t("title")}
            </div>
            <button
              className="body-sm"
              style={{ color: "var(--omnic-gray-400)", border: "none", background: "none", cursor: "pointer" }}
              onClick={() => {
                setOpen(false);
                stopAll();
              }}
            >
              {t("close")}
            </button>
          </div>

          {state.kind === "requesting" && <div className="body-sm">{t("requesting")}</div>}

          {state.kind === "denied" && (
            <div className="body-sm" style={{ color: "#B91C1C" }}>
              {t("denied")}
              <div className="mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                {t("deniedFix")}
              </div>
              <button className="btn btn-secondary btn-sm mt-2" onClick={startWithDefault}>
                {t("tryAgain")}
              </button>
            </div>
          )}

          {state.kind === "no-device" && (
            <div className="body-sm" style={{ color: "#B91C1C" }}>
              {t("noDevice")}
              <button className="btn btn-secondary btn-sm mt-2" onClick={startWithDefault}>
                {t("tryAgain")}
              </button>
            </div>
          )}

          {state.kind === "error" && (
            <div className="body-sm" style={{ color: "#B91C1C" }}>
              {t("error")} {state.message}
            </div>
          )}

          {state.kind === "testing" && (
            <>
              {/* Level meter — speak and watch for movement */}
              <div
                className="h-3 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, #DCFCE7, #86EFAC 60%, #FDE68A 85%, #FCA5A5)",
                  transform: `scaleX(${Math.max(0.04, state.level)})`,
                  transformOrigin: "inline-start",
                  transition: "transform 60ms linear",
                }}
                aria-hidden
              />
              <div
                className="body-sm"
                style={{
                  color:
                    state.level > 0.06
                      ? "#166534"
                      : "var(--omnic-gray-500)",
                }}
              >
                {state.level > 0.06 ? t("signalGood") : t("speakNow")}
              </div>

              {devices.length > 0 && (
                <div>
                  <label className="text-xs font-medium" htmlFor="mic-device">
                    {t("deviceLabel")}
                  </label>
                  <select
                    id="mic-device"
                    className="select"
                    style={{ width: "100%", fontSize: 13 }}
                    value={deviceId || devices[0]?.deviceId || ""}
                    onChange={(e) => remember(e.target.value)}
                  >
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || t("deviceUnnamed")}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                    {t("defaultNote")}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}