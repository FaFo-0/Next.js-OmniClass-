import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");
const root = process.cwd();

const teacherLibrary = read(`${root}/src/app/teacher/library/page.tsx`);
const shareReading = read(`${root}/src/app/teacher/share/reading/page.tsx`);
const readingView = read(`${root}/src/components/library/ReadingView.tsx`);
const adminWorks = read(`${root}/src/app/admin/library/works/page.tsx`);
const adminEditor = read(`${root}/src/app/admin/library/works/[id]/page.tsx`);
const pageHeader = read(`${root}/src/components/shared/PageHeader.tsx`);
const studentContents = read(`${root}/src/app/student/library/work/[workId]/page.tsx`);
const teacherContents = read(`${root}/src/app/teacher/library/work/[workId]/page.tsx`);
const globals = read(`${root}/src/app/globals.css`);

test("library catalogue grids share the mobile-safe grid contract", () => {
  assert.match(teacherLibrary, /className="library-grid"/);
  assert.doesNotMatch(teacherLibrary, /gridTemplateColumns:\s*"repeat\(auto-fill, minmax\(220px/);
  assert.match(globals, /\.library-grid[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)/);
});

test("standalone share-reading picker fits a 320px viewport", () => {
  assert.match(shareReading, /padding:\s*"clamp\(16px, 4vw, 32px\)"/);
  assert.match(shareReading, /gridTemplateColumns:\s*"repeat\(auto-fill, minmax\(min\(260px, 100%\), 1fr\)\)"/);
  assert.match(shareReading, /overflowWrap:\s*"anywhere"/);
});

test("reading word controls support keyboard activation", () => {
  assert.ok((readingView.match(/onKeyDown=/g) ?? []).length >= 2);
  assert.match(readingView, /e\.key === " "/);
});

test("admin library surfaces wrap dense controls and use one column on phones", () => {
  assert.match(pageHeader, /flex-wrap/);
  assert.match(adminWorks, /grid-cols-1[^\"]*sm:grid-cols-2/);
  assert.match(adminWorks, /flex-wrap/);
  assert.match(adminEditor, /grid-cols-1[^\"]*sm:grid-cols-2/);
  assert.match(adminEditor, /flex-wrap/);
});

test("student and teacher contents rows allow long localized titles to wrap", () => {
  for (const source of [studentContents, teacherContents]) {
    assert.match(source, /className="min-w-0[^"']*break-words/);
    assert.match(source, /shrink-0/);
  }
});
