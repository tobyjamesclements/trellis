import { afterEach, describe, expect, it } from "vitest";
import { clearStoredLanguage, guessLanguage, readStoredLanguage, storeLanguage } from "./language";

describe("language per device", () => {
  afterEach(() => clearStoredLanguage());

  it("guesses from the browser's preferences by exact tag, then primary subtag, then the fallback", () => {
    expect(guessLanguage(["es-MX", "en-US"], ["en", "es"], "en")).toBe("es");
    expect(guessLanguage(["en-GB"], ["en", "es"], "en")).toBe("en");
    expect(guessLanguage(["fr-FR", "pt-BR"], ["en", "es"], "en")).toBe("en");
    expect(guessLanguage([], ["en", "es"], "en")).toBe("en");
    expect(guessLanguage(["ES"], ["en", "es"], "en")).toBe("es");
  });

  it("remembers the choice on the device", () => {
    expect(readStoredLanguage()).toBeUndefined();
    storeLanguage("es");
    expect(readStoredLanguage()).toBe("es");
    clearStoredLanguage();
    expect(readStoredLanguage()).toBeUndefined();
  });
});
