import { validateDataset } from '../src/validate.mjs';

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

function makeValidSel(selId, candidateId) {
  return {
    '@id': selId,
    '@type': 'lce:DefinitionSelection',
    selectedCandidate: candidateId,
    curatedBy: { '@type': 'schema:Agent', name: 'Tester' },
    selectionMethod: 'manual',
  };
}

// AC-V1: empty dataset → ValidatedExport, zero reasons
{
  const result = validateDataset({ '@type': 'lce:LexiconDataset', lexicalEntries: [] });
  assert('AC-V1 empty → ValidatedExport', result.validationState, 'ValidatedExport');
  assert('AC-V1 no reasons', result.reasons.length, 0);
}

// AC-V1b: fully valid selected entry → ValidatedExport
{
  const cid = 'https://w3id.org/lce/id/def/c001';
  const sid = 'https://w3id.org/lce/id/sel/c001';
  const dataset = {
    '@type': 'lce:LexiconDataset',
    lexicalEntries: [{
      '@id': 'https://w3id.org/lce/id/entry/e001',
      lemma: 'cat',
      fetchStatus: 'fetched',
      curationStatus: 'selected',
      candidateDefinitions: [{ '@id': cid, '@type': 'lce:DefinitionCandidate' }],
      selectedDefinitions: [makeValidSel(sid, cid)],
      resolutionEvents: [],
    }],
  };
  const result = validateDataset(dataset);
  assert('AC-V1b valid selected → ValidatedExport', result.validationState, 'ValidatedExport');
  assert('AC-V1b no reasons', result.reasons.length, 0);
}

// AC-V2: §7.1.1 duplicate @id → rule 1 (no throw)
{
  const dupeId = 'https://w3id.org/lce/id/def/dupe0001';
  let threw = false;
  let result;
  try {
    result = validateDataset({
      lexicalEntries: [
        { lemma: 'a', fetchStatus: 'notStarted', curationStatus: 'uncurated',
          candidateDefinitions: [{ '@id': dupeId }], selectedDefinitions: [], resolutionEvents: [] },
        { lemma: 'b', fetchStatus: 'notStarted', curationStatus: 'uncurated',
          candidateDefinitions: [{ '@id': dupeId }], selectedDefinitions: [], resolutionEvents: [] },
      ],
    });
  } catch (e) { threw = true; }
  assert('AC-V2 duplicate does not throw', threw, false);
  assert('AC-V2 → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V2 rule 1 present', result.reasons.some(r => r.rule === 1), true);
  assert('AC-V2 colliding id recorded', result.reasons.some(r => r.rule === 1 && r.id === dupeId), true);
}

// AC-V3: §7.1.2 lineage violation → rule 2
{
  const realId = 'https://w3id.org/lce/id/def/real';
  const fakeId = 'https://w3id.org/lce/id/def/fake';
  const sid    = 'https://w3id.org/lce/id/sel/s001';
  const dataset = {
    lexicalEntries: [{
      lemma: 'word', fetchStatus: 'fetched', curationStatus: 'selected',
      candidateDefinitions: [{ '@id': realId, '@type': 'lce:DefinitionCandidate' }],
      selectedDefinitions: [{
        '@id': sid, '@type': 'lce:DefinitionSelection',
        selectedCandidate: fakeId,
        curatedBy: { '@type': 'schema:Agent', name: 'T' },
        selectionMethod: 'manual',
      }],
      resolutionEvents: [],
    }],
  };
  const result = validateDataset(dataset);
  assert('AC-V3 lineage → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V3 rule 2 present', result.reasons.some(r => r.rule === 2), true);
}

// AC-V4: §7.1.3 ResolutionNotice appearing in selectedDefinitions → rule 3
{
  const sid = 'https://w3id.org/lce/id/sel/s002';
  const dataset = {
    lexicalEntries: [{
      lemma: 'w', fetchStatus: 'fetched', curationStatus: 'selected',
      candidateDefinitions: [],
      selectedDefinitions: [{
        '@id': sid, '@type': 'lce:ResolutionNotice',
        selectedCandidate: 'https://w3id.org/lce/id/def/nope',
        curatedBy: { '@type': 'schema:Agent', name: 'T' },
        selectionMethod: 'manual',
      }],
      resolutionEvents: [],
    }],
  };
  const result = validateDataset(dataset);
  assert('AC-V4 ResolutionNotice in sels → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V4 rule 3 present', result.reasons.some(r => r.rule === 3), true);
}

