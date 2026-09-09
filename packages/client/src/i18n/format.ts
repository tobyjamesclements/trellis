/**
 * Locale formatting follows the interface language, and the time zone comes
 * from the device (localisation: "Locale formatting"). Nothing here depends
 * on a trusted clock; these are display helpers only.
 */
export function formatNumber(value: number, language: string): string {
  return new Intl.NumberFormat(language).format(value);
}

export function formatDateTime(value: Date, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
    value,
  );
}

const BYTE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

export function formatBytes(bytes: number, language: string): string {
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < BYTE_UNITS.length - 1) {
    value /= 1024;
    index += 1;
  }
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit: BYTE_UNITS[index],
    maximumFractionDigits: index === 0 ? 0 : 1,
  }).format(value);
}
