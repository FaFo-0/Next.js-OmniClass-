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

Preview is local and writes nothing. `--apply` defaults to development. `--prod` is explicit. `--publish` requests publication after all chapter vocabulary is prepared. Without it a new item remains a draft. Re-imports preserve existing publication intent, chapter identities and learner review history.

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

Import a small batch, check `--status`, and inspect the saved text in the admin reader. Vocabulary is not prepared on save or on publish: a published chapter prepares the first time a learner or teacher opens it, and every tap answers from the shared dictionary lookup until that chapter's batches land. `Prepare vocabulary` / `Re-prepare all` on the admin reading page queue the whole work; `Stop` cancels. Work is done in reading order, in batches of up to 40 distinct words per paragraph group, and skips closed-class words and names. A chapter prepares one group at a time, at most three chapters run academy-wide, and a hard daily batch ceiling applies. Failures retry twice, then wait for an operator retry. Edits made during preparation invalidate that revision. Unchanged chapters are reused.

If an import is interrupted, rerun the same manifest. The item stays unpublished until the import finishes; vocabulary does not gate publication. Do not run concurrent imports for the same item.

The initial authentic collection extracts six fables from the 1919 *The Aesop for Children* source text, arranged as one four-chapter book and two readings. Only line wrapping and illustration placeholders were removed. The supplied text is not an AI retelling.
