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
