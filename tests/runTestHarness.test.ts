import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createActivityTracker, createHermesActivityProbe, finalizeArtifacts, hermesSessionMarker, initializeBookingEvidence, reportIsFinalized, runFixture, validateBookingEvidence, writePrompt } from "../scripts/run-test.mjs";

test("Hermes runtime activity refreshes idle tracking without artifact changes", () => {
  let now = 0;
  const firstRuntimeMarker = hermesSessionMarker({ id: "runtime", last_activity_at: 1, message_count: 2, tool_call_count: 1 });
  const tracker = createActivityTracker(`same-artifacts::${firstRuntimeMarker}`, () => now);

  now = 89_000;
  assert.equal(tracker.isIdle(90_000), false);

  const reasoningMarker = hermesSessionMarker({ id: "runtime", last_activity_at: 2, message_count: 2, tool_call_count: 1 });
  assert.equal(tracker.observe(`same-artifacts::${reasoningMarker}`), true);

  now = 178_000;
  assert.equal(tracker.isIdle(90_000), false);
  now = 179_000;
  assert.equal(tracker.isIdle(90_000), true);
});

test("Hermes activity probe follows the named runtime regardless of CLI source", async () => {
  let requestedTitle = "";
  let closed = false;
  const probe = await createHermesActivityProbe("named runtime", {
    stateDb: tmpdir(),
    openDatabase: async () => ({
      prepare: () => ({
        get: (title: string) => {
          requestedTitle = title;
          return { id: "runtime", last_activity_at: 4, message_count: 6, tool_call_count: 3 };
        },
      }),
      close: () => { closed = true; },
    }),
  });

  assert.equal(requestedTitle, "");
  assert.equal(probe.marker(), "runtime:4:6:3");
  assert.equal(requestedTitle, "named runtime");
  probe.close();
  assert.equal(closed, true);
});

test("finalizeArtifacts writes a BLOCKED-HARNESS report and browser events", () => {
  const artifacts = mkdtempSync(join(tmpdir(), "omniclass-run-test-"));
  mkdirSync(join(artifacts, "screenshots"));
  writeFileSync(join(artifacts, "findings.md"), "- verdict: pending\n");
  writeFileSync(join(artifacts, "visual-summary.md"), "- verdict: pending\n");
  writeFileSync(join(artifacts, "browser-events.json"), "[]\n");
  writeFileSync(join(artifacts, "progress.ndjson"), `${JSON.stringify({ kind: "stage", stage: "1", role: "student", status: "PASS", note: "student context authenticated" })}\n`);
  writeFileSync(join(artifacts, "summary.json"), `${JSON.stringify({ mode: "walk", shots: 0, verdict: "pending" })}\n`);
  writeFileSync(join(artifacts, "screenshots", "01-reached.png"), "not an image; inventory only\n");

  try {
    finalizeArtifacts({
      artifacts,
      mode: "walk",
      persona: "Russian",
      base: "https://next-js-omni-class.vercel.app",
      normalUse: true,
      runtimeStatus: "stopped after 300000ms runtime timeout; report finalized by executor",
      runtimeStarted: true,
    });

    const summary = JSON.parse(readFileSync(join(artifacts, "summary.json"), "utf8"));
    const events = JSON.parse(readFileSync(join(artifacts, "browser-events.json"), "utf8"));
    const findings = readFileSync(join(artifacts, "findings.md"), "utf8");
    const visual = readFileSync(join(artifacts, "visual-summary.md"), "utf8");

    assert.equal(reportIsFinalized(artifacts), true);
    assert.equal(summary.verdict, "BLOCKED-HARNESS");
    assert.equal(summary.reportFinalized, true);
    assert.equal(summary.browserEventsFinalized, true);
    assert.match(findings, /No product bug is asserted/);
    assert.match(findings, /stage 1/);
    assert.match(visual, /BLOCKED-HARNESS/);
    assert.ok(events.events.some((event: { kind?: string }) => event.kind === "runtime_progress"));
    assert.ok(events.events.some((event: { kind?: string }) => event.kind === "executor_finalization"));
  } finally {
    rmSync(artifacts, { recursive: true, force: true });
  }
});

