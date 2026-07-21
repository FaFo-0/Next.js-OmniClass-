// Shared homework grading. Objective exercises (blank with an expected
// answer, choice with a correct option) grade themselves; open exercises
// (short/long answer, or a blank with no expected answer) are teacher-only.
// A teacher `mark` on any node always overrides the automatic result.

export type Mark = "correct" | "incorrect" | "partial" | null;
export type ItemResult = "correct" | "incorrect" | "partial" | "ungraded" | "open";

/** Loose string compare for fill-blanks: trims, lowercases, collapses spaces. */
export function normalizeAnswer(s: string): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Does this node type carry a gradeable answer at all? */
export function isExercise(type: string): boolean {
  return type === "studentBlank" || type === "studentChoice" || type === "studentText";
}

/**
 * A node's type name. Works for both a plain JSON node (`type` is a string)
 * and a live ProseMirror node (`type` is a NodeType with a `.name`). The
 * editor's node views hand us the latter; scoreDoc walks the former.
 */
function typeName(node: any): string {
  const t = node?.type;
  return typeof t === "string" ? t : (t?.name ?? "");
}

/**
 * The automatic verdict for one exercise node, before any teacher override.
 * "open" = no correct answer exists, so only a teacher can grade it.
 */
export function autoResult(node: any): ItemResult {
  const a = node?.attrs ?? {};
  const type = typeName(node);
  if (type === "studentBlank") {
    if (!a.expected) return "open";
    if (!a.answer) return "ungraded";
    return normalizeAnswer(a.answer) === normalizeAnswer(a.expected)
      ? "correct"
      : "incorrect";
  }
  if (type === "studentChoice") {
    if (a.correct === undefined || a.correct === null || a.correct < 0) return "open";
    if (a.selected === undefined || a.selected === null || a.selected < 0) return "ungraded";
    return a.selected === a.correct ? "correct" : "incorrect";
  }
  if (type === "studentText") {
    return "open"; // always teacher-graded
  }
  return "ungraded";
}

/** Final verdict: teacher mark wins, else the automatic result. */
export function finalResult(node: any): ItemResult {
  const mark: Mark = node?.attrs?.mark ?? null;
  if (mark) return mark;
  return autoResult(node);
}

/** Walk a TipTap doc and collect every exercise node (any depth). */
export function collectExercises(doc: any): any[] {
  const out: any[] = [];
  const visit = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (typeof n.type === "string" && isExercise(n.type)) out.push(n);
    if (Array.isArray(n.content)) n.content.forEach(visit);
  };
  visit(doc);
  return out;
}

export interface Score {
  correct: number;
  total: number; // gradeable items with a final verdict
  open: number; // items awaiting a teacher decision
  percent: number | null; // null when nothing is gradeable yet
}

/** Score a whole doc. Partial counts as half a point. */
export function scoreDoc(doc: any): Score {
  const items = collectExercises(doc);
  let correct = 0;
  let total = 0;
  let open = 0;
  for (const node of items) {
    const r = finalResult(node);
    if (r === "open" || r === "ungraded") {
      open++;
      continue;
    }
    total++;
    if (r === "correct") correct += 1;
    else if (r === "partial") correct += 0.5;
  }
  return {
    correct,
    total,
    open,
    percent: total > 0 ? Math.round((correct / total) * 100) : null,
  };
}
