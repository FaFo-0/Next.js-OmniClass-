export type HomeworkBoundaryRole = "teacher" | "admin" | "student";

export type HomeworkBoundaryActor = {
  organizationId: string;
  externalId: string;
  role: HomeworkBoundaryRole;
};

export type HomeworkBoundaryLesson = {
  organizationId: string;
  teacherId: string;
  studentId: string;
};

export type HomeworkBoundaryRow = {
  organizationId: string;
  teacherId: string;
  studentId: string;
};

export function studentsMatch(homeworkStudentId: string, lessonStudentId: string): boolean {
  return homeworkStudentId === lessonStudentId;
}

export function canCreateHomeworkForLesson(
  actor: HomeworkBoundaryActor,
  lesson: HomeworkBoundaryLesson,
  studentId: string,
): boolean {
  return (
    actor.organizationId === lesson.organizationId &&
    studentsMatch(studentId, lesson.studentId) &&
    (actor.role === "admin" ||
      (actor.role === "teacher" && actor.externalId === lesson.teacherId))
  );
}

export function canGenerateHomework(
  actor: HomeworkBoundaryActor,
  homework: HomeworkBoundaryRow,
  lesson: HomeworkBoundaryLesson,
): boolean {
  return (
    actor.organizationId === homework.organizationId &&
    actor.organizationId === lesson.organizationId &&
    (actor.role === "admin" ||
      (actor.role === "teacher" &&
        actor.externalId === homework.teacherId &&
        actor.externalId === lesson.teacherId))
  );
}

export function shouldAssignApprovedHomework(
  homeworkStudentId: string,
  lessonStudentId: string,
): boolean {
  return studentsMatch(homeworkStudentId, lessonStudentId);
}
