import { normalizeLexicalEntry } from '../src/normalize.mjs';
import {
  FETCH_STATUS,
  CURATION_STATUS,
  isFetchTerminal,
  isCurationTerminal,
} from '../src/status.mjs';
import {
  deriveFetchPhase,
  deriveCurationPhase,
  DEFAULT_VALIDATION_STATE,
} from '../src/phases.mjs';

let failures = 0;

function assert(label, actual, expected) {
  if (actual !== expected) {
    console.error(`FAIL [${label}]: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failures++;
  } else {
    console.log(`PASS [${label}]`);
  }
}

// AC-1: foldDiacritics + trim leading/trailing whitespace
assert('AC-1 foldDiacritics', normalizeLexicalEntry('  R\u00e9sum\u00e9  ', { foldDiacritics: true }), 'resume');

// AC-2: hyphen preserved, no folding
assert('AC-2 hyphen', normalizeLexicalEntry('well-being', { foldDiacritics: false }), 'well-being');

// AC-3: NBSP (U+00A0) collapsed to single ASCII space
assert('AC-3 NBSP', normalizeLexicalEntry('Hot\u00A0Dog', { foldDiacritics: false }), 'hot dog');

// AC-4: locale-independent toLowerCase — U+0130 (Turkish capital I with dot) must not produce 'i'
{
  const result = normalizeLexicalEntry('\u0130', { foldDiacritics: false });
  if (result === 'i') {
    console.error('FAIL [AC-4]: got locale-dependent Turkish lowercase "i" for U+0130; toLowerCase() must not be called with a locale argument');
    failures++;
  } else {
    console.log(`PASS [AC-4 Turkish capital-I-with-dot non-locale: ${JSON.stringify(result)}]`);
  }
}

// §3.1 fetchStatus token string values
assert('fetchStatus.NOT_STARTED', FETCH_STATUS.NOT_STARTED, 'notStarted');
assert('fetchStatus.FETCHED', FETCH_STATUS.FETCHED, 'fetched');
assert('fetchStatus.UNAVAILABLE', FETCH_STATUS.UNAVAILABLE, 'unavailable');
assert('fetchStatus.DEFERRED', FETCH_STATUS.DEFERRED, 'deferred');
assert('fetchStatus.BLOCKED', FETCH_STATUS.BLOCKED, 'blocked');
assert('fetchStatus.FAILED', FETCH_STATUS.FAILED, 'failed');

// isFetchTerminal: notStarted is not terminal; all others are
assert('isFetchTerminal notStarted=false', isFetchTerminal('notStarted'), false);
assert('isFetchTerminal fetched=true', isFetchTerminal('fetched'), true);
assert('isFetchTerminal unavailable=true', isFetchTerminal('unavailable'), true);
assert('isFetchTerminal deferred=true', isFetchTerminal('deferred'), true);
assert('isFetchTerminal blocked=true', isFetchTerminal('blocked'), true);
assert('isFetchTerminal failed=true', isFetchTerminal('failed'), true);

// §3.2 curationStatus token string values
assert('curationStatus.UNCURATED', CURATION_STATUS.UNCURATED, 'uncurated');
assert('curationStatus.PARTIALLY_SELECTED', CURATION_STATUS.PARTIALLY_SELECTED, 'partiallySelected');
assert('curationStatus.SELECTED', CURATION_STATUS.SELECTED, 'selected');
assert('curationStatus.REJECTED', CURATION_STATUS.REJECTED, 'rejected');
assert('curationStatus.AMBIGUOUS', CURATION_STATUS.AMBIGUOUS, 'ambiguous');

// isCurationTerminal: uncurated and partiallySelected are not terminal
assert('isCurationTerminal uncurated=false', isCurationTerminal('uncurated'), false);
assert('isCurationTerminal partiallySelected=false', isCurationTerminal('partiallySelected'), false);
assert('isCurationTerminal selected=true', isCurationTerminal('selected'), true);
assert('isCurationTerminal rejected=true', isCurationTerminal('rejected'), true);
assert('isCurationTerminal ambiguous=true', isCurationTerminal('ambiguous'), true);

// AC-11: all-deferred dataset is FullyFetched (no lookup pending)
assert('AC-11 all-deferred FullyFetched',
  deriveFetchPhase([{ fetchStatus: 'deferred' }]),
  'FullyFetched'
);

// all-blocked is also FullyFetched
assert('all-blocked FullyFetched',
  deriveFetchPhase([{ fetchStatus: 'blocked' }]),
  'FullyFetched'
);

// AC-12: mixed notStarted + fetched → PartiallyFetched
assert('AC-12 mixed PartiallyFetched',
  deriveFetchPhase([{ fetchStatus: 'notStarted' }, { fetchStatus: 'fetched' }]),
  'PartiallyFetched'
);

// all-notStarted → Initialized
assert('all-notStarted Initialized',
  deriveFetchPhase([{ fetchStatus: 'notStarted' }]),
  'Initialized'
);

// AC-13: all terminal curation states → FullyCurated
assert('AC-13 FullyCurated',
  deriveCurationPhase([
    { curationStatus: 'selected' },
    { curationStatus: 'rejected' },
    { curationStatus: 'ambiguous' },
  ]),
  'FullyCurated'
);

// mixed curation → PartiallyCurated
assert('mixed curation PartiallyCurated',
  deriveCurationPhase([{ curationStatus: 'uncurated' }, { curationStatus: 'selected' }]),
  'PartiallyCurated'
);

// all uncurated → Uncurated
assert('all uncurated Uncurated',
  deriveCurationPhase([{ curationStatus: 'uncurated' }]),
  'Uncurated'
);

// AC-14: zero-entry dataset base cases
assert('AC-14 zero fetchPhase', deriveFetchPhase([]), 'Initialized');
assert('AC-14 zero curationPhase', deriveCurationPhase([]), 'Uncurated');
assert('AC-14 zero validationState default', DEFAULT_VALIDATION_STATE, 'Unvalidated');

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
}
