import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertBookExternalUrl,
  assertApprovedGoogleDriveUrl,
  isApprovedGoogleDriveUrl,
  resolveBookExternalUrl,
} from "../convex/lib/googleDrive.ts";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("Google Drive URL validation accepts supported Drive and Docs hosts", () => {
  for (const value of [
    "https://drive.google.com/file/d/abc/view",
    "https://docs.google.com/document/d/abc/edit",
    "https://drive.googleusercontent.com/download?id=abc",
    "https://docs.googleusercontent.com/document/abc",
    "https://drive.usercontent.google.com/download?id=abc",
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
    "https://unrelated.googleusercontent.com/file/d/abc",
    "https://subdomain.googleusercontent.com/file/abc",
    "https://drive.google.com:443/file/d/abc",
    "https://user:pass@drive.google.com/file/d/abc",
  ]) {
    assert.equal(isApprovedGoogleDriveUrl(value), false, value);
    assert.throws(() => assertApprovedGoogleDriveUrl(value), /Google Drive|URL/);
  }
});

test("external URLs are accepted only for book works", () => {
  const url = "https://drive.google.com/file/d/abc/view";
  assert.equal(assertBookExternalUrl("book", url), url);
  assert.equal(assertBookExternalUrl("book", null), undefined);
  assert.equal(assertBookExternalUrl("article", undefined), undefined);
  assert.throws(
    () => assertBookExternalUrl("article", url),
    /externalUrl is only supported for book works/,
  );
  assert.throws(
    () => assertBookExternalUrl("transcript", url),
    /externalUrl is only supported for book works/,
  );
});

test("clearing a link and changing away from book never preserves externalUrl", () => {
  const url = "https://drive.google.com/file/d/abc/view";
  assert.equal(resolveBookExternalUrl("book", null, url), undefined);
  assert.equal(resolveBookExternalUrl("article", undefined, url), undefined);
  assert.equal(resolveBookExternalUrl("book", undefined, url), url);
  assert.throws(() => resolveBookExternalUrl("article", url, undefined), /only supported for book works/);
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
