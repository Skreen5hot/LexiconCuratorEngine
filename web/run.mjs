// In-browser self-test for the Lexicon Curator Engine core.
// Imports the SAME ES modules the Node smoke tests exercise and asserts the
// determinism-critical contracts live in the page — proving the spec's §1 claim
// that the pure core "runs identically inside a disconnected browser tab".
// Maintained as the live deploy proof; grows one block per shipped module.

import { normalizeLexicalEntry } from '../src/normalize.mjs';
import { FETCH_STATUS, CURATION_STATUS, isFetchTerminal, isCurationTerminal } from '../src/status.mjs';
import { deriveFetchPhase, deriveCurationPhase, DEFAULT_VALIDATION_STATE } from '../src/phases.mjs';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) throw new Error(`expected ${b}, got ${a}`);
};

// §4.1 — deterministic normalization pipeline
test('§4.1 locale-independent lowercase (Turkish İ → i + combining dot)', () =>
  eq(normalizeLexicalEntry('İ', { foldDiacritics: false }), 'İ'.toLowerCase()));
test('§4.1 collapses internal whitespace incl. NBSP', () =>
  eq(normalizeLexicalEntry('  a  b  ', { foldDiacritics: false }), 'a b'));
test('§4.1 folds Latin diacritics only when asked', () =>
  eq(normalizeLexicalEntry('Café', { foldDiacritics: true }), 'cafe'));
test('§4.1 preserves diacritics when not asked', () =>
  eq(normalizeLexicalEntry('Café', { foldDiacritics: false }), 'café'.normalize('NFC')));

// §3.1 / §3.2 — terminal-state predicates
test('§3.1 notStarted is non-terminal', () => eq(isFetchTerminal(FETCH_STATUS.NOT_STARTED), false));
test('§3.1 every other fetchStatus is terminal', () =>
  eq(Object.values(FETCH_STATUS).filter(s => s !== FETCH_STATUS.NOT_STARTED).every(isFetchTerminal), true));
test('§3.2 selected & rejected are terminal; uncurated is not', () =>
  eq([isCurationTerminal(CURATION_STATUS.SELECTED), isCurationTerminal(CURATION_STATUS.REJECTED),
      isCurationTerminal(CURATION_STATUS.UNCURATED)], [true, true, false]));

// §3.3 — total, count-based dataset-phase derivations
test('§3.3 empty dataset → Initialized / Uncurated', () =>
  eq([deriveFetchPhase([]), deriveCurationPhase([])], ['Initialized', 'Uncurated']));
test('§3.3 all-deferred → FullyFetched (open-world: absence ≠ failure)', () =>
  eq(deriveFetchPhase([{ fetchStatus: FETCH_STATUS.DEFERRED }, { fetchStatus: FETCH_STATUS.BLOCKED }]), 'FullyFetched'));
test('§3.3 mixed terminal + notStarted → PartiallyFetched', () =>
  eq(deriveFetchPhase([{ fetchStatus: FETCH_STATUS.FETCHED }, { fetchStatus: FETCH_STATUS.NOT_STARTED }]), 'PartiallyFetched'));
test('§3.3 default validationState is Unvalidated', () => eq(DEFAULT_VALIDATION_STATE, 'Unvalidated'));

// --- render -------------------------------------------------------------
export function runAll(root) {
  const results = tests.map(({ name, fn }) => {
    try { fn(); return { name, ok: true }; }
    catch (e) { return { name, ok: false, err: e.message }; }
  });
  const passed = results.filter(r => r.ok).length;
  const allOk = passed === results.length;
  root.innerHTML =
    `<p class="summary ${allOk ? 'pass' : 'fail'}">${allOk ? '✓' : '✗'} ${passed}/${results.length} assertions passed</p>` +
    results.map(r =>
      `<div class="row ${r.ok ? 'pass' : 'fail'}"><span class="tag">${r.ok ? 'PASS' : 'FAIL'}</span>` +
      `<span>${r.name}</span>${r.err ? `<small>${r.err}</small>` : ''}</div>`).join('');
  document.title = `${allOk ? '✓' : '✗'} LCE — ${passed}/${results.length}`;
  return allOk;
}
