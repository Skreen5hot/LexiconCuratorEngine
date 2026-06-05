import { FETCH_STATUS, CURATION_STATUS, isFetchTerminal, isCurationTerminal } from './status.mjs';

/**
 * §3.3 Derive fetchPhase from entries (total derivation, pure count-based).
 * @param {{ fetchStatus: string }[]} entries
 * @returns {'Initialized' | 'FullyFetched' | 'PartiallyFetched'}
 */
export function deriveFetchPhase(entries) {
  if (entries.length === 0) return 'Initialized';
  const allNotStarted = entries.every(e => e.fetchStatus === FETCH_STATUS.NOT_STARTED);
  if (allNotStarted) return 'Initialized';
  const allTerminal = entries.every(e => isFetchTerminal(e.fetchStatus));
  if (allTerminal) return 'FullyFetched';
  return 'PartiallyFetched';
}

/**
 * §3.3 Derive curationPhase from entries (total derivation, pure count-based).
 * @param {{ curationStatus: string }[]} entries
 * @returns {'Uncurated' | 'FullyCurated' | 'PartiallyCurated'}
 */
export function deriveCurationPhase(entries) {
  if (entries.length === 0) return 'Uncurated';
  const allUncurated = entries.every(e => e.curationStatus === CURATION_STATUS.UNCURATED);
  if (allUncurated) return 'Uncurated';
  const allTerminal = entries.every(e => isCurationTerminal(e.curationStatus));
  if (allTerminal) return 'FullyCurated';
  return 'PartiallyCurated';
}

// §3.3 default validationState — set only by the validator (§7)
export const DEFAULT_VALIDATION_STATE = 'Unvalidated';
