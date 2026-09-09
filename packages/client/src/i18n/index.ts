import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { guessLanguage, readStoredLanguage, storeLanguage } from "./language";

/**
 * Interface strings (localisation: "Interface languages at launch"). Every
 * language is one flat JSON catalogue served by the box from `/locales`,
 * listed in `languages.json`, and cached by the service worker, so a further
 * language is added by supplying a file, not by changing code. English is the
 * fallback: a key missing or left empty in another catalogue renders in
 * English and is listed by the translation report.
 */
export interface LanguageOption {
  readonly tag: string;
  readonly name: string;
}

export const FALLBACK_LANGUAGE = "en";

let languages: readonly LanguageOption[] = [];

export function availableLanguages(): readonly LanguageOption[] {
  return languages;
}

export function currentLanguage(): string {
  return i18next.resolvedLanguage ?? i18next.language;
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`could not load ${path}: ${response.status}`);
  }
  return response.json();
}

async function loadCatalogue(tag: string): Promise<void> {
  if (i18next.hasResourceBundle(tag, "translation")) {
    return;
  }
  const catalogue = await fetchJson(`/locales/${tag}.json`);
  i18next.addResourceBundle(tag, "translation", catalogue);
}

function applyDocumentLanguage(tag: string): void {
  document.documentElement.lang = tag;
}

/** Loads the catalogues and starts i18next in the device's language, or the best guess before one is chosen. */
export async function initialiseI18n(): Promise<void> {
  languages = (await fetchJson("/locales/languages.json")) as LanguageOption[];
  const tags = languages.map((language) => language.tag);
  const initial =
    readStoredLanguage() ?? guessLanguage(navigator.languages, tags, FALLBACK_LANGUAGE);

  await i18next.use(initReactI18next).init({
    lng: initial,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: tags,
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    resources: {},
  });
  await loadCatalogue(FALLBACK_LANGUAGE);
  if (initial !== FALLBACK_LANGUAGE) {
    await loadCatalogue(initial);
  }
  await i18next.changeLanguage(initial);
  applyDocumentLanguage(initial);
}

/** Switches the interface language in place and remembers it on this device. */
export async function chooseLanguage(tag: string): Promise<void> {
  await loadCatalogue(tag);
  await i18next.changeLanguage(tag);
  storeLanguage(tag);
  applyDocumentLanguage(tag);
}
