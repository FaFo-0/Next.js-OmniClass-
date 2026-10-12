#!/usr/bin/env node
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { actors, assertQaEnvironment, manifestPath, readEnv, root, devDeployment } from './qa-config.mjs';

async function main() {
  const env = { ...readEnv(), ...process.env };
  assertQaEnvironment(env);
  const headers = { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' };
  async function clerk(path, body) {
    const response = await fetch(`https://api.clerk.com/v1/${path}`, {
      headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const codes = (details.errors ?? []).map(error => `${error.code}:${error.meta?.param_name ?? ''}`).join(', ');
      throw new Error(`Clerk QA provisioning failed (${response.status}; ${codes})`);
    }
    return response.json();
  }
  const accounts = [];
  for (const actor of actors) {
    const found = await clerk(`users?email_address=${encodeURIComponent(actor.email)}`);
    if (!Array.isArray(found) || found.length > 1) throw new Error('Ambiguous QA account');
    const user = found[0] ?? await clerk('users', {
      email_address: [actor.email], first_name: actor.name,
      skip_password_requirement: true,
    });
    accounts.push({ ...actor, externalId: user.id });
  }
  // Persist provisioned identities even if fixture setup fails; rerunning reuses them.
  mkdirSync(dirname(manifestPath), { recursive: true, mode: 0o700 });
  writeFileSync(manifestPath, JSON.stringify({ deployment: devDeployment, accounts }, null, 2), { mode: 0o600 });
  chmodSync(manifestPath, 0o600);
  const result = spawnSync('npx', ['convex', 'run', '--push', 'qa:seed', JSON.stringify({ accounts, replenish: process.argv.includes('--replenish') })], {
    cwd: root, env: { ...process.env, CONVEX_DEPLOYMENT: devDeployment }, encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || 'QA fixture setup failed\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(result.stdout);
  process.stdout.write('QA ready. Login: node scripts/dev-login.mjs admin|teacher|student|student-kk\n');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
