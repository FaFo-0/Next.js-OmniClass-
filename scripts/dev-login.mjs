#!/usr/bin/env node
// Dev-only Clerk login handoff for browser QA.
//
//   node scripts/dev-login.mjs [teacher|admin|student] [--base URL] [--out FILE]
//
// The one-shot URL is written to a private file. It is never printed because a
// ticket in terminal history, logs, or screenshots is an authentication secret.

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROLE_EMAILS = Object.freeze({
  admin: "warp.smp@gmail.com",
  teacher: "mhd.mustafa.allahham@gmail.com",
  student: "mustafa.allham777@gmail.com",
});

function cleanBase(value) {
  const base = String(value || "http://localhost:3000").trim().replace(/\/$/, "");
  try {
    const url = new URL(base);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("Invalid --base URL");
  }
}

function envSecret(root) {
  let env;
  try {
    env = readFileSync(resolve(root, ".env.local"), "utf8");
  } catch {
    throw new Error("Login configuration is unavailable");
  }
  const line = env.split(/\r?\n/).find((candidate) => /^\s*CLERK_SECRET_KEY\s*=/.test(candidate));
  if (!line) throw new Error("Login configuration is unavailable");
  const value = line.replace(/^\s*CLERK_SECRET_KEY\s*=\s*/, "").trim().replace(/^(['"])(.*)\1$/, "$2");
  if (!value) throw new Error("Login configuration is unavailable");
  return value;
}

function safeHttpError(operation, status) {
  return new Error(`${operation} failed (${status})`);
}

async function clerkJson(url, options, operation) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error(`${operation} failed (network error)`);
  }
  if (!response.ok) throw safeHttpError(operation, response.status);
  try {
    return await response.json();
  } catch {
    throw new Error(`${operation} failed (invalid response)`);
  }
}

/**
 * Mint a real Clerk sign-in ticket for a configured dev role.
 * The returned URL must be handed to a browser through a private file only.
 */
export async function mintLoginUrl(role, { base = "http://localhost:3000" } = {}) {
  const email = ROLE_EMAILS[role];
  if (!email) throw new Error(`Unknown role "${role}". Use: ${Object.keys(ROLE_EMAILS).join(" | ")}`);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const secretKey = envSecret(root);
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  };
  const users = await clerkJson(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers },
    "Clerk user lookup",
  );
  if (!Array.isArray(users) || users.length === 0 || typeof users[0]?.id !== "string") {
    throw new Error("Configured dev login user was not found");
  }
  const userId = users[0].id;
  const tokenPayload = await clerkJson(
    "https://api.clerk.com/v1/sign_in_tokens",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
    },
    "Clerk sign-in ticket",
  );
  if (typeof tokenPayload?.token !== "string" || tokenPayload.token.length < 10) {
    throw new Error("Clerk sign-in ticket was not returned");
  }
  return {
    role,
    userId,
    email,
    url: `${cleanBase(base)}/sign-in?__clerk_ticket=${encodeURIComponent(tokenPayload.token)}`,
  };
}

async function privateHandoff(payload, requestedPath) {
  const dir = requestedPath ? dirname(resolve(requestedPath)) : await mkdtemp(join(tmpdir(), "omniclass-login-"));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = requestedPath ? resolve(requestedPath) : join(dir, `${payload.role}.json`);
  writeFileSync(file, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

async function main(argv) {
  const role = argv[0] ?? "teacher";
  const baseIndex = argv.indexOf("--base");
  const outIndex = argv.indexOf("--out");
  const base = baseIndex >= 0 ? argv[baseIndex + 1] : "http://localhost:3000";
  const requestedPath = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  if (outIndex >= 0 && !requestedPath) throw new Error("--out requires a private file path");
  const payload = await mintLoginUrl(role, { base });
  const file = await privateHandoff(payload, requestedPath);
  process.stdout.write(`role=${payload.role} ticket_file=${file}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : "Login handoff failed";
    process.stderr.write(`${message.replace(/__clerk_ticket[^\s]*/g, "__clerk_ticket=[REDACTED]")}\n`);
    process.exitCode = 1;
  });
}