// AC-V4b: §7.1.3 selectedCandidate references a resolutionEvent → rule 3
{
  const noticeId = 'https://w3id.org/lce/id/notice/n001';
  const sid      = 'https://w3id.org/lce/id/sel/s003';
  const dataset = {
    lexicalEntries: [{
      lemma: 'w', fetchStatus: 'fetched', curationStatus: 'selected',
      candidateDefinitions: [],
      selectedDefinitions: [{
        '@id': sid, '@type': 'lce:DefinitionSelection',
        selectedCandidate: noticeId,
        curatedBy: { '@type': 'schema:Agent', name: 'T' },
        selectionMethod: 'agent',
      }],
      resolutionEvents: [{ '@id': noticeId, '@type': 'lce:ResolutionNotice', reason: 'blocked' }],
    }],
  };
  const result = validateDataset(dataset);
  assert('AC-V4b selectedCandidate→notice → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V4b rule 3 present', result.reasons.some(r => r.rule === 3), true);
}

// AC-V5: §7.1.4 fetchStatus !=='fetched' but candidateDefinitions non-empty → rule 4
{
  const dataset = {
    lexicalEntries: [{
      lemma: 'x', fetchStatus: 'notStarted', curationStatus: 'uncurated',
      candidateDefinitions: [{ '@id': 'https://w3id.org/lce/id/def/c99' }],
      selectedDefinitions: [], resolutionEvents: [],
    }],
  };
  const result = validateDataset(dataset);
  assert('AC-V5 notStarted+candidates → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V5 rule 4 present', result.reasons.some(r => r.rule === 4), true);
}

// AC-V6: §7.1.4 curationStatus 'rejected' + non-empty selectedDefinitions → rule 4
{
  const cid = 'https://w3id.org/lce/id/def/r1';
  const sid = 'https://w3id.org/lce/id/sel/r1';
  const dataset = {
    lexicalEntries: [{
      lemma: 'x', fetchStatus: 'fetched', curationStatus: 'rejected',
      candidateDefinitions: [{ '@id': cid, '@type': 'lce:DefinitionCandidate' }],
      selectedDefinitions: [makeValidSel(sid, cid)],
      resolutionEvents: [],
    }],
  };
  const result = validateDataset(dataset);
  assert('AC-V6 rejected+non-empty sels → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V6 rule 4 present', result.reasons.some(r => r.rule === 4), true);
}

// AC-V7: §7.1.4 curationStatus 'selected' + fetchStatus !=='fetched' → rule 4
{
  const dataset = {
    lexicalEntries: [{
      lemma: 'x', fetchStatus: 'deferred', curationStatus: 'selected',
      candidateDefinitions: [], selectedDefinitions: [], resolutionEvents: [],
    }],
  };
  const result = validateDataset(dataset);
  assert('AC-V7 selected+deferred → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V7 rule 4 present', result.reasons.some(r => r.rule === 4), true);
}

// AC-V8: §7.1.4 curationStatus 'selected' + empty selectedDefinitions → rule 4
{
  const dataset = {
    lexicalEntries: [{
      lemma: 'x', fetchStatus: 'fetched', curationStatus: 'selected',
      candidateDefinitions: [], selectedDefinitions: [], resolutionEvents: [],
    }],
  };
  const result = validateDataset(dataset);
  assert('AC-V8 selected+empty sels → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V8 rule 4 present', result.reasons.some(r => r.rule === 4), true);
}

// AC-V9: §7.1.4 curationStatus 'partiallySelected' + empty selectedDefinitions → rule 4
{
  const dataset = {
    lexicalEntries: [{
      lemma: 'x', fetchStatus: 'fetched', curationStatus: 'partiallySelected',
      candidateDefinitions: [], selectedDefinitions: [], resolutionEvents: [],
    }],
  };
  const result = validateDataset(dataset);
  assert('AC-V9 partiallySelected+empty → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V9 rule 4 present', result.reasons.some(r => r.rule === 4), true);
}

// AC-V10: §7.1.5 DefinitionSelection missing curatedBy → rule 5
{
  const cid = 'https://w3id.org/lce/id/def/c010';
  const sid = 'https://w3id.org/lce/id/sel/c010';
  const dataset = {
    lexicalEntries: [{
      lemma: 'x', fetchStatus: 'fetched', curationStatus: 'selected',
      candidateDefinitions: [{ '@id': cid, '@type': 'lce:DefinitionCandidate' }],
      selectedDefinitions: [{
        '@id': sid, '@type': 'lce:DefinitionSelection',
        selectedCandidate: cid,
        selectionMethod: 'manual',
      }],
      resolutionEvents: [],
    }],
  };
  const result = validateDataset(dataset);
  assert('AC-V10 missing curatedBy → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V10 rule 5 present', result.reasons.some(r => r.rule === 5), true);
}

