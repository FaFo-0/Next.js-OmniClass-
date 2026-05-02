/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as achievements from "../achievements.js";
import type * as ai from "../ai.js";
import type * as billing from "../billing.js";
import type * as certificates from "../certificates.js";
import type * as exchangeRates from "../exchangeRates.js";
import type * as expenses from "../expenses.js";
import type * as lessonContent from "../lessonContent.js";
import type * as lessons from "../lessons.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_defaultPrompts from "../lib/defaultPrompts.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_sm2 from "../lib/sm2.js";
import type * as schedule from "../schedule.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as soniox from "../soniox.js";
import type * as streaks from "../streaks.js";
import type * as studentProfiles from "../studentProfiles.js";
import type * as study from "../study.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  achievements: typeof achievements;
  ai: typeof ai;
  billing: typeof billing;
  certificates: typeof certificates;
  exchangeRates: typeof exchangeRates;
  expenses: typeof expenses;
  lessonContent: typeof lessonContent;
  lessons: typeof lessons;
  "lib/auth": typeof lib_auth;
  "lib/defaultPrompts": typeof lib_defaultPrompts;
  "lib/permissions": typeof lib_permissions;
  "lib/sm2": typeof lib_sm2;
  schedule: typeof schedule;
  seed: typeof seed;
  settings: typeof settings;
  soniox: typeof soniox;
  streaks: typeof streaks;
  studentProfiles: typeof studentProfiles;
  study: typeof study;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
