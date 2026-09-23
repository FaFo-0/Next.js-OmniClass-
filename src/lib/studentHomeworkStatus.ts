export function studentHomeworkStatusKey(
  status: string,
  submittedLocally: boolean,
): "notStarted" | "started" | "waiting" | "reviewed" {
  if (status === "reviewed") return "reviewed";
  if (status === "submitted" || submittedLocally) return "waiting";
  if (status === "in_progress") return "started";
  return "notStarted";
}
