import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { loadImport, parseCliResult } from "../scripts/library-import.mjs";

test("agent import preview is local and defaults to development even with publication requested", () => {
  const script = resolve("scripts/library-import.mjs");
  const manifest = resolve("content/library/authentic-starter/four-classic-fables.json");
  // Runs outside the repo: preview must not need a Convex installation or credentials.
  const output = execFileSync(process.execPath, [script, manifest, "--publish"], { cwd: tmpdir(), encoding: "utf8" });
  const preview = JSON.parse(output);
  assert.equal(preview.operation, "preview");
  assert.equal(preview.target, "development");
  assert.equal(preview.chapters.length, 4);
  assert.equal(preview.publish, true);
});

test("importer preserves explicit source chapter identifiers across repeat loads", () => {
  const path = resolve("content/library/authentic-starter/four-classic-fables.json");
  const first = loadImport(path);
  const second = loadImport(path);
  assert.deepEqual(first.units, second.units);
  assert.equal(first.units[0].externalId, "the-fox-and-the-grapes");
  assert.match(first.units[0].contentMarkdown, /A Fox one day/);
});

test("Convex's empty successful mutation output does not abort a chapter import", () => {
  assert.equal(parseCliResult(""), null);
  assert.equal(parseCliResult("\n"), null);
  assert.equal(parseCliResult('"work-id"\n'), "work-id");
  assert.deepEqual(parseCliResult('{"chapters":1}'), { chapters: 1 });
});