// AC-V11: §7.1.5 invalid selectionMethod → rule 5
{
  const cid = 'https://w3id.org/lce/id/def/c011';
  const sid = 'https://w3id.org/lce/id/sel/c011';
  const dataset = {
    lexicalEntries: [{
      lemma: 'x', fetchStatus: 'fetched', curationStatus: 'selected',
      candidateDefinitions: [{ '@id': cid, '@type': 'lce:DefinitionCandidate' }],
      selectedDefinitions: [{
        '@id': sid, '@type': 'lce:DefinitionSelection',
        selectedCandidate: cid,
        curatedBy: { '@type': 'schema:Agent', name: 'T' },
        selectionMethod: 'robot',
      }],
      resolutionEvents: [],
    }],
  };
  const result = validateDataset(dataset);
  assert('AC-V11 invalid selectionMethod → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V11 rule 5 present', result.reasons.some(r => r.rule === 5), true);
}

// AC-V11b: 'agent' is a valid selectionMethod
{
  const cid = 'https://w3id.org/lce/id/def/c015';
  const sid = 'https://w3id.org/lce/id/sel/c015';
  const dataset = {
    lexicalEntries: [{
      lemma: 'x', fetchStatus: 'fetched', curationStatus: 'selected',
      candidateDefinitions: [{ '@id': cid, '@type': 'lce:DefinitionCandidate' }],
      selectedDefinitions: [{
        '@id': sid, '@type': 'lce:DefinitionSelection',
        selectedCandidate: cid,
        curatedBy: { '@type': 'schema:SoftwareApplication', name: 'LCE-agent' },
        selectionMethod: 'agent',
      }],
      resolutionEvents: [],
    }],
  };
  const result = validateDataset(dataset);
  assert('AC-V11b agent selectionMethod → ValidatedExport', result.validationState, 'ValidatedExport');
}

// AC-V12: §7.1.6 secret value in graph → rule 6
{
  const secret = 'sk-supersecret-key-9999';
  const dataset = { '@type': 'lce:LexiconDataset', meta: `token: ${secret}`, lexicalEntries: [] };
  const result = validateDataset(dataset, [secret]);
  assert('AC-V12 secret in graph → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V12 rule 6 present', result.reasons.some(r => r.rule === 6), true);
}

// AC-V12b: §1.1 no secrets arg → ignores secret-looking strings
{
  const dataset = { '@type': 'lce:LexiconDataset', meta: 'token: sk-should-not-matter', lexicalEntries: [] };
  const result = validateDataset(dataset, []);
  assert('AC-V12b no secrets arg → ValidatedExport', result.validationState, 'ValidatedExport');
}

// AC-V13: no short-circuit — multiple distinct violations surfaced in one run
{
  const dupeId = 'https://w3id.org/lce/id/def/multi';
  const dataset = {
    lexicalEntries: [
      { lemma: 'a', fetchStatus: 'notStarted', curationStatus: 'partiallySelected',
        candidateDefinitions: [{ '@id': dupeId }], selectedDefinitions: [], resolutionEvents: [] },
      { lemma: 'b', fetchStatus: 'notStarted', curationStatus: 'uncurated',
        candidateDefinitions: [{ '@id': dupeId }], selectedDefinitions: [], resolutionEvents: [] },
    ],
  };
  const result = validateDataset(dataset);
  assert('AC-V13 → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V13 rule 1 present', result.reasons.some(r => r.rule === 1), true);
  assert('AC-V13 rule 4 present', result.reasons.some(r => r.rule === 4), true);
  assert('AC-V13 multiple violations', result.reasons.length >= 3, true);
}

// AC-V14: illegal status token values → rule 'status'
{
  const dataset = {
    lexicalEntries: [{
      lemma: 'x', fetchStatus: 'bogus', curationStatus: 'invalid',
      candidateDefinitions: [], selectedDefinitions: [], resolutionEvents: [],
    }],
  };
  const result = validateDataset(dataset);
  assert('AC-V14 invalid tokens → ValidationFailed', result.validationState, 'ValidationFailed');
  assert('AC-V14 status rule present', result.reasons.some(r => r.rule === 'status'), true);
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
}