test("finalizeArtifacts turns missing booking evidence into a harness blocker", () => {
  const artifacts = mkdtempSync(join(tmpdir(), "omniclass-evidence-test-"));
  mkdirSync(join(artifacts, "screenshots"));
  writeFileSync(join(artifacts, "findings.md"), "# Findings\n\nVERDICT: SHIP\n");
  writeFileSync(join(artifacts, "visual-summary.md"), "# Visual summary\n\nVERDICT: SHIP\n");
  writeFileSync(join(artifacts, "browser-events.json"), `${JSON.stringify({ events: [] })}\n`);
  writeFileSync(join(artifacts, "progress.ndjson"), "");
  writeFileSync(join(artifacts, "summary.json"), `${JSON.stringify({ mode: "walk", verdict: "SHIP" })}\n`);

  try {
    finalizeArtifacts({
      artifacts,
      mode: "walk",
      persona: "Russian",
      base: "http://localhost:3000",
      normalUse: true,
      runtimeStatus: "finished",
      runtimeStarted: true,
    });

    const summary = JSON.parse(readFileSync(join(artifacts, "summary.json"), "utf8"));
    const findings = readFileSync(join(artifacts, "findings.md"), "utf8");
    const visual = readFileSync(join(artifacts, "visual-summary.md"), "utf8");

    assert.equal(summary.verdict, "BLOCKED-HARNESS");
    assert.equal(summary.bookingEvidenceValidated, false);
    assert.match(findings, /Harness evidence validation/);
    assert.match(findings, /booking-evidence\.json/);
    assert.match(findings, /VERDICT: BLOCKED-HARNESS/);
    assert.match(visual, /VERDICT: BLOCKED-HARNESS/);
  } finally {
    rmSync(artifacts, { recursive: true, force: true });
  }
});

test("finalizeArtifacts records validated booking evidence in final findings", () => {
  const artifacts = mkdtempSync(join(tmpdir(), "omniclass-valid-evidence-test-"));
  mkdirSync(join(artifacts, "screenshots"));
  writeFileSync(join(artifacts, "findings.md"), "# Findings\n\nVERDICT: SHIP\n");
  writeFileSync(join(artifacts, "visual-summary.md"), "# Visual summary\n\nVERDICT: SHIP\n");
  writeFileSync(join(artifacts, "browser-events.json"), `${JSON.stringify({ events: [] })}\n`);
  writeFileSync(join(artifacts, "progress.ndjson"), "");
  writeFileSync(join(artifacts, "summary.json"), `${JSON.stringify({ mode: "walk", verdict: "SHIP" })}\n`);
  writeFileSync(join(artifacts, "booking-evidence.json"), `${JSON.stringify({
    schemaVersion: 1,
    mode: "walk",
    fixturePrerequisite: { status: "not-applicable" },
    balance: { state: "settled-zero", value: 0, visibleText: "0 lessons" },
    booking: {
      status: "NA",
      slotAttempted: false,
      confirmationAttempted: false,
      batchConflictsText: "<not-rendered>",
      confirmDisabled: "not-rendered",
    },
    adminHandoffAttempted: true,
  })}\n`);

  try {
    finalizeArtifacts({
      artifacts,
      mode: "walk",
      persona: "Russian",
      base: "http://localhost:3000",
      normalUse: true,
      runtimeStatus: "finished",
      runtimeStarted: true,
    });

    const summary = JSON.parse(readFileSync(join(artifacts, "summary.json"), "utf8"));
    const findings = readFileSync(join(artifacts, "findings.md"), "utf8");

    assert.equal(summary.verdict, "SHIP");
    assert.equal(summary.bookingEvidenceValidated, true);
    assert.match(findings, /Booking preflight evidence/);
    assert.match(findings, /balance: settled-zero · value=0 · text=0 lessons/);
    assert.match(findings, /batchConflictsText: <not-rendered>/);
    assert.match(findings, /confirmDisabled: not-rendered/);
    assert.match(findings, /adminHandoffAttempted: true/);
    assert.equal((findings.match(/VERDICT: SHIP/g) ?? []).length, 1);
  } finally {
    rmSync(artifacts, { recursive: true, force: true });
  }
});

