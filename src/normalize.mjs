/**
 * §4.1 Fixed four-step normalization pipeline (determinism-critical).
 * @param {string} rawText
 * @param {{ foldDiacritics: boolean }} options
 * @returns {string}
 */
export function normalizeLexicalEntry(rawText, { foldDiacritics }) {
  // Step 1: trim Unicode whitespace; collapse internal whitespace runs to U+0020
  let s = rawText.trim().replace(/\s+/gu, ' ');

  // Step 2: NFC normalization
  s = s.normalize('NFC');

  // Step 3: locale-independent toLowerCase — never toLocaleLowerCase (determinism-critical)
  s = s.toLowerCase();

  // Step 4: optional Latin diacritic fold — only when foldDiacritics === true
  // Scope: Latin combining range U+0300-U+036F only; not safe for Arabic, Hebrew, Indic scripts
  if (foldDiacritics) {
    s = s.normalize('NFD').replace(/[\u0300-\u036F]/g, '').normalize('NFC');
  }

  return s;
}
