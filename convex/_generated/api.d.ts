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
import type * as calendar from "../calendar.js";
import type * as crons from "../crons.js";
import type * as enrollments from "../enrollments.js";
import type * as homework from "../homework.js";
import type * as homeworkAi from "../homeworkAi.js";
import type * as http from "../http.js";
import type * as icsInternal from "../icsInternal.js";
import type * as inLessonQuiz from "../inLessonQuiz.js";
import type * as lessonAudio from "../lessonAudio.js";
import type * as lessonContent from "../lessonContent.js";
import type * as lessons from "../lessons.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_defaultPrompts from "../lib/defaultPrompts.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_policy from "../lib/policy.js";
import type * as lib_sm2 from "../lib/sm2.js";
import type * as lib_tenant from "../lib/tenant.js";
import type * as lib_time from "../lib/time.js";
import type * as library from "../library.js";
import type * as notifications from "../notifications.js";
import type * as onboarding from "../onboarding.js";
import type * as permissions from "../permissions.js";
import type * as points from "../points.js";
import type * as promptConfigs from "../promptConfigs.js";
import type * as retention from "../retention.js";
import type * as schedule from "../schedule.js";
import type * as scheduleCron from "../scheduleCron.js";
import type * as seed from "../seed.js";
import type * as soniox from "../soniox.js";
import type * as srs from "../srs.js";
import type * as streaks from "../streaks.js";
import type * as study from "../study.js";
import type * as tenantSettings from "../tenantSettings.js";
import type * as users from "../users.js";
import type * as vacancies from "../vacancies.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  achievements: typeof achievements;
  ai: typeof ai;
  calendar: typeof calendar;
  crons: typeof crons;
  enrollments: typeof enrollments;
  homework: typeof homework;
  homeworkAi: typeof homeworkAi;
  http: typeof http;
  icsInternal: typeof icsInternal;
  inLessonQuiz: typeof inLessonQuiz;
  lessonAudio: typeof lessonAudio;
  lessonContent: typeof lessonContent;
  lessons: typeof lessons;
  "lib/auth": typeof lib_auth;
  "lib/defaultPrompts": typeof lib_defaultPrompts;
  "lib/permissions": typeof lib_permissions;
  "lib/policy": typeof lib_policy;
  "lib/sm2": typeof lib_sm2;
  "lib/tenant": typeof lib_tenant;
  "lib/time": typeof lib_time;
  library: typeof library;
  notifications: typeof notifications;
  onboarding: typeof onboarding;
  permissions: typeof permissions;
  points: typeof points;
  promptConfigs: typeof promptConfigs;
  retention: typeof retention;
  schedule: typeof schedule;
  scheduleCron: typeof scheduleCron;
  seed: typeof seed;
  soniox: typeof soniox;
  srs: typeof srs;
  streaks: typeof streaks;
  study: typeof study;
  tenantSettings: typeof tenantSettings;
  users: typeof users;
  vacancies: typeof vacancies;
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
