import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Button = { type: string; props: { onClick: () => void; "aria-label": string; title: string; children: unknown } };

for (const locale of ["en", "ru", "ar", "kk"]) {
  test(`appearance cycles Light → Dark → System without a menu, with localized accessible labels (${locale})`, () => {
    const copy = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).appearance;
    let theme = "system";
    const changes: string[] = [];
    const element = (type: string, props: Button["props"]) => ({ type, props });
    const mocks: Record<string, unknown> = {
      "react/jsx-runtime": { jsx: element, jsxs: element },
      react: { useSyncExternalStore: (_subscribe: unknown, snapshot: () => boolean) => snapshot() },
      "next-themes": { useTheme: () => ({ theme, setTheme: (value: string) => { theme = value; changes.push(value); } }) },
      "next-intl": { useTranslations: () => (key: string, values?: Record<string, string>) => {
        let result = copy[key];
        assert.equal(typeof result, "string");
        for (const [key, value] of Object.entries(values ?? {})) result = result.replace(`{${key}}`, value);
        return result;
      } },
      "lucide-react": { Sun: "sun", Moon: "moon", Monitor: "monitor" },
    };
    const exports: { ThemeSelect?: () => Button } = {};
    const code = ts.transpileModule(readFileSync("src/components/theme/theme-select.tsx", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in mocks, name); return mocks[name]; } });
    for (const [current, next] of [["system", "light"], ["light", "dark"], ["dark", "system"]]) {
      const button = exports.ThemeSelect!();
      assert.equal(button.type, "button");
      assert.ok(button.props["aria-label"].includes(copy[current]));
      assert.ok(button.props["aria-label"].includes(copy[next]));
      assert.equal(button.props.title, button.props["aria-label"]);
      button.props.onClick();
      assert.equal(theme, next);
    }
    assert.deepEqual(changes, ["light", "dark", "system"]);
  });
}
