import {
  applyCandidateDefinitions,
  applySelection,
  finalizeCuration,
  flagAmbiguous,
  mintCandidateId,
  mintSelectionId,
} from '../src/curation.mjs';

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

function makeState(entries) {
  return { '@type': 'lce:LexiconDataset', lexicalEntries: entries };
}

function makeEntry(lemma, overrides = {}) {
  return {
    '@type': 'lce:LexicalEntry',
    lemma,
    normalizedForm: lemma.toLowerCase(),
    fetchStatus: 'notStarted',
    curationStatus: 'uncurated',
    candidateDefinitions: [],
    selectedDefinitions: [],
    resolutionEvents: [],
    ...overrides,
  };
}

// AC-C0: §5.1 worked example — known hash vector
{
  const id = mintCandidateId('example', 'wiktionary', 'A representative form of a group.');
  assert('AC-C0 mintCandidateId known vector', id,
    'https://w3id.org/lce/id/def/574f5dcf92b9aef50299ae9f96af73b5');
}

// AC-C1: T-1.6 applyCandidateDefinitions — fetchStatus updated, candidate added, idempotent
{
  const candidateId = mintCandidateId('example', 'wiktionary', 'A representative form of a group.');
  const envelope = {
    lemma: 'example',
    adapter: 'wiktionary',
    adapterVersion: '1.0.0',
    credentialPolicy: 'none',
    credentialUsed: false,
    status: 'fetched',
    retrievedAt: '2026-06-05T00:00:00Z',
    candidates: [{
      '@id': candidateId,
      '@type': 'lce:DefinitionCandidate',
      definitionText: 'A representative form of a group.',
      rank: 1,
      adapter: 'wiktionary',
    }],
    notices: [],
  };
  const state = makeState([makeEntry('example')]);
  const state2 = applyCandidateDefinitions(state, 'example', envelope);
  assert('AC-C1 fetchStatus fetched', state2.lexicalEntries[0].fetchStatus, 'fetched');
  assert('AC-C1 candidate added', state2.lexicalEntries[0].candidateDefinitions.length, 1);
  assert('AC-C1 candidate @id', state2.lexicalEntries[0].candidateDefinitions[0]['@id'], candidateId);
  // Idempotent: re-applying the same envelope must not duplicate
  const state3 = applyCandidateDefinitions(state2, 'example', envelope);
  assert('AC-C1 idempotent candidate count', state3.lexicalEntries[0].candidateDefinitions.length, 1);
  // No mutation of original state
  assert('AC-C1 no mutation fetchStatus', state.lexicalEntries[0].fetchStatus, 'notStarted');
  assert('AC-C1 no mutation candidates', state.lexicalEntries[0].candidateDefinitions.length, 0);
}

// AC-C2: T-1.6 deferred envelope — fetchStatus deferred, notice attached, no candidates
{
  const envelope = {
    lemma: 'offline-term',
    adapter: 'wiktionary',
    adapterVersion: '1.0.0',
    credentialPolicy: 'none',
    credentialUsed: false,
    status: 'deferred',
    candidates: [],
    notices: [{ reason: 'OfflinePolicy', message: 'Lookup not attempted; shell declared online:false.' }],
  };
  const state = makeState([makeEntry('offline-term')]);
  const state2 = applyCandidateDefinitions(state, 'offline-term', envelope);
  assert('AC-C2 deferred fetchStatus', state2.lexicalEntries[0].fetchStatus, 'deferred');
  assert('AC-C2 no candidates', state2.lexicalEntries[0].candidateDefinitions.length, 0);
  assert('AC-C2 notice added', state2.lexicalEntries[0].resolutionEvents.length, 1);
  assert('AC-C2 notice @type', state2.lexicalEntries[0].resolutionEvents[0]['@type'], 'lce:ResolutionNotice');
}

// AC-C3: T-1.7 applySelection — moves to partiallySelected, NEVER to selected
{
  const candidateId = mintCandidateId('example', 'wiktionary', 'A representative form of a group.');
  const entry = makeEntry('example', {
    fetchStatus: 'fetched',
    candidateDefinitions: [{
      '@id': candidateId,
      '@type': 'lce:DefinitionCandidate',
      definitionText: 'A representative form of a group.',
    }],
  });
  const state = makeState([entry]);
  const meta = { selectionMethod: 'agent', curatedBy: { '@type': 'schema:Agent', name: 'Test' }, selectedAt: '2026-06-05T00:00:00Z' };
  const state2 = applySelection(state, 'example', [candidateId], meta);
  assert('AC-C3 curationStatus partiallySelected', state2.lexicalEntries[0].curationStatus, 'partiallySelected');
  assert('AC-C3 one selection', state2.lexicalEntries[0].selectedDefinitions.length, 1);
  assert('AC-C3 selectedCandidate', state2.lexicalEntries[0].selectedDefinitions[0].selectedCandidate, candidateId);
  assert('AC-C3 selection @id', state2.lexicalEntries[0].selectedDefinitions[0]['@id'], mintSelectionId(candidateId));
  assert('AC-C3 §3.2 NOT selected after applySelection', state2.lexicalEntries[0].curationStatus, 'partiallySelected');
  // No mutation
  assert('AC-C3 no mutation', state.lexicalEntries[0].curationStatus, 'uncurated');
}

