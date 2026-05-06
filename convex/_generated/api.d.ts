/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as inLessonQuiz from "../inLessonQuiz.js";
import type * as lessonContent from "../lessonContent.js";
import type * as lessons from "../lessons.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_defaultPrompts from "../lib/defaultPrompts.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_sm2 from "../lib/sm2.js";
import type * as lib_tenant from "../lib/tenant.js";
import type * as library from "../library.js";
import type * as promptConfigs from "../promptConfigs.js";
import type * as seed from "../seed.js";
import type * as soniox from "../soniox.js";
import type * as srs from "../srs.js";
import type * as tenantSettings from "../tenantSettings.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  inLessonQuiz: typeof inLessonQuiz;
  lessonContent: typeof lessonContent;
  lessons: typeof lessons;
  "lib/auth": typeof lib_auth;
  "lib/defaultPrompts": typeof lib_defaultPrompts;
  "lib/permissions": typeof lib_permissions;
  "lib/sm2": typeof lib_sm2;
  "lib/tenant": typeof lib_tenant;
  library: typeof library;
  promptConfigs: typeof promptConfigs;
  seed: typeof seed;
  soniox: typeof soniox;
  srs: typeof srs;
  tenantSettings: typeof tenantSettings;
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
