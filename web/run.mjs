// In-browser self-test for the Lexicon Curator Engine core.
// Imports the SAME ES modules the Node smoke tests exercise and asserts the
// determinism-critical contracts live in the page — proving the spec's §1 claim
// that the pure core "runs identically inside a disconnected browser tab".
// Maintained as the live deploy proof; grows one block per shipped module.

import { normalizeLexicalEntry } from '../src/normalize.mjs';
import { FETCH_STATUS, CURATION_STATUS, isFetchTerminal, isCurationTerminal } from '../src/status.mjs';
import { deriveFetchPhase, deriveCurationPhase, DEFAULT_VALIDATION_STATE } from '../src/phases.mjs';
import { parseInput } from '../src/parse.mjs';
import { mintContentId, hashDataset } from '../src/identity.mjs';
import { applySelection, finalizeCuration, flagAmbiguous } from '../src/curation.mjs';
import { buildExportManifest } from '../src/manifest.mjs';
import { validateDataset } from '../src/validate.mjs';
import { runOffline } from '../src/pipeline.mjs';
import { pinnedSerialize, serializationHash } from '../src/serialize.mjs';
import { stripCredentials, scrubSecrets } from '../src/sanitize.mjs';

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

// §4.4 — RFC-4180 CSV parser → initialized LexicalEntry records
test('§4.4 parses header + quoted field with embedded comma', () => {
  const { entries } = parseInput('term,note\n"a,b",x\nCafé,y', { foldDiacritics: true });
  eq([entries.length, entries[0].lemma, entries[1].normalizedForm], [2, 'a,b', 'cafe']);
});
test('§4.4 initializes entries to notStarted / uncurated', () => {
  const { entries } = parseInput('term\nhello');
  eq([entries[0].fetchStatus, entries[0].curationStatus], [FETCH_STATUS.NOT_STARTED, CURATION_STATUS.UNCURATED]);
});
test('§4.4 skips blank lines', () => eq(parseInput('term\nx\n\n\ny').entries.length, 2));

// §5.1 / §5.2 — content-addressed identity (dependency-free SHA-256, runs in-browser)
test('§5.1 content id is deterministic & stable under key reordering', () =>
  eq(mintContentId({ a: 1, b: [2, 3] }), mintContentId({ b: [2, 3], a: 1 })));
test('§5.1 distinct content → distinct id', () => {
  if (mintContentId({ a: 1 }) === mintContentId({ a: 2 })) throw new Error('hash collision');
});
test('§5.2 dataset hash is sha256:-prefixed and key-order stable', () => {
  const h = hashDataset({ x: [1, 2], y: 3 });
  eq([h, h.startsWith('sha256:')], [hashDataset({ y: 3, x: [1, 2] }), true]);
});

// §3.2 — curation state transitions (the 'selected only via finalize' invariant)
const _st = () => ({ lexicalEntries: [{ lemma: 'x', normalizedForm: 'x', curationStatus: 'uncurated',
  candidateDefinitions: [], selectedDefinitions: [], resolutionEvents: [] }] });
const _cur = s => s.lexicalEntries[0].curationStatus;
test('§3.2 applySelection → partiallySelected, never directly selected', () =>
  eq(_cur(applySelection(_st(), 'x', ['c1'])), 'partiallySelected'));
test('§3.2 finalizeCuration with selections → selected', () =>
  eq(_cur(finalizeCuration(applySelection(_st(), 'x', ['c1']), 'x')), 'selected'));
test('§3.2 finalizeCuration with none → rejected', () =>
  eq(_cur(finalizeCuration(_st(), 'x')), 'rejected'));
test('§3.2 flagAmbiguous → ambiguous (terminal)', () =>
  eq(_cur(flagAmbiguous(_st(), 'x')), 'ambiguous'));

// §5.4 — ExportManifest (content-addressed JSON-LD over the dataset)
test('§5.4 manifest carries type, RDFC-1.0, datasetHash, derived phases', () => {
  const m = buildExportManifest({ lexicalEntries: [] }, { generatedAt: '2020-01-01T00:00:00Z' });
  eq([m['@type'], m.canonicalization, m.entryCount, m.fetchPhase, m.datasetHash.startsWith('sha256:')],
     ['lce:ExportManifest', 'RDFC-1.0', 0, 'Initialized', true]);
});

// §7 — validation engine, incl. the §7.1.6 credential-leak scan
test('§7 a clean dataset validates to ValidatedExport', () =>
  eq(validateDataset({ lexicalEntries: [] }).validationState, 'ValidatedExport'));
test('§7.1.1 a duplicate @id is rejected', () =>
  eq(validateDataset({ lexicalEntries: [{ '@id': 'dup' }, { '@id': 'dup' }] }).validationState, 'ValidationFailed'));
test('§7.1.6 a leaked secret is caught (no credential may export)', () => {
  const r = validateDataset({ lexicalEntries: [{ lemma: 'x', token: 'SECRET123' }] }, ['SECRET123']);
  eq([r.validationState, r.reasons.some(x => x.rule === 6)], ['ValidationFailed', true]);
});

// §8.2 — the whole offline pipeline, in the browser: CSV → validated JSON-LD
test('§8.2 runOffline: CSV → normalized, deferred, validated, content-addressed graph', () => {
  const { dataset, manifest } = runOffline('term\nSerendipity\nCAFÉ', { generatedAt: '2020-01-01T00:00:00Z' });
  eq([dataset.lexicalEntries.length, dataset.lexicalEntries[1].normalizedForm,
      dataset.lexicalEntries[0].fetchStatus, dataset.lexicalEntries[0]['@id'].startsWith('https://w3id.org/lce/id/'),
      manifest.fetchPhase, manifest.validationState],
     [2, 'café', 'deferred', true, 'FullyFetched', 'ValidatedExport']);
});

// §8.1 / §5.3 — pinned export serialization + serialization hash
test('§8.1 pinned serialization is canonical (order-independent, @id leads)', () => {
  const a = pinnedSerialize({ '@type': 'X', '@id': 'i', z: 1, a: 2 });
  eq([a, a.split('\n')[1].trim().startsWith('"@id"')],
     [pinnedSerialize({ a: 2, z: 1, '@id': 'i', '@type': 'X' }), true]);
});
test('§5.3 serializationHash is sha256:-prefixed and stable', () => {
  const h = serializationHash({ a: 1, b: 2 });
  eq([h.startsWith('sha256:'), h], [true, serializationHash({ b: 2, a: 1 })]);
});

// §4.3 — credential / untrusted-string leak-path closure
test('§4.3 strips credential URL params', () =>
  eq(stripCredentials('https://api.example/d?api_key=SEKRET&q=hi').includes('api_key=REDACTED'), true));
test('§4.3 scrubs secret substrings', () =>
  eq(scrubSecrets('key SEKRET here', ['SEKRET']), 'key [REDACTED] here'));

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
