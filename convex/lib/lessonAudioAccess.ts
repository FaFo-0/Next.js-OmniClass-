/**
 * Who may listen to a lesson recording.
 *
 * A recording is the internal evidence record for notes, grading and disputes
 * (POLICY §8 consent, §125 "no sharing of recordings outside the platform"), so
 * it stays with the people who ran the lesson: the assigned teacher and the
 * academy's admins. A student may read their published lesson, but the audio of
 * the lesson is never handed to them.
 *
 * Pure so the decision can be tested directly; the Convex query that resolves the
 * storage URL does the tenant scoping around it.
 */
export interface LessonAudioViewer {
  role: string;
  externalId: string;
}

export function canPlayLessonAudio(
  viewer: LessonAudioViewer,
  lesson: { teacherId: string }
): boolean {
  if (viewer.role === "admin") return true;
  if (viewer.role === "teacher") return lesson.teacherId === viewer.externalId;
  return false;
}
