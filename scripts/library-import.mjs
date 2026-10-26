#!/usr/bin/env node
/** Preview is local and read-only. --apply uses the operator's existing Convex CLI login. */
import { readFileSync } from "node:fs";
import { dirname, resolve, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function loadImport(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const { contentFile, units: explicit, ...item } = manifest;
  if (!item.externalId || !item.title || !item.kind) throw new Error("externalId, title and kind are required");
  item.topicTags ??= [];
  const readText = file => {
    const path = resolve(dirname(manifestPath), file);
    if (extname(path).toLowerCase() === ".pdf") {
      try {
        const text = execFileSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
        if (text.replace(/\s/g, "").length < 30) throw new Error("No selectable text");
        return text;
      } catch { throw new Error("PDF has no extractable text or pdftotext is unavailable. Extract text with an external tool, then import .txt or .md. OCR is not supported."); }
    }
    if (![".md", ".txt"].includes(extname(path).toLowerCase())) throw new Error("Use .md, .txt or a text-based .pdf");
    return readFileSync(path, "utf8");
  };
  let units = explicit?.map(u => ({ externalId: u.externalId, title: u.title, contentMarkdown: u.contentFile ? readText(u.contentFile) : u.contentMarkdown }));
  if (!units && contentFile) {
    const text = readText(contentFile).replace(/^#\s+[^\n]+\n/, "").trim();
    const sections = text.split(/^##\s+/m);
    const front = sections.shift()?.trim();
    units = sections.length ? sections.map((section, i) => {
      const [title, ...body] = section.split("\n");
      return { externalId: `chapter-${i + 1}`, title: title.trim(), contentMarkdown: [i === 0 ? front : "", body.join("\n").trim()].filter(Boolean).join("\n\n") };
    }) : [{ externalId: "chapter-1", title: item.title, contentMarkdown: text }];
  }
  units ??= [];
  if (units.length > 200) throw new Error("Maximum 200 sections per item");
  if (new Set(units.map(u => u.externalId)).size !== units.length) throw new Error("Chapter externalId values must be unique");
  for (const unit of units) {
    if (!unit.externalId || !unit.title || !unit.contentMarkdown?.trim()) throw new Error("Each chapter needs externalId, title and text");
    if (unit.contentMarkdown.length > 40000) throw new Error("Split sections exceeding 40,000 characters. Use explicit units with stable externalId values.");
  }
  if (!units.length && !item.externalUrl) throw new Error("Provide contentFile, units or externalUrl");
  return { item, units };
}

export function parseCliResult(output) { return output.trim() ? JSON.parse(output) : null; }

function main() {
  const argv = process.argv.slice(2);
  const manifestPath = argv.find(a => !a.startsWith("--"));
  if (!manifestPath) throw new Error("Usage: npm run library:import -- manifest.json [--apply] [--prod] [--publish] [--status]");
  const { item, units } = loadImport(resolve(manifestPath));
  const run = (name, args) => {
    const output = execFileSync(process.execPath, ["node_modules/convex/bin/main.js", "run", name, JSON.stringify(args), ...(argv.includes("--prod") ? ["--prod"] : [])], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    return parseCliResult(output);
  };
  if (argv.includes("--status")) { console.log(JSON.stringify(run("libraryImport:inspect", { externalId: item.externalId }), null, 2)); return; }
  console.log(JSON.stringify({ operation: argv.includes("--apply") ? "import" : "preview", target: argv.includes("--prod") ? "production" : "development", externalId: item.externalId, title: item.title, chapters: units.map(u => ({ id: u.externalId, title: u.title, characters: u.contentMarkdown.length })), externalUrl: item.externalUrl, publish: argv.includes("--publish") }, null, 2));
  if (!argv.includes("--apply")) return;
  const workId = run("libraryImport:begin", { item });
  for (const [position, unit] of units.entries()) run("libraryImport:chapter", { workId, unit, position });
  console.log(JSON.stringify(run("libraryImport:finish", { workId, chapterIds: units.map(u => u.externalId), publish: argv.includes("--publish") }), null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
