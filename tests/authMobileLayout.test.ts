import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const authPages = [
  "src/app/(auth)/sign-in/[[...sign-in]]/page.tsx",
  "src/app/(auth)/sign-up/[[...sign-up]]/page.tsx",
];

test("auth language controls stay in normal flow on phones and return to the desktop corner", () => {
  for (const page of authPages) {
    const source = readFileSync(page, "utf8");

    assert.match(source, /className="relative flex min-h-screen/);
    assert.match(
      source,
      /className="flex w-full justify-end sm:absolute sm:right-4 sm:top-4 sm:w-auto"/,
      page,
    );
    assert.doesNotMatch(source, /className="absolute right-4 top-4"/, page);
    assert.match(source, /<Logo size="lg" \/>/, page);
  }
});
