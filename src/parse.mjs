import { FETCH_STATUS, CURATION_STATUS } from './status.mjs';
import { normalizeLexicalEntry } from './normalize.mjs';

/**
 * §4.4 RFC-4180 CSV parser with header row, column mapping, and quoted-field handling.
 * Emits LexicalEntry records initialized to fetchStatus:'notStarted', curationStatus:'uncurated'.
 * Pure and deterministic — no I/O, no clock, no randomness.
 *
 * @param {string} csvText - Raw CSV or plain-text input
 * @param {object} [options]
 * @param {boolean} [options.foldDiacritics=false] - Passed to normalizeLexicalEntry
 * @param {string} [options.termColumn='term'] - Header name for the term column (case-insensitive)
 * @param {boolean} [options.hasHeader=true] - Whether the first row is a header
 * @returns {{ entries: object[] }}
 */
export function parseInput(csvText, options = {}) {
  const {
    foldDiacritics = false,
    termColumn = 'term',
    hasHeader = true,
  } = options;

  const rows = parseCSV(csvText);
  if (rows.length === 0) return { entries: [] };

  let dataRows;
  let termColIndex = 0;

  if (hasHeader && rows.length > 0) {
    const header = rows[0].map(h => h.trim().toLowerCase());
    const idx = header.indexOf(termColumn.toLowerCase());
    termColIndex = idx >= 0 ? idx : 0;
    dataRows = rows.slice(1);
  } else {
    dataRows = rows;
  }

  const entries = [];
  for (const row of dataRows) {
    if (row.length === 0) continue;
    const rawTerm = (row[termColIndex] ?? '').trim();
    if (rawTerm === '') continue;

    const normalizedForm = normalizeLexicalEntry(rawTerm, { foldDiacritics });

    entries.push({
      '@type': 'lce:LexicalEntry',
      lemma: rawTerm,
      normalizedForm,
      fetchStatus: FETCH_STATUS.NOT_STARTED,
      curationStatus: CURATION_STATUS.UNCURATED,
      candidateDefinitions: [],
      selectedDefinitions: [],
      resolutionEvents: [],
    });
  }

  return { entries };
}

/**
 * RFC-4180 CSV parser. Returns an array of rows, each row an array of field strings.
 * Handles quoted fields (including embedded commas and escaped double-quotes """).
 * @param {string} text
 * @returns {string[][]}
 */
function parseCSV(text) {
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let i = 0;
  const n = normalized.length;

  while (i < n) {
    const row = [];
    // Parse fields in this row
    while (i < n && normalized[i] !== '\n') {
      if (normalized[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        let field = '';
        while (i < n) {
          if (normalized[i] === '"') {
            if (i + 1 < n && normalized[i + 1] === '"') {
              // Escaped double-quote
              field += '"';
              i += 2;
            } else {
              // Closing quote
              i++;
              break;
            }
          } else {
            field += normalized[i];
            i++;
          }
        }
        row.push(field);
        // Skip delimiter or end-of-line after closing quote
        if (i < n && normalized[i] === ',') i++;
      } else {
        // Unquoted field: read until comma or newline
        let start = i;
        while (i < n && normalized[i] !== ',' && normalized[i] !== '\n') {
          i++;
        }
        row.push(normalized.slice(start, i));
        if (i < n && normalized[i] === ',') i++;
      }
    }
    // Skip the newline
    if (i < n && normalized[i] === '\n') i++;
    // Only add non-empty rows (skip blank lines)
    if (row.length > 0 && !(row.length === 1 && row[0] === '')) {
      rows.push(row);
    }
  }

  return rows;
}
