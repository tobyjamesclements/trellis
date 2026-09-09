import { describe, expect, it } from "vitest";
import en from "../../public/locales/en.json";
import es from "../../public/locales/es.json";
import languages from "../../public/locales/languages.json";

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1] as string).sort();

describe("the launch catalogues", () => {
  it("list English and Spanish, each named in itself", () => {
    expect(languages).toEqual([
      { tag: "en", name: "English" },
      { tag: "es", name: "Español" },
    ]);
  });

  it("are complete in both languages with matching placeholders", () => {
    const englishKeys = Object.keys(en).sort();
    expect(Object.keys(es).sort()).toEqual(englishKeys);
    for (const key of englishKeys) {
      const english = (en as Record<string, string>)[key] as string;
      const spanish = (es as Record<string, string>)[key] as string;
      expect(english, key).not.toBe("");
      expect(spanish, key).not.toBe("");
      expect(placeholders(spanish), key).toEqual(placeholders(english));
    }
  });
});
