import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const manifestPath = resolve(root, '.qa/accounts.json');
export const devDeployment = 'dev:quixotic-quail-572';
export const devUrl = 'https://quixotic-quail-572.convex.cloud';
export const actors = Object.freeze([
  { key: 'admin', role: 'admin', locale: 'en', email: 'qa-admin+omniclass@example.com', name: 'QA Admin' },
  { key: 'teacher', role: 'teacher', locale: 'en', email: 'qa-teacher+omniclass@example.com', name: 'QA Teacher' },
  { key: 'student', role: 'student', locale: 'ru', email: 'qa-student-ru+omniclass@example.com', name: 'QA Student Russian' },
  { key: 'student-kk', role: 'student', locale: 'kk', email: 'qa-student-kk+omniclass@example.com', name: 'QA Student Kazakh' },
]);
export function readEnv() {
  return Object.fromEntries(readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)
    .filter(line => /^\w+=/.test(line)).map(line => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')];
    }));
}
export function assertQaEnvironment(env, base = 'http://localhost:3000') {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('QA login requires a loopback URL');
  }
  if (['CONVEX_DEPLOY_KEY', 'CONVEX_SELF_HOSTED_URL', 'CONVEX_SELF_HOSTED_ADMIN_KEY'].some(key => env[key])) {
    throw new Error('QA refuses deployment-key or self-hosted overrides');
  }
  if (env.CONVEX_DEPLOYMENT !== devDeployment || env.NEXT_PUBLIC_CONVEX_URL !== devUrl ||
      !env.CLERK_SECRET_KEY?.startsWith('sk_test_') || !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_')) {
    throw new Error('QA requires the dedicated development Convex deployment and test Clerk keys');
  }
}