// AC-C4: T-1.7 empty selectedIds + finalize → rejected
{
  const state = makeState([makeEntry('word')]);
  const state2 = applySelection(state, 'word', [], { finalize: true });
  assert('AC-C4 empty+finalize → rejected', state2.lexicalEntries[0].curationStatus, 'rejected');
}

// AC-C5: T-1.7 empty selectedIds without finalize → no-op
{
  const state = makeState([makeEntry('word')]);
  const state2 = applySelection(state, 'word', [], {});
  assert('AC-C5 empty no-finalize → no-op', state2.lexicalEntries[0].curationStatus, 'uncurated');
}

// AC-C5b: T-1.7 null selectedIds without finalize → no-op
{
  const state = makeState([makeEntry('word')]);
  const state2 = applySelection(state, 'word', null, {});
  assert('AC-C5b null no-finalize → no-op', state2.lexicalEntries[0].curationStatus, 'uncurated');
}

// AC-C6: T-1.8 finalizeCuration with selections → selected
{
  const candidateId = mintCandidateId('cat', 'wiktionary', 'A small mammal.');
  const selId = mintSelectionId(candidateId);
  const entry = makeEntry('cat', {
    fetchStatus: 'fetched',
    curationStatus: 'partiallySelected',
    candidateDefinitions: [{ '@id': candidateId }],
    selectedDefinitions: [{ '@id': selId, selectedCandidate: candidateId }],
  });
  const state = makeState([entry]);
  const state2 = finalizeCuration(state, 'cat');
  assert('AC-C6 finalize → selected', state2.lexicalEntries[0].curationStatus, 'selected');
  // No mutation
  assert('AC-C6 no mutation', state.lexicalEntries[0].curationStatus, 'partiallySelected');
}

// AC-C7: T-1.8 finalizeCuration with no selections → rejected
{
  const state = makeState([makeEntry('nothing')]);
  const state2 = finalizeCuration(state, 'nothing');
  assert('AC-C7 finalize no selections → rejected', state2.lexicalEntries[0].curationStatus, 'rejected');
}

// AC-C8: §3.2 invariant — 'selected' reachable ONLY via finalizeCuration
{
  const candidateId = mintCandidateId('test', 'wiktionary', 'Some text.');
  const entry = makeEntry('test', {
    fetchStatus: 'fetched',
    candidateDefinitions: [{ '@id': candidateId, definitionText: 'Some text.' }],
  });
  const state = makeState([entry]);
  const afterSelect = applySelection(state, 'test', [candidateId], {});
  assert('AC-C8 applySelection → partiallySelected (not selected)', afterSelect.lexicalEntries[0].curationStatus, 'partiallySelected');
  const afterFinalize = finalizeCuration(afterSelect, 'test');
  assert('AC-C8 finalizeCuration → selected', afterFinalize.lexicalEntries[0].curationStatus, 'selected');
}

// AC-C9: T-1.9 flagAmbiguous
{
  const state = makeState([makeEntry('ambig')]);
  const state2 = flagAmbiguous(state, 'ambig', { reason: 'Multiple valid meanings' });
  assert('AC-C9 flagAmbiguous → ambiguous', state2.lexicalEntries[0].curationStatus, 'ambiguous');
  assert('AC-C9 no mutation', state.lexicalEntries[0].curationStatus, 'uncurated');
}

// AC-C10: multi-entry state — only the target entry is modified
{
  const state = makeState([makeEntry('alpha'), makeEntry('beta')]);
  const state2 = flagAmbiguous(state, 'alpha', {});
  assert('AC-C10 target entry modified', state2.lexicalEntries[0].curationStatus, 'ambiguous');
  assert('AC-C10 non-target entry unchanged', state2.lexicalEntries[1].curationStatus, 'uncurated');
}

// AC-C11: mintSelectionId mirrors candidate hash under /sel/ prefix
{
  const cid = mintCandidateId('dog', 'wiktionary', 'A domesticated canine.');
  const sid = mintSelectionId(cid);
  assert('AC-C11 sel prefix', sid.startsWith('https://w3id.org/lce/id/sel/'), true);
  assert('AC-C11 sel hash matches def hash', sid.split('/').pop(), cid.split('/').pop());
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
}
