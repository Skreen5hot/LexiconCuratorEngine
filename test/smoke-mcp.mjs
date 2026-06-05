import {
  lce_load_words,
  lce_fetch_definitions,
  lce_get_pending_matrix,
  lce_select_definitions,
  lce_finalize_curation,
  lce_validate,
  lce_export,
} from '../src/mcp-tools.mjs';

let failures = 0;
function assert(label, actual, expected) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) { console.error('FAIL [' + label + ']: expected ' + b + ', got ' + a); failures++; }
  else { console.log('PASS [' + label + ']'); }
}

const FIXED_NOW = '2026-06-05T12:00:00Z';
const API_PAYLOAD = [{
  word: 'serendipity',
  license: { name: 'CC BY-SA 3.0' },
  sourceUrls: ['https://en.wiktionary.org/wiki/serendipity'],
  meanings: [{ partOfSpeech: 'noun', definitions: [
    { definition: 'An unsought, unintended, and/or unexpected discovery.' },
    { definition: 'A combination of events which produce a good outcome.' },
  ]}],
}];
function makeResp(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}
const stubFetch = async url => url.includes('serendipity') ? makeResp(200, API_PAYLOAD) : makeResp(404, {});

// MCP-1: lce_load_words
{
  const s = lce_load_words({ words: ['serendipity', 'ephemeral'] });
  assert('MCP-1 @type', s['@type'], 'lce:LexiconDataset');
  assert('MCP-1 count', s.lexicalEntries.length, 2);
  assert('MCP-1 lemma', s.lexicalEntries[0].lemma, 'serendipity');
  assert('MCP-1 normalizedForm', s.lexicalEntries[0].normalizedForm, 'serendipity');
  assert('MCP-1 fetchStatus', s.lexicalEntries[0].fetchStatus, 'notStarted');
  assert('MCP-1 curationStatus', s.lexicalEntries[0].curationStatus, 'uncurated');
  assert('MCP-1 entry @type', s.lexicalEntries[0]['@type'], 'lce:LexicalEntry');
  assert('MCP-1 candidateDefs empty', s.lexicalEntries[0].candidateDefinitions, []);
}

// MCP-2: lce_fetch_definitions — injected stub, no real network
{
  const s0 = lce_load_words({ words: ['serendipity'] });
  const { state, envelopes } = await lce_fetch_definitions({ currentState: s0, online: true, fetchImpl: stubFetch });
  assert('MCP-2 envelopes array', Array.isArray(envelopes), true);
  assert('MCP-2 one envelope', envelopes.length, 1);
  assert('MCP-2 envelope status', envelopes[0].status, 'fetched');
  assert('MCP-2 envelope lemma', envelopes[0].lemma, 'serendipity');
  assert('MCP-2 fetchStatus fetched', state.lexicalEntries[0].fetchStatus, 'fetched');
  assert('MCP-2 candidates non-empty', state.lexicalEntries[0].candidateDefinitions.length > 0, true);
}

// MCP-3: lce_get_pending_matrix
{
  const s = lce_load_words({ words: ['cat', 'dog'] });
  const m = lce_get_pending_matrix({ currentState: s });
  assert('MCP-3 @type', m['@type'], 'lce:LexiconDataset');
  assert('MCP-3 both uncurated', m.lexicalEntries.length, 2);
}

// MCP-4: lce_select_definitions -> partiallySelected, selectionMethod:'agent'
{
  const s0 = lce_load_words({ words: ['serendipity'] });
  const { state: s1 } = await lce_fetch_definitions({ currentState: s0, online: true, fetchImpl: stubFetch });
  const cid = s1.lexicalEntries[0].candidateDefinitions[0]['@id'];
  const s2 = lce_select_definitions({ currentState: s1, lemma: 'serendipity', selectedIds: [cid], agentName: 'test-agent' });
  assert('MCP-4 partiallySelected', s2.lexicalEntries[0].curationStatus, 'partiallySelected');
  assert('MCP-4 selectionMethod', s2.lexicalEntries[0].selectedDefinitions[0].selectionMethod, 'agent');
  assert('MCP-4 curatedBy', s2.lexicalEntries[0].selectedDefinitions[0].curatedBy, 'test-agent');
  assert('MCP-4 selectedCandidate', s2.lexicalEntries[0].selectedDefinitions[0].selectedCandidate, cid);
}

