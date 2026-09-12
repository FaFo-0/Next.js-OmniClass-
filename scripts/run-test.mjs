#!/usr/bin/env node
// Launch the autonomous OmniClass E2E walker.
//
//   npm run test:walk -- --persona Russian
//   npm run test:real-session -- --persona Arabic
//   npm run test:smoke

import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { mintLoginUrl } from "./dev-login.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PERSONAS = new Set(["Russian", "Kazakh", "Arabic"]);
const MODES = new Set(["walk", "real-session", "smoke"]);
const LAUNCH_ORG = "org_3DIbJAWeR5CjVaBRlB4AZXL1UpD";

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function dateInDays(days) {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function shaShort() {
  const result = spawnSync("git", ["rev-parse", "--short=8", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  return createHash("sha1").update(new Date().toISOString()).digest("hex").slice(0, 8);
}

function runId() {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${shaShort()}`;
}

function redact(value, secrets = []) {
  let text = String(value ?? "");
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join("[REDACTED]");
  }
  return text
    .replace(/https?:\/\/[^\s]*__clerk_ticket[^\s]*/gi, "[REDACTED_LOGIN_TICKET]")
    .replace(/(__clerk_ticket=)[^&\s]*/gi, "$1[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
}

function ensureArtifacts(mode, run) {
  const artifacts = join(ROOT, ".artifacts", "test-runs", run);
  mkdirSync(join(artifacts, "screenshots"), { recursive: true, mode: 0o700 });
  const source = mode === "real-session" ? "docs/E2E_RUNBOOK_REAL_SESSION.md" : "docs/E2E_RUNBOOK.md";
  copyFileSync(join(ROOT, source), join(artifacts, "runbook.md.snapshot"));
  writeFileSync(
    join(artifacts, "findings.md"),
    `# E2E findings\n\n- mode: ${mode}\n- started: ${new Date().toISOString()}\n- verdict: pending\n\nUse the standardized finding shape: severity · stage · locale · what · expected · evidence · class.\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    join(artifacts, "visual-summary.md"),
    `# E2E visual summary\n\n- mode: ${mode}\n- screenshots: 0 / 24\n- verdict: pending\n`,
    { mode: 0o600 },
  );
  writeFileSync(join(artifacts, "browser-events.json"), `${JSON.stringify({ mode, events: [] }, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(join(artifacts, "progress.ndjson"), `${JSON.stringify({ kind: "executor_start", mode, at: new Date().toISOString() })}\n`, { mode: 0o600 });
  writeFileSync(join(artifacts, "summary.json"), `${JSON.stringify({ mode, shots: 0, visionShots: 0, tokens: null, verdict: "pending" }, null, 2)}\n`, { mode: 0o600 });
  return artifacts;
}

function writePrompt(artifacts, mode, persona, base, ticketFiles, fixtureFile, normalUse = false) {
  const runbook = join(artifacts, "runbook.md.snapshot");
  const progressFile = join(artifacts, "progress.ndjson");
  const ticketLines = Object.entries(ticketFiles)
    .map(([role, file]) => `- ${role}: ${file}`)
    .join("\n");
  const fixtureLine = normalUse
    ? "Normal-use mode: no fixture provisioning, Convex setup, reset, delete, seed, or snapshot calls are permitted."
    : fixtureFile
      ? `Fixture provision marker (do not echo): ${fixtureFile}`
      : "No fixture is used for smoke.";
  const setupLine = normalUse
    ? "This is a normal-use walk against the existing test/dev tenant. Do not call provisionStudentLoop, snapshotStudentLoop, any raw Convex mutation, reset, delete, seed, or provider API. Do not make or represent a payment: never click I have paid and never confirm/approve a claim; inspect existing claim state only, record missing state as NA, and continue. Use only other normal product UI actions and record state-dependent NA/blockers."
    : `The fixture has already been provisioned by the executor in the dedicated E2E organization. Fixture-backed booking requires its verified non-purchase trial credit with at least one remaining lesson before F-2.15. The executor-verified fixture prerequisite is recorded in ${fixtureFile}; preserve fixturePrerequisite.status=verified in booking-evidence.json and do not attempt a booking without that verified marker. If the marker is absent, record a fixture blocker and do not attempt booking. Do not call any unguarded reset, raw Convex mutation, or provider API.`;
  const stateAdaptiveLine = normalUse
    ? "NORMAL-USE STATE BRANCH: authentication and locale are separate results. Mark student-auth PASS when an authenticated student shell is usable; never mark auth BLOCKED only because the locale selector is absent or unsettled. Treat `/` as transitional: wait once for `/student`; if it does not redirect, navigate directly to `/student` once. A usable student page has a `/student` route, non-empty body, and student navigation such as Home/My Lessons/Calendar or its localized equivalent. Record locale setup separately as student-locale PASS/NA/BLOCKED with route, selected value, and visible-shell evidence. A locale NA/BLOCKED result does not block functional F-/L- rows; locale-dependent T- rows may be NA/BLOCKED. If F-2.1 proves the existing student already completed onboarding, do not attempt onboarding actions: in the same browser_exec call append state-dependent NA records for F-2.2, F-2.3, F-2.4, T-2.5, and L-2.6, then navigate immediately to `/student/billing` and settle once. Do not end a browser turn at F-2.1 NA. Batch F-2.7 through L-2.10 from one DOM/CSS probe, then continue to claim and calendar rows even when locale or onboarding was unavailable. An existing pending claim is state evidence; never create a duplicate or wait for fixture-only snapshot data. Before F-2.15, inspect the visible lesson balance. A visible zero is not settled while the balance is missing, undefined, loading, or paired with a loading skeleton. Record a proven numeric zero as settled-zero; record every missing/loading/ambiguous value as loading-or-unknown with value null. In both states append F-2.15 and F-2.16 as state-dependent NA or precondition-blocked, do not click a slot or confirmation, and continue immediately to admin."
    : "";
  const bookingEvidenceFile = join(artifacts, "booking-evidence.json");
  const bookingEvidenceLine = mode === "smoke" ? "" : `BOOKING EVIDENCE GATE: update ${bookingEvidenceFile} before leaving F-2.16 and again after attempting the admin handoff. Preserve the executor-owned fixturePrerequisite object. The exact JSON contract is {schemaVersion:1, mode:${JSON.stringify(mode)}, fixturePrerequisite:{status:\"not-applicable\"|\"verified\"}, balance:{state:\"settled-zero\"|\"settled-positive\"|\"loading-or-unknown\", value:number|null, visibleText:string}, booking:{status:\"PASS\"|\"FAIL\"|\"NA\"|\"BLOCKED\", slotAttempted:boolean, confirmationAttempted:boolean, batchConflictsText:string, confirmDisabled:boolean|\"not-rendered\"}, adminHandoffAttempted:boolean}. batchConflictsText must be the literal visible text, \"<absent>\" when a settled rendered booking UI has no conflict text, or \"<not-rendered>\" when preflight prevents rendering. confirmDisabled must be the actual DOM disabled boolean or \"not-rendered\". For settled-zero or loading-or-unknown, status must be NA/BLOCKED and both attempt booleans must remain false. Set adminHandoffAttempted=true only after navigating or switching to the admin context. The executor schema-validates this artifact and forces BLOCKED-HARNESS if it is missing, invalid, or omitted from final findings.`;
  const controlLine = `Mandatory runtime control: append compact sanitized JSON lines to ${progressFile}. Use only keys kind, stage, role, status, and note; never include URLs with tickets, cookies, headers, provider bodies, or personal data. Treat each runbook F-/T- row as the progress unit, not an entire numbered section. Every browser_exec code block MUST begin by appending a STARTED row heartbeat before any navigation, wait, probe, screenshot, or action, and MUST append that row's PASS, FAIL, NA, or BLOCKED result before it returns. Put both writes inside the same browser_exec code block as the browser work; if the browser call fails, its STARTED line must already exist. Also append after every role switch and final report write. Each probe/action must settle within 15 seconds. Permit one action attempt and at most one passive reprobe per row; never try alternate click, key, fill, or JavaScript methods for the same control. If a precondition is absent, a slot is unavailable, or a UI action cannot settle, record NA or BLOCKED and immediately advance to the next row. Immediately after each role authenticates, set its required persona locale once before that role's checks; for a native select, use one value-set plus bubbled change event (the browser-automation equivalent of selecting an option), then one passive reprobe. If it does not settle, record BLOCKED and continue without another locale method; do not revisit locale until the final locale sweep. Never wait for a missing prerequisite, retry a normal product action, or spend more than 30 seconds on one row. Follow this fixed role order: student stages 2, admin stage 3, teacher stage 4, student stages 5-8, locale/mobile sweep. After F-2.16, switch to admin even if booking is unavailable; do not keep searching the calendar. For teacher F-4.2a, the note must be sanitized JSON with exactly the fields lessonStart, currentTime, windowStart, windowEnd, controlDisabled, and classification; record expected-disabled-outside-window before/after the window, enabled-inside-window inside it, and confirmed-product-finding only for an authenticated teacher with a valid upcoming booked event, no active lesson, settled data, an in-window current time, and controlDisabled=true. A non-rendered/stale/loading control is NA or BLOCKED, never a browser bug. If a role ticket or route fails, record the harness blocker and continue with the next role when possible.`;
  const prompt = mode === "smoke"
    ? `You are the low-cost text-only browser smoke walker for OmniClass.\nTarget: ${base}\nArtifacts: ${artifacts}\nRead the smoke contract in this prompt once. Do not use vision and do not capture screenshots. Use browser DOM/network/console probes only.\n\nChecks: anonymous /student, /teacher, and /admin redirect to authentication; after using the repository-supported login handoff only if needed, each role's root route resolves to its portal; inspect the five daily student surfaces /student, /student/lessons, /student/study, /student/calendar, /student/profile for pageerror/console error/request failure; scan hydrated text for raw message keys matching /^[A-Za-z]+\\.[\\w.]+$/; check document/body scrollWidth <= clientWidth. Record pass/fail/NA findings in ${join(artifacts, "findings.md")}, a compact count/verdict in ${join(artifacts, "visual-summary.md")}, and browser events in ${join(artifacts, "browser-events.json")}. Never print or store secrets. The process is complete when those files are written.`
    : `You are the runtime browser walker for OmniClass. Run mode=${mode}, persona=${persona}, target=${base}.\nLoad the attached runbook exactly once from ${runbook}. It is the only behavioral instruction list. Execute every stage and every binary PROBE / EXPECT / RECORD / SHOT row. Keep three isolated persistent browser contexts (student, admin, teacher), consuming each private Clerk ticket once.\n\nPrivate ticket handoff files (read only to navigate; never echo, screenshot, paste into findings, or store their URL):\n${ticketLines}\n${fixtureLine}\n\n${setupLine} ${stateAdaptiveLine} ${bookingEvidenceLine} In every branch, record the literal visible batchConflicts text and the Confirm booking button's disabled state. ${controlLine} Use real product UI actions. Use fixtures/e2e/lesson-fixture.wav for routine Soniox upload only when the runbook state makes that applicable; real-session replaces it with the human microphone step. Use one bounded retry only for a hard Soniox/OpenRouter outage, then WARN-degraded. Use DOM/CSS probes before vision; send only the six runbook shots marked [VISION] to the eye, plus a failure slot when escalation is warranted, and obey the 24-image budget. Do not fix code.\n\nWrite the final sanitized report directly to:\n- ${join(artifacts, "findings.md")}\n- ${join(artifacts, "visual-summary.md")}\n- ${join(artifacts, "browser-events.json")}\n- ${bookingEvidenceFile}\n- PNG evidence under ${join(artifacts, "screenshots")}\n- ${join(artifacts, "summary.json")} with numeric shots, visionShots, tokens when available, and verdict\nKeep screenshots <=24. Never include Clerk tickets, cookies, authorization headers, API keys, provider response bodies, or connection strings. Return only a sanitized completion line after the artifact files are written.`;
  const file = join(artifacts, "runtime-prompt.md");
  writeFileSync(file, `${prompt}\n`, { mode: 0o600 });
  return file;
}

function fixtureOrganizationId() {
  if (process.env.E2E_FIXTURES_ENABLED !== "true") {
    throw new Error("E2E_FIXTURES_ENABLED must equal true for a walk");
  }
  const organizationId = process.env.E2E_ORGANIZATION_ID?.trim();
  if (!organizationId) throw new Error("E2E_ORGANIZATION_ID is required for a walk");
  if (organizationId === LAUNCH_ORG) throw new Error("Refusing to prepare the launch organization");
  if (process.env.E2E_DEDICATED_ORGANIZATION_ID?.trim() !== organizationId) {
    throw new Error("E2E_DEDICATED_ORGANIZATION_ID must match the verified dedicated E2E organization");
  }
  if (process.env.E2E_DEDICATED_ORGANIZATION_AUTH !== "verified") {
    throw new Error("E2E_DEDICATED_ORGANIZATION_AUTH=verified is required for a fixture walk");
  }
  return organizationId;
}

function assertNormalUseBase(base) {
  let url;
  try {
    url = new URL(base);
  } catch {
    throw new Error("Normal-use mode requires an explicit localhost/dev base URL or the exact approved test deployment");
  }
  const localhost = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  const approvedTestDeployment =
    url.protocol === "https:" &&
    url.hostname === "next-js-omni-class.vercel.app" &&
    (url.pathname === "" || url.pathname === "/") &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password;
  if (!localhost && !approvedTestDeployment) {
    throw new Error("Normal-use mode refuses non-localhost targets except the exact approved test deployment https://next-js-omni-class.vercel.app");
  }
}

function parseConvexResult(value, functionName) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    throw new Error(`Fixture ${functionName} returned invalid JSON`);
  }
}

function invokeFixtureFunction(functionName, args) {
  const runTargetArgs = process.env.E2E_CONVEX_TARGET === "dev" ? [] : ["--prod"];
  const convexBin = process.env.E2E_CONVEX_BIN || (existsSync(join(ROOT, "node_modules/.bin/convex")) ? join(ROOT, "node_modules/.bin/convex") : "npx");
  const convexArgs = convexBin === "npx"
    ? ["convex", "run", functionName, JSON.stringify(args), ...runTargetArgs]
    : ["run", functionName, JSON.stringify(args), ...runTargetArgs];
  const result = spawnSync(convexBin, convexArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  if (result.status !== 0) {
    const message = redact(result.stderr || result.stdout, [args.organizationId]);
    throw new Error(`Fixture ${functionName} failed: ${message.trim().slice(-500)}`);
  }
  return parseConvexResult(result.stdout, functionName);
}

function verifyFixtureBookingPrerequisite(provisioned, snapshot) {
  const grantId = provisioned?.ids?.trialGrant;
  const grants = Array.isArray(snapshot?.billing?.grants) ? snapshot.billing.grants : [];
  const grant = grants.find((candidate) => candidate?.id === grantId);
  const balance = snapshot?.billing?.balance;
  if (
    !grantId ||
    grant?.source !== "trial" ||
    !Number.isFinite(grant?.remaining) ||
    grant.remaining < 1 ||
    !Number.isFinite(balance) ||
    balance < 1
  ) {
    throw new Error("Fixture booking blocked: usable non-purchase trial credit was not verified");
  }
  return {
    status: "verified",
    grantSource: grant.source,
    grantRemaining: grant.remaining,
    balance,
  };
}

function runFixture(persona, fixtureKey, actorPayloads, options = {}) {
  const organizationId = fixtureOrganizationId();
  const bookingDate = process.env.E2E_BOOKING_DATE || dateInDays(1);
  const startTime = process.env.E2E_BOOKING_START || "18:00";
  const endTime = process.env.E2E_BOOKING_END || "19:00";
  const args = {
    organizationId,
    fixtureKey,
    persona,
    booking: { date: bookingDate, startTime, endTime },
    actors: {
      student: { externalId: actorPayloads.student.userId, email: actorPayloads.student.email, name: `E2E ${persona} Student` },
      teacher: { externalId: actorPayloads.teacher.userId, email: actorPayloads.teacher.email, name: "E2E Teacher" },
      admin: { externalId: actorPayloads.admin.userId, email: actorPayloads.admin.email, name: "E2E Admin" },
    },
    teacherMeetLink: process.env.E2E_TEACHER_MEET_LINK || "https://meet.google.com/lookup/omniclass-e2e",
  };
  const invoke = options.invoke || invokeFixtureFunction;
  const provisioned = parseConvexResult(
    invoke("e2eFixtures:provisionStudentLoop", args),
    "e2eFixtures:provisionStudentLoop",
  );
  const snapshot = parseConvexResult(
    invoke("e2eFixtures:snapshotStudentLoop", { organizationId, fixtureKey }),
    "e2eFixtures:snapshotStudentLoop",
  );
  const bookingPrerequisite = verifyFixtureBookingPrerequisite(provisioned, snapshot);
  return { args, bookingPrerequisite };
}

function screenshotFiles(artifacts) {
  try {
    return readdirSync(join(artifacts, "screenshots"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function hermesSessionMarker(row) {
  if (!row) return "";
  return [row.id, row.last_activity_at, row.message_count, row.tool_call_count].join(":");
}

function createActivityTracker(initialMarker, now = Date.now) {
  let marker = initialMarker;
  let lastActivity = now();
  return {
    observe(nextMarker) {
      if (nextMarker === marker) return false;
      marker = nextMarker;
      lastActivity = now();
      return true;
    },
    isIdle(timeoutMs) {
      return now() - lastActivity >= timeoutMs;
    },
  };
}

async function createHermesActivityProbe(runtimeTitle, options = {}) {
  let database;
  try {
    const stateDb = options.stateDb || join(process.env.HERMES_HOME || join(homedir(), ".hermes"), "state.db");
    if (!existsSync(stateDb)) throw new Error("Hermes state database is unavailable");
    if (options.openDatabase) {
      database = await options.openDatabase(stateDb);
    } else {
      const { DatabaseSync } = await import("node:sqlite");
      database = new DatabaseSync(stateDb, { readOnly: true });
    }
    const statement = database.prepare(
      "SELECT id, last_activity_at, message_count, tool_call_count FROM sessions WHERE title = ? ORDER BY started_at DESC LIMIT 1",
    );
    return {
      marker() {
        try {
          return hermesSessionMarker(statement.get(runtimeTitle));
        } catch {
          return "";
        }
      },
      close() {
        try { database.close(); } catch { /* already closed */ }
      },
    };
  } catch {
    try { database?.close(); } catch { /* unavailable */ }
    // Node 20 has no node:sqlite. Artifact heartbeats remain the safe fallback.
    return { marker: () => "", close: () => {} };
  }
}

function updateSummary(artifacts, mode, runtimeStatus, reportFinalized, verdictOverride, bookingValidation) {
  let existing = {};
  try {
    existing = JSON.parse(readFileSync(join(artifacts, "summary.json"), "utf8"));
  } catch {
    // Keep a valid summary even if the runtime agent did not write one.
  }
  const numeric = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const verdict = verdictOverride || (typeof existing.verdict === "string" && existing.verdict.length <= 32 ? existing.verdict : "pending");
  writeFileSync(
    join(artifacts, "summary.json"),
    `${JSON.stringify({
      mode,
      shots: screenshotFiles(artifacts).length,
      visionShots: numeric(existing.visionShots) ?? 0,
      tokens: numeric(existing.tokens),
      verdict,
      runtimeStatus,
      reportFinalized,
      browserEventsFinalized: true,
      bookingEvidenceValidated: bookingValidation.ok,
      bookingEvidenceErrors: bookingValidation.errors,
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

async function startRuntime(promptFile, mode, artifacts) {
  const binary = process.env.E2E_RUNTIME_AGENT_BIN || "hermes";
  const runtimeTitle = `OmniClass E2E ${basename(artifacts)}`;
  const runtimeActivity = await createHermesActivityProbe(runtimeTitle);
  const args = [
    "chat", "--query-file", promptFile,
    "--continue", runtimeTitle, "--create-if-missing", "--no-restore-cwd",
    "--skills", "dogfood", "--reasoning", process.env.E2E_WALKER_REASONING || "medium",
    "--max-turns", mode === "real-session" ? "260" : mode === "smoke" ? "80" : "220",
    "--source", "tool",
  ];
  if (process.env.E2E_WALKER_PROVIDER) args.push("--provider", process.env.E2E_WALKER_PROVIDER);
  if (process.env.E2E_WALKER_MODEL) args.push("--model", process.env.E2E_WALKER_MODEL);
  if (process.env.E2E_RUNTIME_YOLO === "true") args.push("--yolo");
  const child = spawn(binary, args, { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const output = [];
  let spawnError = null;
  let budgetExceeded = false;
  let closed = false;
  let closeResult;
  let resolveCompletion;
  const idleTimeoutMs = boundedMs("E2E_RUNTIME_IDLE_TIMEOUT_MS", 120_000, 30_000, 300_000);
  let idleExceeded = false;
  let runtimeOutputVersion = 0;
  const completion = new Promise((resolvePromise) => {
    resolveCompletion = resolvePromise;
  });
  const activityMarker = () => {
    let progressMtime = 0;
    try { progressMtime = statSync(join(artifacts, "progress.ndjson")).mtimeMs; } catch { /* not written yet */ }
    return `${screenshotFiles(artifacts).join("|")}::${progressMtime}::${runtimeOutputVersion}::${runtimeActivity.marker()}`;
  };
  const activityTracker = createActivityTracker(activityMarker());
  const killGroup = (signal) => {
    if (closed || !child.pid) return;
    try {
      process.kill(-child.pid, signal);
    } catch {
      try { child.kill(signal); } catch { /* already gone */ }
    }
  };
  const idleTimer = setInterval(() => {
    const marker = activityMarker();
    activityTracker.observe(marker);
    if (!idleExceeded && activityTracker.isIdle(idleTimeoutMs)) {
      idleExceeded = true;
      killGroup("SIGTERM");
    }
  }, 1000);
  const budgetTimer = setInterval(() => {
    const files = screenshotFiles(artifacts);
    if (files.length <= 24 || budgetExceeded) return;
    budgetExceeded = true;
    for (const extra of files.slice(24)) {
      rmSync(join(artifacts, "screenshots", extra), { force: true });
    }
    killGroup("SIGTERM");
  }, 100);
  child.stdout.on("data", (chunk) => {
    runtimeOutputVersion += 1;
    output.push(redact(chunk.toString()));
  });
  child.stderr.on("data", (chunk) => {
    runtimeOutputVersion += 1;
    output.push(redact(chunk.toString()));
  });
  child.on("error", (error) => {
    spawnError = error;
  });
  child.on("close", (code, signal) => {
    closed = true;
    clearInterval(idleTimer);
    clearInterval(budgetTimer);
    runtimeActivity.close();
    closeResult = { code, signal };
    resolveCompletion(closeResult);
  });
  return {
    child,
    completion,
    getSpawnError: () => spawnError,
    getCloseResult: () => closeResult,
    getBudgetExceeded: () => budgetExceeded,
    getIdleExceeded: () => idleExceeded,
    getIdleTimeoutMs: () => idleTimeoutMs,
    stop: () => killGroup("SIGTERM"),
    forceStop: () => {
      killGroup("SIGKILL");
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
    },
    output: () => output.join("").slice(-4000),
  };
}

function boundedMs(name, fallback, minimum, maximum) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

async function waitForRuntime(runtime) {
  const timeoutMs = boundedMs("E2E_RUNTIME_TIMEOUT_MS", 900_000, 30_000, 900_000);
  const graceMs = boundedMs("E2E_RUNTIME_KILL_GRACE_MS", 10_000, 1_000, 30_000);
  let timeoutHandle;
  const timeout = new Promise((resolvePromise) => {
    timeoutHandle = setTimeout(() => resolvePromise({ timedOut: true }), timeoutMs);
  });
  const result = await Promise.race([
    runtime.completion.then((closeResult) => ({ timedOut: false, closeResult })),
    timeout,
  ]);
  clearTimeout(timeoutHandle);
  if (!result.timedOut) return { ...result, timeoutMs, graceMs };

  runtime.stop();
  const afterGrace = await Promise.race([
    runtime.completion.then((closeResult) => ({ closed: true, closeResult })),
    new Promise((resolvePromise) => setTimeout(() => resolvePromise({ closed: false }), graceMs)),
  ]);
  if (!afterGrace.closed) runtime.forceStop();
  return { timedOut: true, closed: afterGrace.closed, timeoutMs, graceMs };
}

function initializeBookingEvidence(artifacts, mode, normalUse, fixturePrerequisite) {
  if (mode === "smoke") return;
  if (!normalUse && fixturePrerequisite?.status !== "verified") {
    throw new Error("Cannot initialize booking evidence without a verified fixture prerequisite");
  }
  const evidence = {
    schemaVersion: 1,
    mode,
    fixturePrerequisite: normalUse ? { status: "not-applicable" } : fixturePrerequisite,
    balance: { state: "pending", value: null, visibleText: "" },
    booking: {
      status: "pending",
      slotAttempted: false,
      confirmationAttempted: false,
      batchConflictsText: "",
      confirmDisabled: null,
    },
    adminHandoffAttempted: false,
  };
  writeFileSync(join(artifacts, "booking-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}

function fixturePrerequisiteIssues(actual, expected) {
  const requiredKeys = ["status", "grantSource", "grantRemaining", "balance"];
  if (!expected || expected.status !== "verified") {
    return ["fixture-backed booking prerequisite must be executor-verified"];
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    return ["runtime fixturePrerequisite must preserve the executor-verified fixture prerequisite"];
  }
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    return ["runtime fixturePrerequisite must preserve the executor-verified fixture prerequisite exactly"];
  }
  const mismatches = requiredKeys.filter((key) => actual[key] !== expected[key]);
  return mismatches.length === 0
    ? []
    : [`runtime fixturePrerequisite must preserve the executor-verified fixture prerequisite (mismatch: ${mismatches.join(", ")})`];
}

function validateBookingEvidence(evidence, context) {
  if (context.mode === "smoke") return { ok: true, errors: [] };
  const errors = [];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { ok: false, errors: ["booking-evidence.json must contain an object"] };
  }
  if (evidence.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  if (evidence.mode !== context.mode) errors.push(`mode must equal ${context.mode}`);

  const fixtureStatus = evidence.fixturePrerequisite?.status;
  if (context.normalUse) {
    if (fixtureStatus !== "not-applicable") {
      errors.push("normal-use fixturePrerequisite.status must be not-applicable");
    }
  } else {
    errors.push(...fixturePrerequisiteIssues(evidence.fixturePrerequisite, context.fixturePrerequisite));
  }

  const balance = evidence.balance;
  const balanceStates = new Set(["settled-zero", "settled-positive", "loading-or-unknown"]);
  if (!balance || typeof balance !== "object") {
    errors.push("balance evidence is required");
  } else {
    if (!balanceStates.has(balance.state)) errors.push("balance.state is invalid");
    if (typeof balance.visibleText !== "string" || !balance.visibleText.trim()) {
      errors.push("balance.visibleText must contain literal UI evidence");
    }
    if (balance.state === "settled-zero" && balance.value !== 0) {
      errors.push("settled-zero requires value 0");
    }
    if (balance.state === "settled-positive" && (!Number.isFinite(balance.value) || balance.value <= 0)) {
      errors.push("settled-positive requires a numeric value greater than 0");
    }
    if (balance.state === "loading-or-unknown" && balance.value !== null) {
      errors.push("loading-or-unknown requires value null");
    }
  }

  const booking = evidence.booking;
  if (!booking || typeof booking !== "object") {
    errors.push("booking evidence is required");
  } else {
    if (!new Set(["PASS", "FAIL", "NA", "BLOCKED"]).has(booking.status)) {
      errors.push("booking.status is invalid");
    }
    if (typeof booking.slotAttempted !== "boolean") errors.push("booking.slotAttempted must be boolean");
    if (typeof booking.confirmationAttempted !== "boolean") errors.push("booking.confirmationAttempted must be boolean");
    if (typeof booking.batchConflictsText !== "string" || !booking.batchConflictsText.trim()) {
      errors.push("booking.batchConflictsText must contain literal text or an explicit absence marker");
    }
    if (typeof booking.confirmDisabled !== "boolean" && booking.confirmDisabled !== "not-rendered") {
      errors.push("booking.confirmDisabled must be true, false, or not-rendered");
    }
    const preflightBlocked = ["settled-zero", "loading-or-unknown"].includes(balance?.state);
    const staged = booking.slotAttempted === true;
    const confirmed = booking.confirmationAttempted === true;
    if (confirmed && !staged) {
      errors.push("booking confirmation requires a staged slot attempt");
    }
    if (staged && (booking.batchConflictsText === "<not-rendered>" || booking.confirmDisabled === "not-rendered")) {
      errors.push("staged booking requires rendered conflict and button evidence");
    }
    if (confirmed && booking.confirmDisabled !== false) {
      errors.push("booking confirmation requires an enabled Confirm booking button");
    }
    if (booking.status === "PASS" && (!staged || !confirmed)) {
      errors.push("PASS booking evidence requires slot and confirmation attempts");
    }
    if (preflightBlocked) {
      if (booking.slotAttempted || booking.confirmationAttempted) {
        errors.push(`${balance.state} must not attempt booking or confirmation`);
      }
      if (!new Set(["NA", "BLOCKED"]).has(booking.status)) {
        errors.push(`${balance.state} must record booking as NA or BLOCKED`);
      }
      if (booking.batchConflictsText !== "<not-rendered>" || booking.confirmDisabled !== "not-rendered") {
        errors.push("preflight-blocked booking evidence must be not-rendered");
      }
    }
  }
  if (evidence.adminHandoffAttempted !== true) {
    errors.push("adminHandoffAttempted must be true");
  }
  return { ok: errors.length === 0, errors };
}

function reportIsFinalized(artifacts) {
  try {
    const findings = readFileSync(join(artifacts, "findings.md"), "utf8");
    const visual = readFileSync(join(artifacts, "visual-summary.md"), "utf8");
    return !findings.includes("verdict: pending") && !visual.includes("verdict: pending") &&
      /(?:SHIP|FIX-N-TEST|BLOCKED-HARNESS)/.test(`${findings}\n${visual}`);
  } catch {
    return false;
  }
}

function progressRecords(artifacts) {
  try {
    return readFileSync(join(artifacts, "progress.ndjson"), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const record = JSON.parse(line);
          if (!record || typeof record !== "object") return [];
          const safe = {};
          for (const key of ["kind", "stage", "role", "status", "note"]) {
            if (typeof record[key] === "string") safe[key] = redact(record[key]).slice(0, 160);
          }
          return [safe];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function readJsonArtifact(artifacts, name) {
  try {
    return JSON.parse(readFileSync(join(artifacts, name), "utf8"));
  } catch {
    return null;
  }
}

function withoutFinalVerdict(value) {
  return value
    .replace(/^\s*-\s*verdict:\s*.*$/gim, "")
    .replace(/^\s*VERDICT:\s*.*$/gm, "")
    .trimEnd();
}

function appendBookingEvidenceBlocker(artifacts, persona, validation) {
  const locale = persona === "Russian" ? "ru" : persona === "Kazakh" ? "kk" : persona === "Arabic" ? "ar" : "staff";
  const errors = validation.errors.map((error) => redact(error)).join("; ");
  const findings = withoutFinalVerdict(readFileSync(join(artifacts, "findings.md"), "utf8"));
  const visual = withoutFinalVerdict(readFileSync(join(artifacts, "visual-summary.md"), "utf8"));
  writeFileSync(
    join(artifacts, "findings.md"),
    `${findings}\n\n## Harness evidence validation\n\n- severity: S1\n  stage: student\n  locale: ${locale}\n  what: Required booking preflight evidence is missing or invalid.\n  expected: booking-evidence.json distinguishes a settled zero balance from loading/unknown, proves blocked branches did not attempt booking, captures literal batch-conflict text and the Confirm booking disabled state, and records the admin handoff.\n  evidence: booking-evidence.json; ${errors}\n  class: harness\n\nNo product booking result is accepted from incomplete harness evidence.\n\nVERDICT: BLOCKED-HARNESS\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    join(artifacts, "visual-summary.md"),
    `${visual}\n\n- booking evidence: BLOCKED-HARNESS · ${errors}\n\nVERDICT: BLOCKED-HARNESS\n`,
    { mode: 0o600 },
  );
}

function appendBookingEvidenceResult(artifacts, evidence) {
  const summary = readJsonArtifact(artifacts, "summary.json");
  const verdict = new Set(["SHIP", "FIX-N-TEST", "BLOCKED-HARNESS"]).has(summary?.verdict)
    ? summary.verdict
    : "BLOCKED-HARNESS";
  const findings = withoutFinalVerdict(readFileSync(join(artifacts, "findings.md"), "utf8"));
  const visual = withoutFinalVerdict(readFileSync(join(artifacts, "visual-summary.md"), "utf8"));
  const balanceText = redact(evidence.balance.visibleText).slice(0, 160);
  const conflictText = redact(evidence.booking.batchConflictsText).slice(0, 160);
  const lines = [
    "## Booking preflight evidence",
    "",
    "- schema validation: PASS",
    `- fixturePrerequisite: ${evidence.fixturePrerequisite.status}`,
    `- balance: ${evidence.balance.state} · value=${evidence.balance.value === null ? "null" : evidence.balance.value} · text=${balanceText}`,
    `- booking: ${evidence.booking.status} · slotAttempted=${evidence.booking.slotAttempted} · confirmationAttempted=${evidence.booking.confirmationAttempted}`,
    `- batchConflictsText: ${conflictText}`,
    `- confirmDisabled: ${evidence.booking.confirmDisabled}`,
    `- adminHandoffAttempted: ${evidence.adminHandoffAttempted}`,
  ].join("\n");
  writeFileSync(join(artifacts, "findings.md"), `${findings}\n\n${lines}\n\nVERDICT: ${verdict}\n`, { mode: 0o600 });
  writeFileSync(join(artifacts, "visual-summary.md"), `${visual}\n\n- booking evidence: PASS · ${evidence.balance.state} · booking=${evidence.booking.status}\n\nVERDICT: ${verdict}\n`, { mode: 0o600 });
}

function finalizeArtifacts({ artifacts, mode, persona, base, normalUse, runtimeStatus, runtimeStarted, fixturePrerequisite = null }) {
  const screenshots = screenshotFiles(artifacts);
  const progress = progressRecords(artifacts);
  const bookingEvidence = readJsonArtifact(artifacts, "booking-evidence.json");
  const bookingValidation = validateBookingEvidence(bookingEvidence, { mode, normalUse, fixturePrerequisite });
  const alreadyFinalized = reportIsFinalized(artifacts);
  if (!alreadyFinalized) {
    const evidence = screenshots.length ? screenshots.map((name) => `- screenshots/${name}`).join("\n") : "- none";
    const progressEvidence = progress.length
      ? progress.map((record) => `- ${record.kind || "progress"} · stage ${record.stage || "?"} · ${record.role || "?"} · ${record.status || "?"}`).join("\n")
      : "- none";
    const blocker = runtimeStarted
      ? "The runtime did not finalize its standardized report before bounded shutdown."
      : "The runtime could not be started or the walk failed during setup.";
    writeFileSync(join(artifacts, "findings.md"), `OmniClass runtime walk findings\n\n- mode: ${mode}\n- persona: ${persona}\n- target: ${base}\n- execution: ${normalUse ? "normal-use existing tenant; no fixtures" : "fixture-backed"}\n- verdict: BLOCKED-HARNESS\n\n## Coverage reached\n\nEvidence files present at bounded shutdown:\n${evidence}\n\nProgress records captured before shutdown:\n${progressEvidence}\n\n## Harness finding\n\n- severity: High\n- stage: runtime/report finalization\n- locale: ${persona}\n- what: ${blocker}\n- expected: The runtime completes its binary records, browser-event collection, sanitized report, and final verdict within the executor timeout.\n- evidence: runtime-status.txt; summary.json; browser-events.json; progress.ndjson; screenshots/\n- class: Harness/runtime blocker\n\n## Product findings\n\nNo product bug is asserted from incomplete evidence. Screenshots and partial browser events are retained for a separate bug-hunting pass.\n\n## Safety record\n\nNo fixture provisioning, reset, delete, seed, raw backend mutation, production change, payment, or credential change was performed by the executor.\n`, { mode: 0o600 });
    writeFileSync(join(artifacts, "visual-summary.md"), `OmniClass runtime walk visual summary\n\n- mode: ${mode}\n- persona: ${persona}\n- target: ${base}\n- screenshots: ${screenshots.length} / 24\n- visual shortlist result: not finalized by runtime walker\n- verdict: BLOCKED-HARNESS\n\nThe runtime report was finalized by the executor after bounded shutdown. No product pass/fail claim is made from incomplete evidence.\n`, { mode: 0o600 });
  } else if (!bookingValidation.ok) {
    appendBookingEvidenceBlocker(artifacts, persona, bookingValidation);
  } else if (mode !== "smoke") {
    appendBookingEvidenceResult(artifacts, bookingEvidence);
  }

  let eventDocument = { mode, events: [] };
  try {
    const existing = JSON.parse(readFileSync(join(artifacts, "browser-events.json"), "utf8"));
    if (existing && !Array.isArray(existing)) eventDocument = existing;
    if (Array.isArray(existing)) eventDocument.events = existing;
  } catch {
    // The executor writes a valid sanitized event document below.
  }
  if (!Array.isArray(eventDocument.events)) eventDocument.events = [];
  eventDocument.mode = mode;
  eventDocument.persona = persona;
  eventDocument.target = base;
  eventDocument.sanitized = true;
  for (const record of progress) {
    eventDocument.events.push({ source: "progress.ndjson", progressKind: record.kind, ...record, kind: "runtime_progress" });
  }
  eventDocument.events.push({
    kind: "executor_finalization",
    status: runtimeStatus,
    report_finalized: true,
    runtime_started: runtimeStarted,
    screenshots: screenshots.length,
    booking_evidence_validated: bookingValidation.ok,
    booking_evidence_errors: bookingValidation.errors,
  });
  writeFileSync(join(artifacts, "browser-events.json"), `${JSON.stringify(eventDocument, null, 2)}\n`, { mode: 0o600 });
  appendFileSync(join(artifacts, "progress.ndjson"), `${JSON.stringify({ kind: "executor_finalization", status: runtimeStatus, screenshots: screenshots.length, bookingEvidenceValidated: bookingValidation.ok })}\n`);
  const verdict = alreadyFinalized && bookingValidation.ok ? undefined : "BLOCKED-HARNESS";
  updateSummary(artifacts, mode, runtimeStatus, true, verdict, bookingValidation);
  writeFileSync(join(artifacts, "runtime-status.txt"), `${runtimeStatus}\n`, { mode: 0o600 });
}

async function main(argv) {
  const mode = argv[0] || "walk";
  if (!MODES.has(mode)) throw new Error(`Unknown mode ${mode}; use walk, real-session, or smoke`);
  const persona = valueAfter(argv, "--persona") || "Russian";
  const normalUse = argv.includes("--normal-use");
  if (normalUse && mode !== "walk") throw new Error("--normal-use is supported only with walk mode");
  if (mode !== "smoke" && !PERSONAS.has(persona)) throw new Error("--persona must be Russian, Kazakh, or Arabic");
  const base = valueAfter(argv, "--base") || process.env.E2E_BASE_URL || "https://next-js-omni-class.vercel.app";
  if (normalUse) assertNormalUseBase(base);
  const run = runId();
  const artifacts = ensureArtifacts(mode, run);
  const privateDir = mkdtempSync(join(tmpdir(), "omniclass-e2e-"));
  chmodSync(privateDir, 0o700);
  const ticketFiles = {};
  let fixtureFile;
  let fixturePrerequisite = null;
  let runtime;
  let runtimeStarted = false;
  let runtimeStatus = "executor setup failed";
  let fatalError;
  try {
    const fixtureKey = process.env.E2E_FIXTURE_KEY || `${persona.toLowerCase()}-${run}`;
    const payloads = {};
    if (mode !== "smoke") {
      if (!normalUse) fixtureOrganizationId();
      for (const role of ["student", "admin", "teacher"]) {
        const payload = await mintLoginUrl(role, { base });
        payloads[role] = payload;
        const path = join(privateDir, `${role}.json`);
        writeFileSync(path, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
        chmodSync(path, 0o600);
        ticketFiles[role] = path;
      }
      if (!normalUse) {
        const fixture = runFixture(persona, fixtureKey, payloads);
        fixturePrerequisite = fixture.bookingPrerequisite;
        fixtureFile = join(artifacts, "fixture-result.json");
        writeFileSync(
          fixtureFile,
          `${JSON.stringify({ fixtureKey, provisioned: true, bookingPrerequisite: fixturePrerequisite }, null, 2)}\n`,
          { mode: 0o600 },
        );
      }
    }
    initializeBookingEvidence(artifacts, mode, normalUse, fixturePrerequisite);
    const promptFile = writePrompt(artifacts, mode, persona, base, ticketFiles, fixtureFile, normalUse);
    runtime = await startRuntime(promptFile, mode, artifacts);
    runtimeStarted = true;
    process.stdout.write(`started mode=${mode} normalUse=${normalUse} run=${run} artifacts=${artifacts}\n`);
    const outcome = await waitForRuntime(runtime);
    if (outcome.timedOut) {
      runtimeStatus = `stopped after ${outcome.timeoutMs}ms runtime timeout; report finalized by executor`;
    } else if (runtime.getSpawnError()) {
      runtimeStatus = `spawn-error: ${redact(runtime.getSpawnError().message)}`;
      fatalError = new Error("Runtime agent could not start");
    } else if (runtime.getIdleExceeded()) {
      runtimeStatus = `stopped after ${runtime.getIdleTimeoutMs()}ms without progress heartbeat or new evidence; report finalized by executor`;
    } else if (runtime.getBudgetExceeded()) {
      runtimeStatus = "stopped after screenshot budget exceeded; report finalized by executor";
    } else {
      const closeResult = outcome.closeResult || runtime.getCloseResult() || {};
      runtimeStatus = closeResult.code === 0
        ? "finished; executor finalized report and browser events"
        : `closed code=${closeResult.code ?? "null"} signal=${closeResult.signal ?? "none"}; executor finalized report and browser events`;
    }
  } catch (error) {
    fatalError = error instanceof Error ? error : new Error("E2E runner failed");
    runtimeStatus = `executor setup failure: ${redact(fatalError.message)}`;
  } finally {
    rmSync(privateDir, { recursive: true, force: true });
    finalizeArtifacts({ artifacts, mode, persona, base, normalUse, runtimeStatus, runtimeStarted, fixturePrerequisite });
  }
  if (fatalError) throw fatalError;
  // Functional findings belong in the report, not in the executor exit code.
}

export { createActivityTracker, createHermesActivityProbe, finalizeArtifacts, hermesSessionMarker, initializeBookingEvidence, reportIsFinalized, runFixture, validateBookingEvidence, verifyFixtureBookingPrerequisite, writePrompt };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "E2E runner failed"}\n`);
    process.exitCode = 1;
  });
}
