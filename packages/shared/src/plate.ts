/**
 * Turkish License Plate Normalization and Formatting Utilities
 */

/**
 * Normalizes a license plate according to Turkish rules:
 * - Converts lowercase Turkish characters correctly ('i' -> 'İ', 'ı' -> 'I')
 * - Strips all spaces, dashes, dots, and non-alphanumeric symbols
 * - Converts to uppercase
 */
export function normalizePlate(raw: string): string {
  if (!raw) return '';
  
  // Custom Turkish uppercase conversion to prevent locale discrepancies
  const trUpper = raw
    .replace(/i/g, 'İ')
    .replace(/ı/g, 'I')
    .replace(/ç/g, 'Ç')
    .replace(/ğ/g, 'Ğ')
    .replace(/ö/g, 'Ö')
    .replace(/ş/g, 'Ş')
    .replace(/ü/g, 'Ü')
    .toUpperCase();

  // Strip all whitespace and punctuation
  return trUpper.replace(/[^0-9A-ZÇĞİÖŞÜ]/g, '');
}

/**
 * Formats a normalized Turkish license plate into standard display format:
 * e.g. "34ABC123" -> "34 ABC 123"
 * e.g. "06B1234" -> "06 B 1234"
 * e.g. "35AB1234" -> "35 AB 1234"
 */
export function formatPlateDisplay(normalizedOrRaw: string): string {
  const norm = normalizePlate(normalizedOrRaw);
  if (!norm) return '';

  // Turkish license plate regex matches:
  // 1) 2 digits + 1 letter + 4-5 digits (e.g. 06 A 1234)
  // 2) 2 digits + 2 letters + 3-4 digits (e.g. 34 AB 123, 34 AB 1234)
  // 3) 2 digits + 3 letters + 2-3 digits (e.g. 34 ABC 12, 34 ABC 123)
  const match = norm.match(/^(\d{2})([A-ZÇĞİÖŞÜ]{1,3})(\d{2,5})$/);
  if (match) {
    return `${match[1]} ${match[2]} ${match[3]}`;
  }

  return norm;
}

/**
 * Checks if a string is a valid Turkish plate format
 */
export function isValidTurkishPlate(raw: string): boolean {
  const norm = normalizePlate(raw);
  return /^(\d{2})([A-ZÇĞİÖŞÜ]{1,3})(\d{2,5})$/.test(norm);
}
