// The translation report (localisation: "Interface languages at launch").
// Compares the keys used in the client's source with the English catalogue,
// which must be complete, and lists what each other language still lacks so
// translators can see it. Exits non-zero only when English is incomplete or a
// catalogue is stale.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = new URL("../", import.meta.url).pathname;
const localesDir = path.join(root, "public", "locales");
const sourceDir = path.join(root, "src");

async function* sourceFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(full);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

const KEY_PATTERNS = [/\bt\(\s*["'`]([^"'`]+)["'`]/g, /\bi18nKey=["']([^"']+)["']/g];
const used = new Map();
for await (const file of sourceFiles(sourceDir)) {
  const text = await readFile(file, "utf8");
  for (const pattern of KEY_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const list = used.get(match[1]) ?? [];
      list.push(path.relative(root, file));
      used.set(match[1], list);
    }
  }
}

const languages = JSON.parse(await readFile(path.join(localesDir, "languages.json"), "utf8"));
const catalogues = new Map();
for (const { tag } of languages) {
  catalogues.set(tag, JSON.parse(await readFile(path.join(localesDir, `${tag}.json`), "utf8")));
}

const english = catalogues.get("en") ?? {};
let failed = false;

const missingInEnglish = [...used.keys()].filter((key) => !(key in english) || english[key] === "");
if (missingInEnglish.length > 0) {
  failed = true;
  console.error("English catalogue is missing or empty for keys used in the source:");
  for (const key of missingInEnglish) {
    console.error(`  ${key}  (${used.get(key).join(", ")})`);
  }
}

const unused = Object.keys(english).filter((key) => !used.has(key));
if (unused.length > 0) {
  failed = true;
  console.error("English catalogue has keys no longer used in the source:");
  for (const key of unused) {
    console.error(`  ${key}`);
  }
}

const placeholders = (text) =>
  [...String(text).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

for (const [tag, catalogue] of catalogues) {
  if (tag === "en") {
    continue;
  }
  const untranslated = Object.keys(english).filter(
    (key) => !(key in catalogue) || catalogue[key] === "",
  );
  const stale = Object.keys(catalogue).filter((key) => !(key in english));
  const mismatched = Object.keys(catalogue).filter(
    (key) =>
      key in english &&
      catalogue[key] !== "" &&
      placeholders(catalogue[key]).join() !== placeholders(english[key]).join(),
  );
  console.log(
    `${tag}: ${Object.keys(english).length - untranslated.length}/${Object.keys(english).length} translated`,
  );
  for (const key of untranslated) {
    console.log(`  untranslated: ${key}  (falls back to English)`);
  }
  if (stale.length > 0) {
    failed = true;
    console.error(`  stale keys not in English: ${stale.join(", ")}`);
  }
  if (mismatched.length > 0) {
    failed = true;
    console.error(`  placeholders differ from English: ${mismatched.join(", ")}`);
  }
}

console.log(`en: ${Object.keys(english).length} keys, ${used.size} used in source`);
process.exit(failed ? 1 : 0);
