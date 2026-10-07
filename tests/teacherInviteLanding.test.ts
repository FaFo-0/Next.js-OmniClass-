import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(path: string, mocks: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in mocks, name); return mocks[name]; }, console: { warn() {} }, process: { env: { NEXT_PUBLIC_CONVEX_URL: "https://synthetic.invalid" } } });
  return exports;
}

function landing(status = "no_invite", ok = true, network = false, invite: { role: string; onboardingComplete: boolean } | undefined = undefined) {
  const auth = { isLoaded: false, isSignedIn: false, user: null as null | { role: string; onboardingComplete: boolean } };
  const clerk = { isLoaded: false, isSignedIn: false };
  const convexAuth = { isLoading: false, isAuthenticated: true };
  const calls = { fetch: 0, upsert: 0, routes: [] as string[] };
  const effects: Array<() => unknown> = [];
  const previousEffects: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  let effectCursor = 0;
  let retryClick: (() => void) | undefined;
  const states: unknown[] = [];
  let cursor = 0;
  const router = { replace: (path: string) => calls.routes.push(path) };
  const upsert = async () => { calls.upsert++; };
  const exports: Record<string, unknown> = {};
  const source = ts.transpileModule(readFileSync("src/app/onboarding/post-signup/page.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mocks: Record<string, unknown> = {
    "react": { useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
      const index = effectCursor++;
      const previous = previousEffects[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) effects.push(() => {
        previous?.cleanup?.();
        previousEffects[index] = { deps, cleanup: effect() };
      });
    }, useState: (initial: unknown) => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; } },
    "react/jsx-runtime": { jsx: (type: string, props: { onClick?: () => void }) => { if (type === "button") retryClick = props.onClick; }, jsxs() {} }, "convex/react": { useMutation: () => upsert, useConvexAuth: () => convexAuth }, "@clerk/nextjs": { useUser: () => clerk }, "@convex": { api: { users: { upsertFromAuth: {} } } },
    "next/navigation": { useRouter: () => router }, "@/lib/auth": { useAuth: () => auth }, "@/components/shared/BrandedLoading": { BrandedLoading() {} },
  };
  runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in mocks, name); return mocks[name]; }, console: { warn() {} }, fetch: async () => { calls.fetch++; if (network) throw new Error("offline"); return { ok, json: async () => ({ status, ...invite }) }; } });
  async function render() { cursor = 0; effectCursor = 0; effects.length = 0; (exports.default as () => unknown)(); for (const effect of effects) effect(); for (let i = 0; i < 10; i++) await Promise.resolve(); }
  return { auth, clerk, convexAuth, calls, render, retry: () => { assert.ok(retryClick, "retry button rendered"); retryClick(); } };
}

test("landing waits for loaded signed-in auth and resumes when readiness changes", async () => {
  const f = landing();
  await f.render();
  assert.equal(f.calls.fetch, 0);
  f.clerk.isLoaded = true;
  await f.render();
  assert.equal(f.calls.fetch, 0);
  f.clerk.isLoaded = false;
  f.clerk.isSignedIn = true;
  await f.render();
  assert.equal(f.calls.fetch, 0);
  f.clerk.isLoaded = true;
  await f.render();
  assert.equal(f.calls.fetch, 1);
  assert.equal(f.calls.upsert, 1);

});

test("Clerk-ready landing waits through Convex loading and unauthenticated states before provisioning", async () => {
  const f = landing();
  Object.assign(f.clerk, { isLoaded: true, isSignedIn: true });
  Object.assign(f.convexAuth, { isLoading: true, isAuthenticated: false });
  await f.render();
  assert.equal(f.calls.fetch, 0);
  assert.equal(f.calls.upsert, 0);
  f.convexAuth.isLoading = false;
  await f.render();
  assert.equal(f.calls.fetch, 0);
  assert.equal(f.calls.upsert, 0);
  f.convexAuth.isAuthenticated = true;
  await f.render();
  assert.equal(f.calls.fetch, 1);
  assert.equal(f.calls.upsert, 1);
});

for (const [role, onboardingComplete, destination] of [
  ["teacher", false, "/onboarding/teacher"],
  ["teacher", true, "/teacher"],
  ["admin", false, "/admin"],
] as const) test(`successful invite routes to ${destination} after Convex authentication`, async () => {
  const f = landing("ok", true, false, { role, onboardingComplete });
  Object.assign(f.clerk, { isLoaded: true, isSignedIn: true });
  Object.assign(f.convexAuth, { isLoading: true, isAuthenticated: false });
  await f.render();
  assert.equal(f.calls.fetch, 0);
  assert.deepEqual(f.calls.routes, []);
  f.convexAuth.isLoading = false;
  await f.render();
  assert.equal(f.calls.fetch, 0);
  f.convexAuth.isAuthenticated = true;
  await f.render();
  assert.equal(f.calls.fetch, 1);
  assert.equal(f.calls.upsert, 0);
  assert.deepEqual(f.calls.routes, [destination]);
});

for (const role of ["student", "teacher", "admin"]) test(`definitive invalid invite falls back to completed ${role} destination`, async () => {
  const f = landing("invalid_invite", false);
  Object.assign(f.clerk, { isLoaded: true, isSignedIn: true });
  Object.assign(f.auth, { isLoaded: true, user: { role, onboardingComplete: true } });
  await f.render();
  assert.equal(f.calls.upsert, 1);
  await f.render();
  assert.ok(f.calls.routes.includes(`/${role}`));
});

for (const [label, status, network] of [["auth", "auth_required", false], ["transient", "retryable_error", false], ["network", "", true]] as const) test(`${label} failure never provisions and can retry`, async () => {
  const f = landing(status, false, network);
  Object.assign(f.clerk, { isLoaded: true, isSignedIn: true });
  await f.render();
  assert.equal(f.calls.upsert, 0);
  assert.deepEqual(f.calls.routes, []);
  await f.render();
  assert.equal(f.calls.fetch, 1);
  f.retry();
  await f.render();
  assert.equal(f.calls.fetch, 2);
});

for (const invalid of [true, false]) test(`accept route ${invalid ? "clears definitive invalid" : "retains retryable"} cookie`, async () => {
  let cleared = false;
  class Client { setAuth() {} async mutation() { if (invalid) return { status: "invalid_invite" }; throw new Error("temporary"); } }
  const exports = load("src/app/api/auth/teacher-invite/accept/route.ts", {
    "@clerk/nextjs/server": { auth: async () => ({ userId: "synthetic", getToken: async () => "jwt" }) },
    "next/headers": { cookies: async () => ({ get: () => ({ value: "stale" }) }) },
    "next/server": { NextResponse: { json: (body: unknown, options?: { status: number }) => ({ body, status: options?.status ?? 200, cookies: { set: () => { cleared = true; } } }) } },
    "convex/browser": { ConvexHttpClient: Client }, "@convex": { api: { tenantSettings: { acceptTeacherInvite: {} } } },
  });
  const result = await (exports.POST as () => Promise<{ body: { status: string }; status: number }>)();
  assert.equal(result.body.status, invalid ? "invalid_invite" : "retryable_error");
  assert.equal(cleared, invalid);
});
