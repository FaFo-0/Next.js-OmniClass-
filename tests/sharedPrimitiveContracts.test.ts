import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sidebar = readFileSync("src/components/shared/OmnicSidebar.tsx", "utf8");
const account = readFileSync("src/components/shared/AccountCard.tsx", "utf8");

test("shared sidebar renders tenant-owned branding", () => {
  assert.match(sidebar, /brand\.tenantBrand\.name/);
  assert.doesNotMatch(sidebar, /<span[^>]*>Omnica<\/span>/);
});

test("shared account card uses the profile translation catalogue", () => {
  assert.match(account, /useTranslations\("app\.profile"\)/);
  for (const text of ["Profile saved", "Edit profile", "Phone \/ WhatsApp", "Native language"]) {
    assert.doesNotMatch(account, new RegExp(`>${text.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}<`));
  }
});
