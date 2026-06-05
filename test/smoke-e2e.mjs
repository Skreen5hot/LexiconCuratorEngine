import { runOffline } from '../src/pipeline.mjs';

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

const CSV = 'term\ncat\ndog\nbird';
const GENERATED_AT = '2026-06-05T00:00:00Z';

const { dataset, manifest, validationReasons } = runOffline(CSV, { generatedAt: GENERATED_AT });

// E2E-1: dataset has correct structure
assert('E2E-1 dataset @type', dataset['@type'], 'lce:LexiconDataset');
assert('E2E-1 entry count', dataset.lexicalEntries.length, 3);

// E2E-2: all entries are deferred (offline policy)
assert('E2E-2 all deferred',
  dataset.lexicalEntries.every(e => e.fetchStatus === 'deferred'), true);

// E2E-3: all entries remain uncurated
assert('E2E-3 all uncurated',
  dataset.lexicalEntries.every(e => e.curationStatus === 'uncurated'), true);

// E2E-4: all entries have content-addressed @id
assert('E2E-4 all entries have @id',
  dataset.lexicalEntries.every(
    e => typeof e['@id'] === 'string' && e['@id'].startsWith('https://w3id.org/lce/id/')
  ), true);

// E2E-5: manifest is a valid ExportManifest
assert('E2E-5 manifest @type', manifest['@type'], 'lce:ExportManifest');
assert('E2E-5 manifest @id prefix',
  manifest['@id'].startsWith('https://w3id.org/lce/id/manifest/'), true);
assert('E2E-5 manifest @id hash segment',
  /^[0-9a-f]{32}$/.test(manifest['@id'].split('/').pop()), true);
assert('E2E-5 entryCount', manifest.entryCount, 3);
assert('E2E-5 selectionCount', manifest.selectionCount, 0);

// E2E-6: fetchPhase FullyFetched — all deferred entries are terminal (§3.3)
assert('E2E-6 fetchPhase FullyFetched', manifest.fetchPhase, 'FullyFetched');

// E2E-7: curationPhase Uncurated
assert('E2E-7 curationPhase Uncurated', manifest.curationPhase, 'Uncurated');

// E2E-8: ValidatedExport — clean offline run has no constraint violations
assert('E2E-8 manifest validationState', manifest.validationState, 'ValidatedExport');
assert('E2E-8 dataset validationState', dataset.validationState, 'ValidatedExport');

// E2E-9: datasetHash is content-addressed (sha256: prefix, 64-char hex)
assert('E2E-9 datasetHash prefix', manifest.datasetHash.startsWith('sha256:'), true);
assert('E2E-9 datasetHash hex length', manifest.datasetHash.slice('sha256:'.length).length, 64);
assert('E2E-9 datasetHash hex chars',
  /^[0-9a-f]{64}$/.test(manifest.datasetHash.slice('sha256:'.length)), true);

// E2E-10: determinism — identical inputs → byte-identical outputs
{
  const { dataset: ds2, manifest: m2 } = runOffline(CSV, { generatedAt: GENERATED_AT });
  assert('E2E-10 manifest @id determinism', manifest['@id'], m2['@id']);
  assert('E2E-10 datasetHash determinism', manifest.datasetHash, m2.datasetHash);
  assert('E2E-10 full manifest determinism', JSON.stringify(manifest), JSON.stringify(m2));
  assert('E2E-10 full dataset determinism', JSON.stringify(dataset), JSON.stringify(ds2));
}

// E2E-11: no validation failures for a clean offline run
assert('E2E-11 no validation reasons', validationReasons.length, 0);

// E2E-12: manifestGeneratedAt echoed verbatim
assert('E2E-12 manifestGeneratedAt', manifest.manifestGeneratedAt, GENERATED_AT);

// E2E-13: normalization applied — normalizedForm is lowercased
assert('E2E-13 cat normalizedForm', dataset.lexicalEntries[0].normalizedForm, 'cat');

// E2E-14: each entry carries an offline ResolutionNotice
assert('E2E-14 each entry has resolutionEvent',
  dataset.lexicalEntries.every(e => e.resolutionEvents.length >= 1), true);
assert('E2E-14 notice @type',
  dataset.lexicalEntries[0].resolutionEvents[0]['@type'], 'lce:ResolutionNotice');

// E2E-15: distinct terms → distinct content-addressed @ids
{
  const ids = dataset.lexicalEntries.map(e => e['@id']);
  assert('E2E-15 distinct entry @ids', new Set(ids).size, 3);
}

// E2E-16: canonicalization and hashAlgorithm fields present
assert('E2E-16 canonicalization', manifest.canonicalization, 'sorted-keys-json');
assert('E2E-16 hashAlgorithm', manifest.hashAlgorithm, 'SHA-256');

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
}