test("normal-use prompt forces bounded row progression and role handoffs", () => {
  const artifacts = mkdtempSync(join(tmpdir(), "omniclass-prompt-test-"));
  try {
    const promptFile = writePrompt(
      artifacts,
      "walk",
      "Russian",
      "https://next-js-omni-class.vercel.app",
      {},
      undefined,
      true,
    );
    const prompt = readFileSync(promptFile, "utf8");
    assert.ok(prompt.includes("progress.ndjson"));
    assert.ok(prompt.includes("Treat each runbook F-/T- row as the progress unit"));
    assert.ok(prompt.includes("Every browser_exec code block MUST begin by appending a STARTED row heartbeat"));
    assert.ok(prompt.includes("MUST append that row's PASS, FAIL, NA, or BLOCKED result"));
    assert.ok(prompt.includes("one action attempt and at most one passive reprobe per row"));
    assert.ok(prompt.includes("do not revisit locale until the final locale sweep"));
    assert.ok(prompt.includes("authentication and locale are separate results"));
    assert.ok(prompt.includes("never mark auth BLOCKED only because the locale selector is absent or unsettled"));
    assert.ok(prompt.includes("Treat `/` as transitional"));
    assert.ok(prompt.includes("A locale NA/BLOCKED result does not block functional F-/L- rows"));
    assert.ok(prompt.includes("append state-dependent NA records for F-2.2, F-2.3, F-2.4, T-2.5, and L-2.6"));
    assert.ok(prompt.includes("navigate immediately to `/student/billing`"));
    assert.ok(prompt.includes("Do not end a browser turn at F-2.1 NA"));
    assert.ok(prompt.includes("continue to claim and calendar rows"));
    assert.ok(prompt.includes("never click I have paid and never confirm/approve a claim"));
    assert.ok(prompt.includes("Before F-2.15, inspect the visible lesson balance"));
    assert.ok(prompt.includes("A visible zero is not settled while the balance is missing, undefined, loading, or paired with a loading skeleton"));
    assert.ok(prompt.includes("loading-or-unknown"));
    assert.ok(prompt.includes("append F-2.15 and F-2.16 as state-dependent NA or precondition-blocked"));
    assert.ok(prompt.includes("booking-evidence.json"));
    assert.ok(prompt.includes("batchConflictsText"));
    assert.ok(prompt.includes("confirmDisabled"));
    assert.ok(prompt.includes("adminHandoffAttempted"));
    assert.ok(prompt.includes("record the literal visible batchConflicts text and the Confirm booking button's disabled state"));
    assert.ok(prompt.includes("Each probe/action must settle within 15 seconds"));
    assert.ok(prompt.includes("record NA or BLOCKED"));
    assert.ok(prompt.includes("After F-2.16, switch to admin"));
    assert.ok(prompt.includes("teacher F-4.2a"));
    assert.ok(prompt.includes("lessonStart, currentTime, windowStart, windowEnd, controlDisabled, and classification"));
    assert.ok(prompt.includes("expected-disabled-outside-window"));
    assert.ok(prompt.includes("confirmed-product-finding"));
    assert.ok(prompt.includes("never a browser bug"));
  } finally {
    rmSync(artifacts, { recursive: true, force: true });
  }
});

test("booking runbook requires non-purchase credit and preserves conflict evidence", () => {
  const runbook = readFileSync(join(process.cwd(), "docs", "E2E_RUNBOOK.md"), "utf8");

  assert.ok(runbook.includes("fixture-backed runs require a verified non-purchase trial credit"));
  assert.ok(runbook.includes("Before `F-2.15`, inspect the settled lesson balance"));
  assert.ok(runbook.includes("If it is zero, missing, still loading, or ambiguous"));
  assert.ok(runbook.includes("record `F-2.15` and `F-2.16` as state-dependent `NA` or precondition-blocked"));
  assert.ok(runbook.includes("literal visible `batchConflicts` summary/reason text"));
  assert.ok(runbook.includes("Confirm booking button's actual `disabled` state"));
  assert.ok(runbook.includes("`F-4.2a` the booked lesson's Start control follows the T-10 window?"));
  assert.ok(runbook.includes("lessonStart,currentTime,windowStart,windowEnd,controlDisabled,classification"));
  assert.ok(runbook.includes("confirmed-product-finding"));
  assert.ok(runbook.includes("expected-disabled-outside-window"));
});

