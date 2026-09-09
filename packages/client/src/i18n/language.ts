/**
 * The interface language is chosen per device (localisation: "Language per
 * device") and remembered on the device, not in any document, so a teacher
 * and a student at the same box can each use their own language.
 */
const STORAGE_KEY = "trellis.language";

export function readStoredLanguage(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeLanguage(tag: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, tag);
  } catch {
    // Storage may be unavailable in a private window; the choice then lasts the session.
  }
}

export function clearStoredLanguage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // As above.
  }
}

/**
 * Picks the language to show before the device has chosen one, from the
 * browser's preferences: an exact tag, then a primary-subtag match such as
 * `es-MX` to `es`, then the fallback.
 */
export function guessLanguage(
  preferred: readonly string[],
  available: readonly string[],
  fallback: string,
): string {
  for (const candidate of preferred) {
    const lower = candidate.toLowerCase();
    const exact = available.find((tag) => tag.toLowerCase() === lower);
    if (exact !== undefined) {
      return exact;
    }
    const primary = lower.split("-")[0];
    const partial = available.find((tag) => tag.toLowerCase().split("-")[0] === primary);
    if (partial !== undefined) {
      return partial;
    }
  }
  return fallback;
}
