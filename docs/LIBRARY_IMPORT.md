# Library authoring for agents

Use the existing Convex CLI login. No API key is added to a manifest or committed.

A library item can contain chapters, an HTTPS link, or both. Google Drive permissions stay with Drive. YouTube transcripts must be supplied as text; this tool does not download videos or obtain transcripts. OCR is outside the platform: extract scanned documents elsewhere and import the result.

## Preview and import

```sh
npm run library:import -- content/library/authentic-starter/four-classic-fables.json
npm run library:import -- content/library/authentic-starter/four-classic-fables.json --apply
npm run library:import -- content/library/authentic-starter/four-classic-fables.json --apply --prod --publish
npm run library:import -- content/library/authentic-starter/four-classic-fables.json --prod --status
```

Preview is local and writes nothing. `--apply` defaults to development. `--prod` is explicit. `--publish` prepares the opening chapter and publishes automatically when that chapter is complete. Without it a new item remains a draft. Re-imports preserve existing publication intent, chapter identities and learner review history. Each chapter is upserted by its stable identifier; unchanged text keeps prepared vocabulary. Chapter bodies are stored separately so imports do not reread all earlier chapter text.

Only the opening chapter prepares for publication. Later chapters prepare when opened, without next-chapter prefetch. Preparation has a shared allowance of 100 model attempts per academy per UTC day (failed calls and fallbacks count); unfinished work resumes after the allowance resets. Recovery runs every 15 minutes; ordinary queue completions dispatch immediately.

## Manifest

```json
{
  "externalId": "stable-book-id",
  "title": "Book title",
  "kind": "book",
  "levelCEFR": "B1",
  "topicTags": ["travel"],
  "author": "Original author",
  "sourceUrl": "https://example.com/source",
  "externalUrl": "https://example.com/optional-resource",
  "units": [
    { "externalId": "chapter-one", "title": "Chapter One", "contentFile": "chapter-one.md" }
  ]
}
```

Kinds: `book`, `article`, `story`, `dialog`, `transcript`, `video`, `resource`. Source, author, attribution and licence fields are optional metadata. A link-only item omits units. A transcript attached to a video is simply a unit on that item.

Paths resolve relative to the manifest. Instead of units, `contentFile` may name one Markdown/text file; `##` headings split it into numbered chapters. Use explicit units and stable `externalId` values for books whose sections may be reordered or renamed. Never change identifiers merely to correct content. Re-import removes omitted chapters from the contents without deleting historical chapter rows.

Text-based PDFs use an externally installed `pdftotext` command. If extraction is unavailable or the file is scanned, use a third-party extractor and supply `.txt`/`.md`. Do not add OCR. Maximum 200 sections per item and 40,000 characters per section; split long chapters into named parts. No new document-processing service is required.

## Editorial workflow

Preserve the original author's prose. Remove extraction artefacts (repeated headers, illustration placeholders, broken line wraps) without generating replacement text. Choose a realistic level; authentic classics are not automatically beginner material. Record the source edition when known.

Import a small batch, check `--status`, and inspect the saved text in the admin reader. Draft saves spend nothing. Publication prepares the **entire opening chapter** first, including its title, names, common words and ru/ar/kk translations. Link-only resources publish immediately. Opening a published chapter requests its immediate successor in the background; it does not prepare the rest of the book. Large chapters prepare in batches of up to 40 unique word/sentence pairs, with sentence text shared in the request. Different sentence meanings stay separate. A batch is accepted only with complete translations and grammatical tags for every requested key.

`Prepare vocabulary` / `Re-prepare all` on the admin reading page explicitly queue the whole work. `Stop` persists for all unfinished chapters, including chapters that had not started; opening them cannot restart paid work. Use Prepare vocabulary or a chapter retry to resume. Stale workers cannot store results or start fallback requests after a stop/restart. Already sent provider requests cannot be recalled.

At most three chapters prepare per academy. A durable meter reserves each HTTP request **before** sending it, including failed requests and fallback models, up to 600 attempts per UTC day. Output is capped at 6,000 tokens per request; this is an attempt allowance, not a currency-denominated budget. The shared queue resumes after another book releases a slot, and minute recovery resumes eligible work after a daily reset. Incomplete answers and provider failures retry twice, then require an explicit operator retry. Budget pauses resume automatically. Completed legacy chapters remain readable; unfinished older runs restart safely in the current format. Editing text invalidates in-flight results without changing chapter IDs or learner history. Editing or re-preparing an opening chapter holds its publication until complete again.

If an import is interrupted, rerun the same manifest. The item stays unpublished until the import finishes, then publication waits only for its opening chapter. Do not run concurrent imports for the same item. A reader who jumps ahead may still encounter an unprepared chapter and use the existing on-demand lookup; one-chapter-ahead preparation reduces this delay but does not guarantee arbitrary jumps are instant.

The initial authentic collection extracts six fables from the 1919 *The Aesop for Children* source text, arranged as one four-chapter book and two readings. Only line wrapping and illustration placeholders were removed. The supplied text is not an AI retelling.
