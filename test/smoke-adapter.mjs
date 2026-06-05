import { fetchDefinitions, adapterVersion } from '../src/adapter.mjs';

let failures = 0;

function assert(label, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    console.error('FAIL [' + label + ']: expected ' + b + ', got ' + a);
    failures++;
  } else {
    console.log('PASS [' + label + ']');
  }
}

function makeResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

const FIXED_NOW = '2026-06-05T12:00:00Z';
const fixedNow = () => FIXED_NOW;

// AD-1: deferred — online:false -> 'deferred', OfflinePolicy notice, no candidates, no retrievedAt
{
  const result = await fetchDefinitions('serendipity', { online: false, now: fixedNow });
  assert('AD-1 status deferred', result.status, 'deferred');
  assert('AD-1 candidates empty', result.candidates.length, 0);
  assert('AD-1 OfflinePolicy reason', result.notices[0].reason, 'OfflinePolicy');
  assert('AD-1 notice @type', result.notices[0]['@type'], 'lce:ResolutionNotice');
  assert('AD-1 adapter name', result.adapter, 'dictionaryapi.dev');
  assert('AD-1 credentialPolicy none', result.credentialPolicy, 'none');
  assert('AD-1 no retrievedAt', 'retrievedAt' in result, false);
  assert('AD-1 lemma echoed', result.lemma, 'serendipity');
}

// AD-2: unavailable — HTTP 404 -> 'unavailable', empty notices, no retrievedAt
{
  const stubFetch = async () => makeResponse(404, { title: 'No Definitions Found' });
  const result = await fetchDefinitions('xyzzy', { online: true, fetchImpl: stubFetch, now: fixedNow });
  assert('AD-2 status unavailable', result.status, 'unavailable');
  assert('AD-2 candidates empty', result.candidates.length, 0);
  assert('AD-2 notices empty', result.notices.length, 0);
  assert('AD-2 no retrievedAt', 'retrievedAt' in result, false);
}

// AD-3: blocked — fetch throws -> 'blocked', CorsBlocked notice, no retrievedAt
{
  const stubFetch = async () => { throw new TypeError('Failed to fetch'); };
  const result = await fetchDefinitions('test', { online: true, fetchImpl: stubFetch, now: fixedNow });
  assert('AD-3 status blocked', result.status, 'blocked');
  assert('AD-3 candidates empty', result.candidates.length, 0);
  assert('AD-3 CorsBlocked reason', result.notices[0].reason, 'CorsBlocked');
  assert('AD-3 notice @type', result.notices[0]['@type'], 'lce:ResolutionNotice');
  assert('AD-3 no retrievedAt', 'retrievedAt' in result, false);
}

// AD-4: fetched — HTTP 200 with valid payload -> 'fetched', candidates mapped, retrievedAt set
{
  const apiPayload = [{
    word: 'serendipity',
    license: { name: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0' },
    sourceUrls: ['https://en.wiktionary.org/wiki/serendipity'],
    meanings: [{
      partOfSpeech: 'noun',
      definitions: [
        { definition: 'An unsought, unintended, and/or unexpected discovery.' },
        { definition: 'A combination of events which produce a good outcome.' },
      ],
    }],
  }];
  const stubFetch = async () => makeResponse(200, apiPayload);
  const result = await fetchDefinitions('serendipity', { online: true, fetchImpl: stubFetch, now: fixedNow });
  assert('AD-4 status fetched', result.status, 'fetched');
  assert('AD-4 retrievedAt', result.retrievedAt, FIXED_NOW);
  assert('AD-4 two candidates', result.candidates.length, 2);
  assert('AD-4 first definitionText', result.candidates[0].definitionText,
    'An unsought, unintended, and/or unexpected discovery.');
  assert('AD-4 partOfSpeech', result.candidates[0].partOfSpeech, 'noun');
  assert('AD-4 source Wiktionary', result.candidates[0].source, 'Wiktionary');
  assert('AD-4 sourceUrl', result.candidates[0].sourceUrl, 'https://en.wiktionary.org/wiki/serendipity');
  assert('AD-4 license from license.name', result.candidates[0].license, 'CC BY-SA 3.0');
  assert('AD-4 adapter field', result.candidates[0].adapter, 'dictionaryapi.dev');
  assert('AD-4 adapterVersion field', result.candidates[0].adapterVersion, adapterVersion);
  assert('AD-4 no @id on candidates', '@id' in result.candidates[0], false);
  assert('AD-4 notices empty on success', result.notices.length, 0);
}

// AD-5: failed — HTTP 5xx -> 'failed', ProviderUnavailable notice, no candidates
{
  const stubFetch = async () => makeResponse(503, { error: 'Service Unavailable' });
  const result = await fetchDefinitions('test', { online: true, fetchImpl: stubFetch, now: fixedNow });
  assert('AD-5 status failed', result.status, 'failed');
  assert('AD-5 ProviderUnavailable notice', result.notices[0].reason, 'ProviderUnavailable');
  assert('AD-5 candidates empty', result.candidates.length, 0);
  assert('AD-5 no retrievedAt', 'retrievedAt' in result, false);
}

// AD-6: URL encoding — space in term is percent-encoded
{
  let capturedUrl = null;
  const stubFetch = async (url) => { capturedUrl = url; return makeResponse(404, {}); };
  await fetchDefinitions('hot dog', { online: true, fetchImpl: stubFetch, now: fixedNow });
  assert('AD-6 space encoded as %20', capturedUrl,
    'https://api.dictionaryapi.dev/api/v2/entries/en/hot%20dog');
}

// AD-7: no real network — injected stub is called, not globalThis.fetch
{
  let stubWasCalled = false;
  const stubFetch = async () => { stubWasCalled = true; return makeResponse(200, []); };
  await fetchDefinitions('isolation-check', { online: true, fetchImpl: stubFetch, now: fixedNow });
  assert('AD-7 stub called not real network', stubWasCalled, true);
}

if (failures > 0) {
  console.error('\n' + failures + ' assertion(s) failed.');
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
}
