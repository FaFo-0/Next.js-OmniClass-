# Library 2.0 — Reconciled Plan (single source of truth)

> **Supersedes** `.hermes/plans/2026-09-04_170138-library-bulk-import-and-simplification.md`
> and `.hermes/plans/2026-09-04_173135-library-2-blank-slate-redesign.md`.
> Those two were written ~45 min apart and contradicted each other (see "What was
> reconciled" below). This file is the one to read.

**Owner:** Mustafa (FaFo) · **Repo:** `/Users/fafo/Desktop/Projects/Next.js OmniClass`
**Branch:** `feature/library-2-unified-vocabulary` · **Platform rules:** `MASTER_PLAN.md`, `AGENTS.md`.

---

## What was reconciled

Two earlier plans disagreed on scope and data model:

| Question | Plan A (bulk-import) | Plan B (redesign) | Decision here |
|---|---|---|---|
| Chapters as rows vs table | chapters = `libraryMaterials` + `workId`/`sequence` | separate `libraryUnits` table | **`libraryUnits` table** (cleaner; §16 already mandates work→units) |
| PDF / personal reader | out of scope | build Personal Reader (PDF/EPUB/TXT/MD) | **deferred** |
| Per-student progress | out of scope | build `libraryProgress` | **minimal resume only** (last unit + anchor), not assignment analytics |
| Immutable versioning | not mentioned | `libraryWorkVersions`/`libraryUnitVersions` | **deferred** — occurrence model already protects saved vocabulary |
| Editorial queues / rights ledger | simple license field | full queues + ledger | **simple license/attribution field + permission gate** |
| Full lexeme tables | n/a | `lexemes`/`lexemeSenses`/`senseTranslations` | **deferred** — sense-aware `srsCards` identity already achieves the dedup goal |
| Vocabulary convergence | separate per-source paths | one canonical upsert | **done** (see "Already shipped") |

The two old plan files are deleted; their still-relevant content (source/license policy,
content pack format) is summarized in the "Deferred" section below.

---

## The invariant (unchanged, already designed)

Every word from every source (library reading, live lesson transcript, teacher push,
manual, future private document) becomes **one learner-owned, sense-aware vocabulary
item** and **one flashcard**, retaining where/when/in-what-sentence it was met. Source
evidence is copied at save time, so editing a reading later never corrupts saved words.

---

## Already shipped (committed on this branch)

Sense-aware vocabulary + transcript pipeline:

- `f679512` sense-aware identity (lemma + POS + sense + occurrence)
- `1649bf7` canonical `upsertSavedVocabulary`; fixed destructive lesson republish
- `5ace33f` reader save → canonical path with real source sentence
- `331c943` My Words source labels
- `fabb9bd` transcript utterances + anchored vocab candidates
- `e6ed473` uploaded recordings keep anchors
- `c034a28` teacher review of lemma/POS/sense
- `73daf4b` transcript revision provenance
- `beeebd3` lesson ownership authorization + lint cleanup

Schema already added (uncommitted): `libraryWorks`, `libraryUnits`, `libraryProgress`.

---

## Build order (correct sequence)

### Phase 1 — Works/units foundation (IN PROGRESS)
1. Finalize `libraryWorks` / `libraryUnits` / `libraryProgress` schema (already drafted).
2. `convex/libraryWorks.ts`: metadata-only catalogue queries; work detail (metadata +
   ordered unit titles, no bodies); unit body on open; draft-vs-published access
   (drafts only for `library.upload`).
3. Authoring mutations: create/update work; upsert ordered units; publish/unpublish;
   soft-delete/restore. All `library.upload`-gated.
4. Pure helpers + tests: `splitMarkdownIntoUnits` (split a pasted book on `##` headings),
   `estimateReadMinutes`, unit ordering, stable external ids.
5. Reuse existing `ReadingView` for the unit body so word-tap + save + tint still work.

### Phase 2 — Admin authoring UI
6. `/admin/library` — works list (book/article/story/dialog), search, kind/level/topic
   filters, publish/draft status, explicit Preview / Edit / Publish / Delete.
7. Work editor: metadata (title, author, description, kind, level, topics, cover,
   source URL, license, attribution) + a markdown area that auto-splits into units
   (chapters) on save; per-unit reorder/edit.
8. Remove the pencil-as-publish ambiguity; show source/license on every card.

### Phase 3 — Student & teacher catalogue + reader
9. `/student/library` + `/teacher/library` — include A1 and C2 filters, topic filter,
   search, deterministic order (learner level first, then adjacent, then length/title).
10. Work detail: table of contents (ordered units), book badge + author, attribution.
11. Unit reader: open one unit, tap words, save via canonical path, green tint.

### Phase 4 — Remove unsafe public AI
12. Delete student/teacher contextual-AI ("✨ Ask AI") from `WordLookupPopover`/`ReadingView`.
13. Keep contextual review admin-only behind `library.upload`; ensure server-side
    permission checks, not just hidden buttons.

### Phase 5 — Progress/resume
14. `libraryProgress` write on unit open (last unit + anchor); resume on reopen.

### Phase 6 — Verify, deploy, ship
15. Tests, `tsc`, `convex codegen`, `npm run build`, targeted eslint.
16. Independent code review; browser QA via `scripts/dev-login.mjs`.
17. `npx convex deploy` (backend first) → commit → `git push origin master`.
18. Update `MASTER_PLAN.md` §3/§5/§7 with attribution.

---

## Deferred (documented, not built now)

- **Immutable version snapshots** (`libraryWorkVersions`/`libraryUnitVersions`) — not
  required for vocabulary safety; occurrence copies source at save time.
- **Personal Reader** (PDF/EPUB/TXT/MD upload + extraction) — Plan B feature, deferred.
- **Editorial queues, rights ledger, publish gates** beyond a license/attribution field
  + `library.upload` permission check.
- **Separate lexeme/sense/translation tables** — sense-aware `srsCards` identity already
  delivers the dedup behaviour; revisit only if a provider-cache model is needed.
- **Bulk content pack + CLI importer** (`content/library/`, `scripts/library-import.mjs`).
  Source/license policy to honor when this lands (from Plan A §"Source policy"): prefer
  Project Gutenberg / Standard Ebooks / Wikisource / VOA-produced text; record exact
  edition, license, attribution; never treat "public domain in the US" as worldwide
  clearance; original classics are B1–C2, not A1.
- **Migration of legacy `libraryMaterials`** and v1 removal — after works/units is
  proven in production.

---

## Verification gates (do not call "done" before)

- A book (multi-unit) and an article (single-unit) both create → publish → read.
- Catalogue lists carry no `contentMarkdown` bodies.
- A student cannot fetch a draft by ID; a teacher/student cannot invoke AI.
- Saving a word from a unit works, merges into My Words, keeps the exact source sentence.
- Republishing a work reconciles without duplicating units or resetting saved words.
- EN/RU/AR + RTL checked; mobile last.
