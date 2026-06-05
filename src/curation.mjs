import { sha256hex } from './sha256.mjs';   // dependency-free, browser-portable (§1.1) — not node:crypto
import { CURATION_STATUS } from './status.mjs';

const NS = 'https://w3id.org/lce/';
const US = '\u001F'; // ASCII Unit Separator §5.1

/**
 * §5.1 128-bit content-addressed IRI for a DefinitionCandidate.
 * canonicalString = normalizedLemma ␟ sourceKey ␟ definitionText(NFC)
 */
export function mintCandidateId(normalizedLemma, sourceKey, definitionText) {
  const canonical = [normalizedLemma, sourceKey, definitionText.normalize('NFC')].join(US);
  const hash = sha256hex(canonical).slice(0, 32);
  return `${NS}id/def/${hash}`;
}

/** §5.1 Selection IRI: same hash as the paired candidate def, /sel/ prefix. */
export function mintSelectionId(candidateId) {
  const hash = candidateId.split('/').pop();
  return `${NS}id/sel/${hash}`;
}

function matchEntry(entry, lemma) {
  return entry.normalizedForm === lemma || entry.lemma === lemma;
}

function mapEntry(state, lemma, updater) {
  return {
    ...state,
    lexicalEntries: (state.lexicalEntries || []).map(e =>
      matchEntry(e, lemma) ? updater(e) : e
    ),
  };
}

/**
 * §4.1 T-1.6 applyCandidateDefinitions(state, lemma, envelope) → state'
 * Merges an adapter envelope into the target entry.
 * Idempotent on candidate @id; the core never reads a clock or socket (§1.1).
 */
export function applyCandidateDefinitions(state, lemma, envelope) {
  return mapEntry(state, lemma, entry => {
    const existingIds = new Set((entry.candidateDefinitions || []).map(c => c['@id']));
    const newCandidates = (envelope.candidates || [])
      .map(c => {
        if (c['@id']) return c;
        const id = mintCandidateId(
          entry.normalizedForm,
          (c.adapter || '').toLowerCase(),
          c.definitionText || ''
        );
        return { '@id': id, ...c };
      })
      .filter(c => !existingIds.has(c['@id']));
    const notices = (envelope.notices || []).map(n =>
      n['@type'] ? n : { '@type': 'lce:ResolutionNotice', ...n }
    );
    return {
      ...entry,
      fetchStatus: envelope.status,
      candidateDefinitions: [...(entry.candidateDefinitions || []), ...newCandidates],
      resolutionEvents: [...(entry.resolutionEvents || []), ...notices],
    };
  });
}

/**
 * §4.1 T-1.7 applySelection(state, lemma, selectedIds, meta) → state'
 * Non-empty selectedIds → partiallySelected; NEVER directly to 'selected' (§3.2).
 * Empty + meta.finalize === true → rejected.
 * Empty without finalize → no-op (error condition; state returned unchanged).
 */
export function applySelection(state, lemma, selectedIds, meta = {}) {
  const ids = selectedIds || [];
  if (ids.length === 0 && !meta.finalize) return state;
  return mapEntry(state, lemma, entry => {
    if (ids.length === 0) {
      return { ...entry, curationStatus: CURATION_STATUS.REJECTED, selectedDefinitions: [] };
    }
    const existingSelIds = new Set((entry.selectedDefinitions || []).map(s => s['@id']));
    const newSelections = ids
      .filter(cid => !existingSelIds.has(mintSelectionId(cid)))
      .map(cid => {
        const sel = {
          '@id': mintSelectionId(cid),
          '@type': 'lce:DefinitionSelection',
          selectedCandidate: cid,
        };
        if (meta.curatedBy !== undefined) sel.curatedBy = meta.curatedBy;
        if (meta.selectionMethod !== undefined) sel.selectionMethod = meta.selectionMethod;
        if (meta.selectedAt !== undefined) sel.selectedAt = meta.selectedAt;
        return sel;
      });
    return {
      ...entry,
      curationStatus: CURATION_STATUS.PARTIALLY_SELECTED,
      selectedDefinitions: [...(entry.selectedDefinitions || []), ...newSelections],
    };
  });
}

/**
 * §4.1 T-1.8 finalizeCuration(state, lemma) → state'
 * partiallySelected + selections present → selected.
 * No selections → rejected.
 * §3.2 invariant: 'selected' is reachable ONLY via this function.
 */
export function finalizeCuration(state, lemma) {
  return mapEntry(state, lemma, entry => {
    const hasSelections = (entry.selectedDefinitions || []).length > 0;
    return {
      ...entry,
      curationStatus: hasSelections ? CURATION_STATUS.SELECTED : CURATION_STATUS.REJECTED,
    };
  });
}

/**
 * §4.1 T-1.9 flagAmbiguous(state, lemma, meta) → state'
 * Sets curationStatus to 'ambiguous'; terminal for automated flows.
 */
export function flagAmbiguous(state, lemma, meta = {}) {
  return mapEntry(state, lemma, entry => ({
    ...entry,
    curationStatus: CURATION_STATUS.AMBIGUOUS,
  }));
}
