import { userHasPermission } from "./permissions";
import { POLICY } from "./policy";

export type NoShowParty = "student" | "teacher";
export type NoShowActor = {
  externalId: string;
  role: string;
  permissions?: string[];
};

export interface NoShowOwnershipTarget {
  teacherId?: string;
}

export interface NoShowAuthorization {
  allowed: boolean;
  reason?: string;
}

/**
 * Manual no-show authorization is deliberately narrower than the generic
 * lesson permission. Teachers may report their own student's absence, never
 * another teacher's event and never a teacher no-show. Teacher no-shows are
 * automatic after the policy grace or an authorized admin decision.
 */
export function manualNoShowAuthorization(args: {
  actor: NoShowActor;
  event: NoShowOwnershipTarget;
  lessonTeacherId?: string;
  party: NoShowParty;
}): NoShowAuthorization {
  const { actor, event, lessonTeacherId, party } = args;
  if (!userHasPermission(actor, "lessons.mark_no_show")) {
    return { allowed: false, reason: "Missing permission to mark no-show" };
  }
  if (actor.role === "admin") return { allowed: true };
  if (actor.role !== "teacher") {
    return { allowed: false, reason: "Only an assigned teacher or authorized admin may mark no-show" };
  }
  if (!event.teacherId || event.teacherId !== actor.externalId) {
    return { allowed: false, reason: "Only the assigned teacher can act on this event" };
  }
  if (lessonTeacherId !== undefined && lessonTeacherId !== actor.externalId) {
    return { allowed: false, reason: "Only the assigned teacher can act on this lesson" };
  }
  if (party === "teacher") {
    return {
      allowed: false,
      reason: "Teacher no-shows are automatic after the policy grace or admin-authorized",
    };
  }
  return { allowed: true };
}

export function assertManualNoShowAuthorization(args: Parameters<typeof manualNoShowAuthorization>[0]): void {
  const verdict = manualNoShowAuthorization(args);
  if (!verdict.allowed) throw new Error(verdict.reason ?? "No-show action denied");
}

/** Generic event editing is not an attendance transition. */
export function assertGenericEventStatus(status: string | undefined): void {
  if (status === "no_show_student" || status === "no_show_teacher") {
    throw new Error("No-show statuses must be created by the policy-enforcing markNoShow mutation");
  }
}

export function assertTeacherNoShowDue(nowMs: number, startMs: number): void {
  if (nowMs - startMs < POLICY.noShowWaitMinutes * 60_000) {
    throw new Error(`Teacher no-show is not due before the ${POLICY.noShowWaitMinutes}-minute policy grace`);
  }
}

/** @deprecated Use the party-independent teacher no-show policy assertion. */
export const assertAutomaticTeacherNoShowDue = assertTeacherNoShowDue;
