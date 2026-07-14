#!/usr/bin/env node
// Dev-only: mint a Clerk sign-in token and print a URL that logs the
// browser straight into the app — no password. Used by AI assistants to
// inspect the UI as a given role.
//
//   node scripts/dev-login.mjs [teacher|admin|student] [--base http://localhost:3000]
//
// Requires CLERK_SECRET_KEY in .env.local (dev instance).

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROLE_EMAILS = {
  admin: "warp.smp@gmail.com",
  teacher: "mhd.mustafa.allahham@gmail.com",
  student: "mustafa.allham777@gmail.com",
};

const role = process.argv[2] ?? "teacher";
const baseFlag = process.argv.indexOf("--base");
const base = baseFlag > -1 ? process.argv[baseFlag + 1] : "http://localhost:3000";

const email = ROLE_EMAILS[role];
if (!email) {
  console.error(`Unknown role "${role}". Use: ${Object.keys(ROLE_EMAILS).join(" | ")}`);
  process.exit(1);
}

// Read CLERK_SECRET_KEY from .env.local without external deps
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(resolve(root, ".env.local"), "utf8");
const match = env.match(/^CLERK_SECRET_KEY=(.+)$/m);
if (!match) {
  console.error("CLERK_SECRET_KEY not found in .env.local");
  process.exit(1);
}
const secretKey = match[1].trim();

const headers = {
  Authorization: `Bearer ${secretKey}`,
  "Content-Type": "application/json",
};

// 1. Find the user by email
const usersRes = await fetch(
  `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
  { headers }
);
if (!usersRes.ok) {
  console.error(`Clerk users lookup failed (${usersRes.status}): ${await usersRes.text()}`);
  process.exit(1);
}
const users = await usersRes.json();
if (!users.length) {
  console.error(`No Clerk user with email ${email}`);
  process.exit(1);
}
const userId = users[0].id;

// 2. Mint a sign-in token (short-lived)
const tokenRes = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
  method: "POST",
  headers,
  body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
});
if (!tokenRes.ok) {
  console.error(`Sign-in token failed (${tokenRes.status}): ${await tokenRes.text()}`);
  process.exit(1);
}
const { token } = await tokenRes.json();

console.log(`role:  ${role} (${email})`);
console.log(`user:  ${userId}`);
console.log(`url:   ${base}/sign-in?__clerk_ticket=${token}`);
