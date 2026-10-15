import assert from "node:assert/strict";
import test from "node:test";
import { SonioxRecorder } from "../src/lib/soniox/client";

test("tab picker is invoked in the click gesture before any key request; cancellation stays recoverable", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let pickerOpened = false;
  let keyRequested = false;
  const errors: string[] = [];
  const statuses: string[] = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: {
    getDisplayMedia() { pickerOpened = true; return Promise.reject(new Error("Permission denied by user")); },
  } } });
  try {
    const recorder = new SonioxRecorder({ getApiKey: async () => { keyRequested = true; return "unused"; } });
    const pending = recorder.start(() => {}, e => errors.push(e), s => statuses.push(s), "both");
    assert.equal(pickerOpened, true);
    await pending;
    assert.equal(keyRequested, false);
    assert.deepEqual(statuses, ["connecting", "error"]);
    assert.deepEqual(errors, ["Permission denied by user"]);
    assert.equal(recorder.isRecording, false);
    assert.equal(recorder.getCaptureStream(), null);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("sharing without tab audio closes the display capture and reports a useful retry error", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let stopped = false;
  let error = "";
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: {
    async getDisplayMedia() { return { getAudioTracks: () => [], getTracks: () => [{stop() { stopped = true; }}] }; },
  } } });
  try {
    const recorder = new SonioxRecorder();
    await recorder.start(() => {}, e => { error = e; }, () => {}, "tab");
    assert.equal(stopped, true);
    assert.match(error, /Share tab audio/);
    assert.equal(recorder.getCaptureStream(), null);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