// MCP-5: lce_finalize_curation -> selected (§3.2: sole path)
{
  const s0 = lce_load_words({ words: ['serendipity'] });
  const { state: s1 } = await lce_fetch_definitions({ currentState: s0, online: true, fetchImpl: stubFetch });
  const cid = s1.lexicalEntries[0].candidateDefinitions[0]['@id'];
  const s2 = lce_select_definitions({ currentState: s1, lemma: 'serendipity', selectedIds: [cid], agentName: 'a' });
  const s3 = lce_finalize_curation({ currentState: s2, lemma: 'serendipity' });
  assert('MCP-5 selected', s3.lexicalEntries[0].curationStatus, 'selected');
}

// MCP-6: lce_validate stamps validationState
{
  const s = lce_load_words({ words: ['cat'] });
  const { state, validationState, reasons } = lce_validate({ currentState: s });
  assert('MCP-6 validationState type', typeof validationState, 'string');
  assert('MCP-6 reasons array', Array.isArray(reasons), true);
  assert('MCP-6 stamped on state', state.validationState, validationState);
  assert('MCP-6 clean => ValidatedExport', validationState, 'ValidatedExport');
}

// MCP-7: lce_export returns serialization + manifest
{
  const s0 = lce_load_words({ words: ['serendipity'] });
  const { state: s1 } = await lce_fetch_definitions({ currentState: s0, online: true, fetchImpl: stubFetch });
  const cid = s1.lexicalEntries[0].candidateDefinitions[0]['@id'];
  const s2 = lce_select_definitions({ currentState: s1, lemma: 'serendipity', selectedIds: [cid], agentName: 'a' });
  const s3 = lce_finalize_curation({ currentState: s2, lemma: 'serendipity' });
  const { serialization, manifest } = lce_export({ currentState: s3, generatedAt: FIXED_NOW });
  assert('MCP-7 serialization string', typeof serialization, 'string');
  assert('MCP-7 serialization non-empty', serialization.length > 0, true);
  assert('MCP-7 manifest type', manifest['@type'], 'lce:ExportManifest');
  assert('MCP-7 datasetHash prefix', manifest.datasetHash.startsWith('sha256:'), true);
  let ok = false; try { JSON.parse(serialization); ok = true; } catch (_) {}
  assert('MCP-7 serialization valid JSON', ok, true);
}

// MCP-8: full end-to-end load -> fetch -> select -> finalize -> validate -> export, NO real network
{
  // step 1: load
  const s0 = lce_load_words({ words: ['serendipity'] });
  assert('MCP-8 s1 notStarted', s0.lexicalEntries[0].fetchStatus, 'notStarted');

  // step 2: fetch (injected stub)
  const { state: s1, envelopes } = await lce_fetch_definitions({
    currentState: s0, online: true, fetchImpl: stubFetch,
  });
  assert('MCP-8 s2 fetched', s1.lexicalEntries[0].fetchStatus, 'fetched');
  assert('MCP-8 s2 envelopes', envelopes.length, 1);

  // step 3: pending matrix still shows uncurated
  const matrix = lce_get_pending_matrix({ currentState: s1 });
  assert('MCP-8 s3 pending', matrix.lexicalEntries.length, 1);

  // step 4: select
  const cid = s1.lexicalEntries[0].candidateDefinitions[0]['@id'];
  const s2 = lce_select_definitions({
    currentState: s1, lemma: 'serendipity', selectedIds: [cid], agentName: 'smoke-agent',
  });
  assert('MCP-8 s4 partiallySelected', s2.lexicalEntries[0].curationStatus, 'partiallySelected');

  // step 5: finalize
  const s3 = lce_finalize_curation({ currentState: s2, lemma: 'serendipity' });
  assert('MCP-8 s5 selected', s3.lexicalEntries[0].curationStatus, 'selected');

  // step 6: validate
  const { state: s4, validationState } = lce_validate({ currentState: s3 });
  assert('MCP-8 s6 ValidatedExport', validationState, 'ValidatedExport');

  // step 7: export
  const { serialization, manifest } = lce_export({ currentState: s4, generatedAt: FIXED_NOW });
  assert('MCP-8 s7 serialization non-empty', serialization.length > 0, true);
  assert('MCP-8 s7 manifest type', manifest['@type'], 'lce:ExportManifest');
  assert('MCP-8 s7 entryCount', manifest.entryCount, 1);
  assert('MCP-8 s7 selectionCount', manifest.selectionCount, 1);
  assert('MCP-8 s7 fetchPhase', manifest.fetchPhase, 'FullyFetched');
  assert('MCP-8 s7 curationPhase', manifest.curationPhase, 'FullyCurated');
  assert('MCP-8 s7 validationState', manifest.validationState, 'ValidatedExport');
}

if (failures > 0) {
  console.error('\n' + failures + ' assertion(s) failed.');
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
}
