import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Element = {
  type: unknown;
  props: { children?: Element | Element[] | string; [key: string]: unknown };
};

function descendants(element: Element): Element[] {
  const children = element.props.children;
  return [element, ...(Array.isArray(children) ? children : [children])
    .filter((child): child is Element => typeof child === "object" && child !== null)
    .flatMap(descendants)];
}

for (const locale of ["en", "ru", "ar", "kk"]) {
  test(`shared onboarding shell exposes localized sign-out and calls Clerk with the sign-in redirect (${locale})`, async () => {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    const calls: Array<{ redirectUrl: string }> = [];
    const Logo = () => null;
    const LanguageSwitcher = () => null;
    const jsx = (type: unknown, props: Element["props"]): Element => ({ type, props });
    const mocks: Record<string, unknown> = {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "@clerk/nextjs": { useClerk: () => ({ signOut: async (options: { redirectUrl: string }) => { calls.push(options); } }) },
      "next-intl": { useTranslations: (namespace: string) => {
        assert.equal(namespace, "nav");
        return (key: string) => messages[namespace][key];
      } },
      "@/components/layout/logo": { Logo },
      "@/components/layout/language-switcher": { LanguageSwitcher },
    };
    const exports: Record<string, unknown> = {};
    const code = ts.transpileModule(readFileSync("src/app/onboarding/layout.tsx", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(code, { exports, require: (name: string) => {
      assert.ok(name in mocks, name);
      return mocks[name];
    } });

    for (const route of ["post-signup", "student", "teacher"]) {
      assert.ok(existsSync(`src/app/onboarding/${route}/page.tsx`));
      assert.equal(existsSync(`src/app/onboarding/${route}/layout.tsx`), false);
      const content = jsx("section", { children: route });
      const tree = (exports.default as (props: { children: Element }) => Element)({ children: content });
      const nodes = descendants(tree);
      const header = nodes.find((node) => node.type === "header");
      assert.ok(header);
      const headerNodes = descendants(header);
      assert.ok(headerNodes.some((node) => node.type === Logo));
      assert.ok(headerNodes.some((node) => node.type === LanguageSwitcher));
      assert.ok(nodes.includes(content));
      const button = headerNodes.find((node) => node.type === "button" && node.props.children === messages.nav.signOut);
      assert.ok(button, `${route} has an accessible text-labelled sign-out button`);
      assert.equal(button.props.type, "button");
      assert.equal(calls.length, ["post-signup", "student", "teacher"].indexOf(route));
      await (button.props.onClick as () => Promise<void>)();
      assert.equal(calls.at(-1)?.redirectUrl, "/sign-in");
      assert.deepEqual(Object.keys(calls.at(-1)!), ["redirectUrl"]);
    }
    assert.equal(calls.length, 3);
  });
}
