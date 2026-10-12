import assert from 'node:assert/strict';
import test from 'node:test';
import { assertQaBackendEnvironment } from '../convex/lib/qaSafety.ts';
import { assertQaEnvironment, devDeployment, devUrl } from '../scripts/qa-config.mjs';
const env = { CONVEX_DEPLOYMENT: devDeployment, NEXT_PUBLIC_CONVEX_URL: devUrl, CLERK_SECRET_KEY: 'sk_test_fixture', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture' };
test('QA provisioning and login reject production, mismatched deployments and remote destinations', () => {
  assert.doesNotThrow(() => assertQaEnvironment(env));
  for (const replacement of [
    { CONVEX_DEPLOY_KEY: 'prod:fixture' },
    { CONVEX_SELF_HOSTED_URL: 'https://another.example' },
    { CONVEX_DEPLOYMENT: 'prod:valuable-loris-929' },
    { NEXT_PUBLIC_CONVEX_URL: 'https://valuable-loris-929.convex.cloud' },
    { CLERK_SECRET_KEY: 'sk_live_fixture' },
    { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_fixture' },
  ]) assert.throws(() => assertQaEnvironment({ ...env, ...replacement }));
  for (const base of ['https://omnicaenglish.com', 'https://localhost.evil.example', 'http://localhost@evil.example', 'ftp://localhost', 'http://localhost/sign-in']) {
    assert.throws(() => assertQaEnvironment(env, base));
  }
});
test('internal QA seeding refuses production and unknown backends even with development auth', () => {
  const issuer = 'https://qa-example.clerk.accounts.dev';
  assert.equal(assertQaBackendEnvironment(devUrl, issuer + '/'), issuer);
  for (const url of [undefined, 'https://valuable-loris-929.convex.cloud', 'https://another-dev.convex.cloud']) {
    assert.throws(() => assertQaBackendEnvironment(url, issuer));
  }
  for (const domain of [undefined, 'https://clerk.omnicaenglish.com', issuer + '.evil.example']) {
    assert.throws(() => assertQaBackendEnvironment(devUrl, domain));
  }
});
