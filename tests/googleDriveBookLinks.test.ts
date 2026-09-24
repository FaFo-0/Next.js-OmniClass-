import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertApprovedGoogleDriveUrl,
  isApprovedGoogleDriveUrl,
} from "../convex/lib/googleDrive.ts";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("Google Drive URL validation accepts supported Drive and Docs hosts", () => {
  for (const value of [
    "https://drive.google.com/file/d/abc/view",
    "https://docs.google.com/document/d/abc/edit",
    "https://drive.googleusercontent.com/download?id=abc",
    "https://subdomain.googleusercontent.com/file/abc",
  ]) {
    assert.equal(isApprovedGoogleDriveUrl(value), true, value);
    assert.equal(assertApprovedGoogleDriveUrl(value), value);
  }
});

test("Google Drive URL validation rejects malformed, unsafe, and unrelated hosts", () => {
  for (const value of [
    "not a URL",
    " https://drive.google.com/file/d/abc ",
    "http://drive.google.com/file/d/abc",
    "https://drive.google.com.evil.example/file/d/abc",
    "https://evil.google.com/file/d/abc",
    "https://drive.google.com:443/file/d/abc",
    "https://user:pass@drive.google.com/file/d/abc",
  ]) {
    assert.equal(isApprovedGoogleDriveUrl(value), false, value);
    assert.throws(() => assertApprovedGoogleDriveUrl(value), /Google Drive|URL/);
  }
});

test("library work schema and create/update contracts propagate externalUrl", () => {
  const schema = read("convex/schema.ts");
  const mutations = read("convex/libraryWorks.ts");
  assert.match(schema, /externalUrl: v\.optional\(v\.string\(\)\)/);
  assert.match(mutations, /externalUrl: v\.optional\(v\.string\(\)\)/g);
  assert.match(mutations, /const externalUrl = assertApprovedGoogleDriveUrl\(args\.externalUrl\)/);
  assert.match(mutations, /externalUrl,/);
  assert.match(mutations, /externalUrl: v\.optional\(v\.string\(\)\)/);
});

test("admin authoring permits an external-only book without empty native content", () => {
  const page = read("src/app/admin/library/works/page.tsx");
  assert.match(page, /!contentMarkdown\.trim\(\) && !externalUrl\.trim\(\)/);
  assert.match(page, /Title and content or a Google Drive link required/);
});

test("external work cards open the exact stored URL in a safe new tab while native cards keep Next routing", () => {
  const card = read("src/components/library/WorkCard.tsx");
  assert.match(card, /work\.externalUrl/);
  assert.match(card, /href=\{work\.externalUrl\}/);
  assert.match(card, /target=\"_blank\"/);
  assert.match(card, /rel=\"noreferrer\"/);
  assert.match(card, /openExternal/);
  assert.match(card, /<Link href=\{href\}/);
});

test("all supported locale catalogues expose the external library labels", () => {
  const english = JSON.parse(read("messages/en.json")) as { app: { library: Record<string, unknown> } };
  for (const locale of ["en", "ru", "ar", "kk"]) {
    const current = JSON.parse(read(`messages/${locale}.json`)) as { app: { library: Record<string, unknown> } };
    assert.equal(typeof current.app.library.openExternal, "string", locale);
    assert.equal(typeof current.app.library.external, "string", locale);
    assert.notEqual(current.app.library.openExternal, english.app.library.openExternal === undefined ? "" : "app.library.openExternal", locale);
  }
});
