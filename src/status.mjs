// §3.1 Per-entry fetch status tokens
export const FETCH_STATUS = {
  NOT_STARTED: 'notStarted',
  FETCHED: 'fetched',
  UNAVAILABLE: 'unavailable',
  DEFERRED: 'deferred',
  BLOCKED: 'blocked',
  FAILED: 'failed',
};

// Terminal = any state other than notStarted
export function isFetchTerminal(status) {
  return status !== FETCH_STATUS.NOT_STARTED;
}

// §3.2 Per-entry curation status tokens
export const CURATION_STATUS = {
  UNCURATED: 'uncurated',
  PARTIALLY_SELECTED: 'partiallySelected',
  SELECTED: 'selected',
  REJECTED: 'rejected',
  AMBIGUOUS: 'ambiguous',
};

// Terminal curation states: selected, rejected, ambiguous
export function isCurationTerminal(status) {
  return (
    status === CURATION_STATUS.SELECTED ||
    status === CURATION_STATUS.REJECTED ||
    status === CURATION_STATUS.AMBIGUOUS
  );
}
