// Pure validation and normalization for provider-generated homework output.
// Keep this module free of Convex imports so the storage boundary and parser
// contract can be tested directly.

type HomeworkRecord = Record<string, unknown>;

export type HomeworkNode = HomeworkRecord & {
  type: string;
};

export type HomeworkDoc = HomeworkRecord & {
  type: "doc";
  content: HomeworkNode[];
};

const HOMEWORK_NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "text",
  "studentBlank",
  "studentChoice",
  "studentText",
]);

function asRecord(value: unknown): HomeworkRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as HomeworkRecord)
    : null;
}

function normalizeAttrs(type: string, value: unknown): HomeworkRecord | null {
  const attrs = asRecord(value);
  if (!attrs) return null;

  const normalized = { ...attrs };

  if (type === "studentBlank") {
    if ("label" in attrs && typeof attrs.label !== "string") return null;
    if ("expected" in attrs && typeof attrs.expected !== "string") return null;
    normalized.answer = "";
    delete normalized.mark;
    return normalized;
  }

  if (type === "studentChoice") {
    if ("question" in attrs && typeof attrs.question !== "string") return null;

    const options = "options" in attrs ? attrs.options : [];
    if (!Array.isArray(options)) return null;
    for (const option of options) {
      if (typeof option !== "string") return null;
    }

    if ("correct" in attrs) {
      const correct = attrs.correct;
      if (
        typeof correct !== "number" ||
        !Number.isInteger(correct) ||
        (correct !== -1 && (correct < 0 || correct >= options.length))
      ) {
        return null;
      }
    }

    normalized.selected = -1;
    delete normalized.mark;
    return normalized;
  }

  if (type === "studentText") {
    if ("prompt" in attrs && typeof attrs.prompt !== "string") return null;
    if ("long" in attrs && typeof attrs.long !== "boolean") return null;
    normalized.answer = "";
    normalized.long = attrs.long === undefined ? false : attrs.long;
    delete normalized.mark;
    return normalized;
  }

  return normalized;
}

function normalizeNode(value: unknown): HomeworkNode | null {
  const record = asRecord(value);
  if (!record || typeof record.type !== "string" || !HOMEWORK_NODE_TYPES.has(record.type)) {
    return null;
  }
  if (record.type === "text" && typeof record.text !== "string") return null;

  const normalized: HomeworkRecord = { ...record };
  if ("attrs" in record) {
    const attrs = normalizeAttrs(record.type, record.attrs);
    if (!attrs) return null;
    normalized.attrs = attrs;
  }

  if ("content" in record) {
    if (!Array.isArray(record.content)) return null;
    const content = normalizeHomeworkNodes(record.content);
    if (!content) return null;
    normalized.content = content;
  }

  return normalized as HomeworkNode;
}

/** Validate and normalize an array of TipTap child nodes for quiz appends. */
export function normalizeHomeworkNodes(value: unknown): HomeworkNode[] | null {
  if (!Array.isArray(value)) return null;
  const normalized: HomeworkNode[] = [];
  for (const node of value) {
    const next = normalizeNode(node);
    if (!next) return null;
    normalized.push(next);
  }
  return normalized;
}

/** Validate and normalize a TipTap document before it is stored. */
export function normalizeHomeworkDocument(value: unknown): HomeworkDoc | null {
  const source = Array.isArray(value)
    ? { type: "doc", content: value }
    : asRecord(value);
  if (!source || !Array.isArray(source.content)) return null;

  const content = normalizeHomeworkNodes(source.content);
  if (!content) return null;

  const normalized: HomeworkRecord = { ...source, type: "doc", content };
  return normalized as HomeworkDoc;
}

function findNestedDocument(value: unknown): HomeworkDoc | null {
  const record = asRecord(value);
  if (record) {
    for (const nested of Object.values(record)) {
      const document = normalizeHomeworkDocument(nested);
      if (document) return document;
      const deeper = findNestedDocument(nested);
      if (deeper) return deeper;
    }
  } else if (Array.isArray(value)) {
    for (const nested of value) {
      const deeper = findNestedDocument(nested);
      if (deeper) return deeper;
    }
  }
  return null;
}

/** Parse raw, fenced, array, or nested provider homework output. */
export function parseHomeworkOutput(raw: string): HomeworkDoc | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.unshift(fence[1].trim());

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const direct = normalizeHomeworkDocument(parsed);
      if (direct) return direct;
      const nested = findNestedDocument(parsed);
      if (nested) return nested;
    } catch {
      // Try the next supported representation.
    }
  }

  // No raw-text fallback: an unparseable response is almost always
  // truncated JSON — inserting it as text fills the editor with garbage.
  return null;
}