test("booking evidence distinguishes settled zero from loading or unknown and blocks both", () => {
  const blockedBooking = {
    status: "NA",
    slotAttempted: false,
    confirmationAttempted: false,
    batchConflictsText: "<not-rendered>",
    confirmDisabled: "not-rendered",
  };
  const base = {
    schemaVersion: 1,
    mode: "walk",
    fixturePrerequisite: { status: "not-applicable" },
    booking: blockedBooking,
    adminHandoffAttempted: true,
  };

  assert.deepEqual(
    validateBookingEvidence({
      ...base,
      balance: { state: "settled-zero", value: 0, visibleText: "0 lessons" },
    }, { mode: "walk", normalUse: true }),
    { ok: true, errors: [] },
  );
  assert.deepEqual(
    validateBookingEvidence({
      ...base,
      balance: { state: "loading-or-unknown", value: null, visibleText: "Loading lessons…" },
    }, { mode: "walk", normalUse: true }),
    { ok: true, errors: [] },
  );

  const zeroWithoutSettledValue = validateBookingEvidence({
    ...base,
    balance: { state: "settled-zero", value: null, visibleText: "0 lessons" },
  }, { mode: "walk", normalUse: true });
  assert.equal(zeroWithoutSettledValue.ok, false);
  assert.ok(zeroWithoutSettledValue.errors.some((error: string) => error.includes("settled-zero requires value 0")));

  const unknownThatBooked = validateBookingEvidence({
    ...base,
    balance: { state: "loading-or-unknown", value: null, visibleText: "Loading lessons…" },
    booking: { ...blockedBooking, slotAttempted: true },
  }, { mode: "walk", normalUse: true });
  assert.equal(unknownThatBooked.ok, false);
  assert.ok(unknownThatBooked.errors.some((error: string) => error.includes("must not attempt booking")));
});

test("booking evidence rejects semantically impossible staged and preflight states", () => {
  const base = {
    schemaVersion: 1,
    mode: "walk",
    fixturePrerequisite: { status: "not-applicable" },
    balance: { state: "settled-positive", value: 1, visibleText: "1 lesson" },
    booking: {
      status: "PASS",
      slotAttempted: true,
      confirmationAttempted: true,
      batchConflictsText: "<absent>",
      confirmDisabled: false,
    },
    adminHandoffAttempted: true,
  };
  const context = { mode: "walk", normalUse: true };

  const passWithoutRenderedEvidence = validateBookingEvidence({
    ...base,
    booking: {
      ...base.booking,
      batchConflictsText: "<not-rendered>",
      confirmDisabled: "not-rendered",
    },
  }, context);
  assert.equal(passWithoutRenderedEvidence.ok, false);
  assert.ok(passWithoutRenderedEvidence.errors.some((error: string) => error.includes("staged booking requires rendered conflict and button evidence")));

  const confirmationWithoutSlot = validateBookingEvidence({
    ...base,
    booking: { ...base.booking, slotAttempted: false },
  }, context);
  assert.equal(confirmationWithoutSlot.ok, false);
  assert.ok(confirmationWithoutSlot.errors.some((error: string) => error.includes("confirmation requires a staged slot attempt")));

  for (const balance of [
    { state: "settled-zero", value: 0, visibleText: "0 lessons" },
    { state: "loading-or-unknown", value: null, visibleText: "Loading lessons…" },
  ]) {
    const renderedPreflight = validateBookingEvidence({
      ...base,
      balance,
      booking: {
        status: "NA",
        slotAttempted: false,
        confirmationAttempted: false,
        batchConflictsText: "<absent>",
        confirmDisabled: false,
      },
    }, context);
    assert.equal(renderedPreflight.ok, false);
    assert.ok(renderedPreflight.errors.some((error: string) => error.includes("preflight-blocked booking evidence must be not-rendered")));
  }
});

test("booking evidence rejects a runtime-altered fixture prerequisite", () => {
  const fixturePrerequisite = {
    status: "verified",
    eventStatus: "fulfilled",
    grantLinked: true,
    grantRemaining: 1,
    balance: 1,
  };
  const evidence = {
    schemaVersion: 1,
    mode: "walk",
    fixturePrerequisite: { ...fixturePrerequisite, grantRemaining: 0 },
    balance: { state: "settled-positive", value: 1, visibleText: "1 lesson" },
    booking: {
      status: "PASS",
      slotAttempted: true,
      confirmationAttempted: true,
      batchConflictsText: "<absent>",
      confirmDisabled: false,
    },
    adminHandoffAttempted: true,
  };

  const result = validateBookingEvidence(evidence, {
    mode: "walk",
    normalUse: false,
    fixturePrerequisite,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error: string) => error.includes("preserve the executor-verified fixture prerequisite")));
});

test("booking evidence initialization preserves the executor-owned fixture prerequisite", () => {
  const artifacts = mkdtempSync(join(tmpdir(), "omniclass-booking-template-test-"));
  const verified = {
    status: "verified",
    eventStatus: "fulfilled",
    grantLinked: true,
    grantRemaining: 1,
    balance: 1,
  };

  try {
    assert.throws(
      () => initializeBookingEvidence(artifacts, "walk", false, null),
      /verified fixture prerequisite/,
    );
    initializeBookingEvidence(artifacts, "walk", false, verified);
    const fixtureEvidence = JSON.parse(readFileSync(join(artifacts, "booking-evidence.json"), "utf8"));
    assert.deepEqual(fixtureEvidence.fixturePrerequisite, verified);
    assert.equal(fixtureEvidence.balance.state, "pending");
    assert.equal(fixtureEvidence.adminHandoffAttempted, false);

    initializeBookingEvidence(artifacts, "walk", true, null);
    const normalUseEvidence = JSON.parse(readFileSync(join(artifacts, "booking-evidence.json"), "utf8"));
    assert.deepEqual(normalUseEvidence.fixturePrerequisite, { status: "not-applicable" });
  } finally {
    rmSync(artifacts, { recursive: true, force: true });
  }
});

