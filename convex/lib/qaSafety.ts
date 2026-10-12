/** Hard stop for operator fixtures: never accept production or an unknown deployment. */
export function assertQaBackendEnvironment(cloudUrl: string | undefined, issuer: string | undefined) {
  if (cloudUrl !== 'https://quixotic-quail-572.convex.cloud') {
    throw new Error('QA fixtures are restricted to the designated development deployment');
  }
  if (!issuer || !/^https:\/\/[a-z0-9-]+\.clerk\.accounts\.dev\/?$/.test(issuer)) {
    throw new Error('QA requires development Clerk');
  }
  return issuer.replace(/\/$/, '');
}

/** Test Clerk may be shared with the live frontend; never enroll QA actors there. */
export function assertQaIdentityAllowed(email: string | undefined, cloudUrl: string | undefined) {
  if (/^qa-(admin|teacher|student-(ru|kk))\+omniclass@example\.com$/i.test(email ?? '') &&
      cloudUrl !== 'https://quixotic-quail-572.convex.cloud') {
    throw new Error('This QA account is restricted to the development platform');
  }
}
