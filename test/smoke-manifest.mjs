import { buildExportManifest } from '../src/manifest.mjs';
import { hashDataset } from '../src/identity.mjs';

let failures = 0;

function assert(label, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    console.error(`FAIL [${label}]: expected ${b}, got ${a}`);
    failures++;
  } else {
    console.log(`PASS [${label}]`);
  }
}

function makeDataset(entries = [], overrides = {}) {
  return { '@type': 'lce:LexiconDataset', lexicalEntries: entries, ...overrides };
}

function makeEntry(lemma, fetchStatus = 'notStarted', curationStatus = 'uncurated', selectedDefs = []) {
  return {
    '@type': 'lce:LexicalEntry',
    lemma,
    normalizedForm: lemma.toLowerCase(),
    fetchStatus,
    curationStatus,
    candidateDefinitions: [],
    selectedDefinitions: selectedDefs,
    resolutionEvents: [],
  };
}

// AC-M1: manifest has all required JSON-LD fields
{
  const ds = makeDataset([]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M1 @type', m['@type'], 'lce:ExportManifest');
  assert('AC-M1 canonicalization', m.canonicalization, 'RDFC-1.0');
  assert('AC-M1 hashAlgorithm', m.hashAlgorithm, 'SHA-256');
  assert('AC-M1 @id prefix', m['@id'].startsWith('https://w3id.org/lce/id/manifest/'), true);
  assert('AC-M1 @id hash segment length', m['@id'].split('/').pop().length, 32);
  assert('AC-M1 @id hash is lowercase hex', /^[0-9a-f]{32}$/.test(m['@id'].split('/').pop()), true);
}

// AC-M2: datasetHash matches hashDataset output
{
  const ds = makeDataset([makeEntry('cat')]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M2 datasetHash matches hashDataset', m.datasetHash, hashDataset(ds));
  assert('AC-M2 datasetHash sha256: prefix', m.datasetHash.startsWith('sha256:'), true);
  assert('AC-M2 datasetHash 64-char hex', m.datasetHash.slice('sha256:'.length).length, 64);
}

// AC-M3: determinism — identical inputs → identical manifest
{
  const ds = makeDataset([makeEntry('example')]);
  const opts = { generatedAt: '2026-06-05T12:00:00Z' };
  const m1 = buildExportManifest(ds, opts);
  const m2 = buildExportManifest(ds, opts);
  assert('AC-M3 determinism @id', m1['@id'], m2['@id']);
  assert('AC-M3 determinism datasetHash', m1.datasetHash, m2.datasetHash);
  assert('AC-M3 determinism full manifest', JSON.stringify(m1), JSON.stringify(m2));
}

// AC-M4: different generatedAt → different manifest @id
{
  const ds = makeDataset([makeEntry('word')]);
  const m1 = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  const m2 = buildExportManifest(ds, { generatedAt: '2026-06-05T01:00:00Z' });
  assert('AC-M4 different time → different @id', m1['@id'] !== m2['@id'], true);
}

// AC-M5: different dataset content → different manifest @id and datasetHash
{
  const ds1 = makeDataset([makeEntry('cat')]);
  const ds2 = makeDataset([makeEntry('dog')]);
  const opts = { generatedAt: '2026-06-05T00:00:00Z' };
  const m1 = buildExportManifest(ds1, opts);
  const m2 = buildExportManifest(ds2, opts);
  assert('AC-M5 different dataset → different @id', m1['@id'] !== m2['@id'], true);
  assert('AC-M5 different dataset → different datasetHash', m1.datasetHash !== m2.datasetHash, true);
}

// AC-M6: entryCount reflects number of entries
{
  const ds = makeDataset([makeEntry('a'), makeEntry('b'), makeEntry('c')]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M6 entryCount', m.entryCount, 3);
}

// AC-M7: selectionCount sums selectedDefinitions across all entries
{
  const sel1 = { '@id': 'https://w3id.org/lce/id/sel/aaa', selectedCandidate: 'c1' };
  const sel2 = { '@id': 'https://w3id.org/lce/id/sel/bbb', selectedCandidate: 'c2' };
  const ds = makeDataset([
    makeEntry('cat', 'fetched', 'selected', [sel1]),
    makeEntry('dog', 'fetched', 'selected', [sel2]),
    makeEntry('bird', 'notStarted', 'uncurated', []),
  ]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M7 selectionCount', m.selectionCount, 2);
}

// AC-M8: fetchPhase derived from entries (§3.3)
{
  const ds = makeDataset([makeEntry('a', 'notStarted')]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M8 fetchPhase Initialized', m.fetchPhase, 'Initialized');
}
{
  const ds = makeDataset([makeEntry('a', 'fetched')]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M8 fetchPhase FullyFetched', m.fetchPhase, 'FullyFetched');
}
{
  const ds = makeDataset([makeEntry('a', 'deferred'), makeEntry('b', 'notStarted')]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M8 fetchPhase PartiallyFetched', m.fetchPhase, 'PartiallyFetched');
}
{
  // all-deferred is FullyFetched per §3.3 open-world rule
  const ds = makeDataset([makeEntry('a', 'deferred'), makeEntry('b', 'blocked')]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M8 all-deferred/blocked → FullyFetched', m.fetchPhase, 'FullyFetched');
}

// AC-M9: curationPhase derived from entries (§3.3)
{
  const ds = makeDataset([makeEntry('a', 'notStarted', 'uncurated')]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M9 curationPhase Uncurated', m.curationPhase, 'Uncurated');
}
{
  const ds = makeDataset([makeEntry('a', 'fetched', 'selected'), makeEntry('b', 'fetched', 'rejected')]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M9 curationPhase FullyCurated', m.curationPhase, 'FullyCurated');
}
{
  const ds = makeDataset([makeEntry('a', 'fetched', 'selected'), makeEntry('b', 'notStarted', 'uncurated')]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M9 curationPhase PartiallyCurated', m.curationPhase, 'PartiallyCurated');
}

// AC-M10: validationState defaults to Unvalidated when not set
{
  const ds = makeDataset([]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M10 validationState default', m.validationState, 'Unvalidated');
}

// AC-M11: validationState taken from dataset when set
{
  const ds = { ...makeDataset([]), validationState: 'ValidatedExport' };
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M11 validationState from dataset', m.validationState, 'ValidatedExport');
}
{
  const ds = { ...makeDataset([]), validationState: 'ValidationFailed' };
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M11 validationState ValidationFailed', m.validationState, 'ValidationFailed');
}

// AC-M12: serializationHash present when supplied
{
  const ds = makeDataset([]);
  const sh = 'sha256:' + 'a'.repeat(64);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z', serializationHash: sh });
  assert('AC-M12 serializationHash present', m.serializationHash, sh);
}

// AC-M13: serializationHash absent when not supplied
{
  const ds = makeDataset([]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M13 serializationHash absent', 'serializationHash' in m, false);
}

// AC-M14: empty dataset → correct defaults for all fields
{
  const ds = makeDataset([]);
  const m = buildExportManifest(ds, { generatedAt: '2026-06-05T00:00:00Z' });
  assert('AC-M14 empty entryCount', m.entryCount, 0);
  assert('AC-M14 empty selectionCount', m.selectionCount, 0);
  assert('AC-M14 empty fetchPhase', m.fetchPhase, 'Initialized');
  assert('AC-M14 empty curationPhase', m.curationPhase, 'Uncurated');
  assert('AC-M14 empty validationState', m.validationState, 'Unvalidated');
}

// AC-M15: manifestGeneratedAt is echoed verbatim
{
  const ds = makeDataset([]);
  const ts = '2026-06-05T09:30:00Z';
  const m = buildExportManifest(ds, { generatedAt: ts });
  assert('AC-M15 manifestGeneratedAt echoed', m.manifestGeneratedAt, ts);
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
}