test("fixture-backed runner verifies a usable non-purchase trial credit before returning", () => {
  const originalEnabled = process.env.E2E_FIXTURES_ENABLED;
  const originalOrg = process.env.E2E_ORGANIZATION_ID;
  const originalDedicatedOrg = process.env.E2E_DEDICATED_ORGANIZATION_ID;
  const originalDedicatedAuth = process.env.E2E_DEDICATED_ORGANIZATION_AUTH;
  process.env.E2E_FIXTURES_ENABLED = "true";
  process.env.E2E_ORGANIZATION_ID = "org-e2e";
  process.env.E2E_DEDICATED_ORGANIZATION_ID = "org-e2e";
  process.env.E2E_DEDICATED_ORGANIZATION_AUTH = "verified";
  const actors = {
    student: { userId: "student-1", email: "student@example.test" },
    teacher: { userId: "teacher-1", email: "teacher@example.test" },
    admin: { userId: "admin-1", email: "admin@example.test" },
  };
  const provisioned = {
    ids: { trialGrant: "grant-1" },
  };
  const validSnapshot = {
    billing: {
      balance: 1,
      grants: [
        { id: "grant-1", source: "trial", remaining: 1 },
      ],
    },
  };

  try {
    const calls: string[] = [];
    const result = runFixture("Russian", "fixture-1", actors, {
      invoke(functionName: string) {
        calls.push(functionName);
        return functionName.endsWith("provisionStudentLoop") ? provisioned : validSnapshot;
      },
    });

    assert.deepEqual(calls, [
      "e2eFixtures:provisionStudentLoop",
      "e2eFixtures:snapshotStudentLoop",
    ]);
    assert.deepEqual(result.bookingPrerequisite, {
      status: "verified",
      grantSource: "trial",
      grantRemaining: 1,
      balance: 1,
    });

    assert.throws(
      () => runFixture("Russian", "fixture-1", actors, {
        invoke(functionName: string) {
          if (functionName.endsWith("provisionStudentLoop")) return provisioned;
          return {
            ...validSnapshot,
            billing: {
              ...validSnapshot.billing,
              grants: [
                { id: "grant-1", source: "manual", remaining: 1 },
              ],
            },
          };
        },
      }),
      /usable non-purchase trial credit was not verified/,
    );
  } finally {
    if (originalEnabled === undefined) delete process.env.E2E_FIXTURES_ENABLED;
    else process.env.E2E_FIXTURES_ENABLED = originalEnabled;
    if (originalOrg === undefined) delete process.env.E2E_ORGANIZATION_ID;
    else process.env.E2E_ORGANIZATION_ID = originalOrg;
    if (originalDedicatedOrg === undefined) delete process.env.E2E_DEDICATED_ORGANIZATION_ID;
    else process.env.E2E_DEDICATED_ORGANIZATION_ID = originalDedicatedOrg;
    if (originalDedicatedAuth === undefined) delete process.env.E2E_DEDICATED_ORGANIZATION_AUTH;
    else process.env.E2E_DEDICATED_ORGANIZATION_AUTH = originalDedicatedAuth;
  }
});

test("fixture-backed prompt requires a usable non-purchase trial credit", () => {
  const artifacts = mkdtempSync(join(tmpdir(), "omniclass-fixture-prompt-test-"));
  try {
    const promptFile = writePrompt(
      artifacts,
      "walk",
      "Russian",
      "https://next-js-omni-class.vercel.app",
      {},
      "fixture-result.json",
      false,
    );
    const prompt = readFileSync(promptFile, "utf8");

    assert.ok(prompt.includes("Fixture-backed booking requires its verified non-purchase trial credit"));
    assert.ok(prompt.includes("executor-verified fixture prerequisite"));
    assert.ok(prompt.includes("fixturePrerequisite.status=verified"));
    assert.ok(prompt.includes("do not attempt a booking without that verified marker"));
  } finally {
    rmSync(artifacts, { recursive: true, force: true });
  }
});
