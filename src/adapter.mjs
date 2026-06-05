import { FETCH_STATUS } from './status.mjs';

export const adapterVersion = '1.0.0';

const ADAPTER_NAME = 'dictionaryapi.dev';
const BASE_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

/**
 * §4.2 dictionaryapi.dev adapter.
 * opts.fetchImpl — injectable fetch (§1.1); defaults to globalThis.fetch
 * opts.now       — injectable clock (§1.1); defaults to wall clock
 * opts.online    — shell-declared env policy; false -> deferred (§3.1/§6.2)
 */
export async function fetchDefinitions(term, opts = {}) {
  const {
    online = true,
    fetchImpl = globalThis.fetch,
    now = () => new Date().toISOString(),
  } = opts;

  if (!online) {
    return {
      lemma: term,
      adapter: ADAPTER_NAME,
      adapterVersion,
      credentialPolicy: 'none',
      credentialUsed: false,
      status: FETCH_STATUS.DEFERRED,
      candidates: [],
      notices: [{
        '@type': 'lce:ResolutionNotice',
        reason: 'OfflinePolicy',
        message: 'Lookup not attempted; shell declared online:false.',
      }],
    };
  }

  const url = BASE_URL + encodeURIComponent(term);

  let response;
  try {
    response = await fetchImpl(url);
  } catch (_err) {
    return {
      lemma: term,
      adapter: ADAPTER_NAME,
      adapterVersion,
      credentialPolicy: 'none',
      credentialUsed: false,
      status: FETCH_STATUS.BLOCKED,
      candidates: [],
      notices: [{
        '@type': 'lce:ResolutionNotice',
        reason: 'CorsBlocked',
        message: 'Network request failed or was blocked at origin/transport layer.',
      }],
    };
  }

  if (response.status === 404) {
    return {
      lemma: term,
      adapter: ADAPTER_NAME,
      adapterVersion,
      credentialPolicy: 'none',
      credentialUsed: false,
      status: FETCH_STATUS.UNAVAILABLE,
      candidates: [],
      notices: [],
    };
  }

  if (!response.ok) {
    let reason;
    if (response.status === 429) reason = 'RateLimited';
    else if (response.status === 401 || response.status === 403) reason = 'Unauthorized';
    else if (response.status >= 500) reason = 'ProviderUnavailable';
    else reason = 'ParseFailure';
    return {
      lemma: term,
      adapter: ADAPTER_NAME,
      adapterVersion,
      credentialPolicy: 'none',
      credentialUsed: false,
      status: FETCH_STATUS.FAILED,
      candidates: [],
      notices: [{
        '@type': 'lce:ResolutionNotice',
        reason,
        message: 'HTTP ' + response.status + ' from ' + ADAPTER_NAME + '.',
      }],
    };
  }

  let data;
  try {
    data = await response.json();
  } catch (_err) {
    return {
      lemma: term,
      adapter: ADAPTER_NAME,
      adapterVersion,
      credentialPolicy: 'none',
      credentialUsed: false,
      status: FETCH_STATUS.FAILED,
      candidates: [],
      notices: [{
        '@type': 'lce:ResolutionNotice',
        reason: 'ParseFailure',
        message: 'Failed to parse JSON response.',
      }],
    };
  }

  const retrievedAt = now();
  const entry = Array.isArray(data) && data.length > 0 ? data[0] : null;

  if (!entry) {
    return {
      lemma: term,
      adapter: ADAPTER_NAME,
      adapterVersion,
      credentialPolicy: 'none',
      credentialUsed: false,
      status: FETCH_STATUS.FETCHED,
      retrievedAt,
      candidates: [],
      notices: [{
        '@type': 'lce:ResolutionNotice',
        reason: 'NoDefinitionFound',
        message: 'Provider returned 200 but no entries found.',
      }],
    };
  }

  const licenseStr = (entry.license && entry.license.name) ? entry.license.name : '';
  const sourceUrl = Array.isArray(entry.sourceUrls) && entry.sourceUrls.length > 0
    ? entry.sourceUrls[0]
    : '';

  const candidates = [];
  for (const meaning of (entry.meanings || [])) {
    const partOfSpeech = meaning.partOfSpeech || '';
    for (const def of (meaning.definitions || [])) {
      const definitionText = def.definition || '';
      if (!definitionText) continue;
      candidates.push({
        adapter: ADAPTER_NAME,
        adapterVersion,
        definitionText,
        partOfSpeech,
        source: 'Wiktionary',
        sourceUrl,
        license: licenseStr,
      });
    }
  }

  return {
    lemma: term,
    adapter: ADAPTER_NAME,
    adapterVersion,
    credentialPolicy: 'none',
    credentialUsed: false,
    status: FETCH_STATUS.FETCHED,
    retrievedAt,
    candidates,
    notices: candidates.length === 0
      ? [{
          '@type': 'lce:ResolutionNotice',
          reason: 'NoDefinitionFound',
          message: 'Provider returned 200 but no definitions found.',
        }]
      : [],
  };
}
