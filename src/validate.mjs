import { FETCH_STATUS, CURATION_STATUS } from './status.mjs';

const VALID_FETCH = new Set(Object.values(FETCH_STATUS));
const VALID_CURATION = new Set(Object.values(CURATION_STATUS));
const VALID_SELECTION_METHODS = new Set(['manual', 'agent']);

export function validateDataset(dataset, secrets = []) {
  const entries = Array.isArray(dataset.lexicalEntries) ? dataset.lexicalEntries : [];
  const reasons = [];

  // §7.1.1 Identity uniqueness — collect all @ids first, then report (never throw)
  const idCounts = new Map();
  const track = id => { if (id != null) idCounts.set(id, (idCounts.get(id) || 0) + 1); };
  if (dataset['@id']) track(dataset['@id']);
  for (const e of entries) {
    track(e['@id']);
    for (const n of (e.candidateDefinitions || [])) track(n['@id']);
    for (const n of (e.selectedDefinitions  || [])) track(n['@id']);
    for (const n of (e.resolutionEvents     || [])) track(n['@id']);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) reasons.push({ rule: 1, id, message: 'duplicate @id' });
  }

  for (const entry of entries) {
    const eid = entry['@id'] || entry.lemma || '(unknown)';
    const candidates = entry.candidateDefinitions || [];
    const selections = entry.selectedDefinitions  || [];
    const notices   = entry.resolutionEvents      || [];
    const candidateIdSet = new Set(candidates.map(c => c['@id']));
    const noticeIdSet    = new Set(notices.map(n => n['@id']));
    const fs = entry.fetchStatus;
    const cs = entry.curationStatus;

    // Legal status tokens (plan requirement)
    if (fs !== undefined && !VALID_FETCH.has(fs))
      reasons.push({ rule: 'status', id: eid, message: `invalid fetchStatus "${fs}"` });
    if (cs !== undefined && !VALID_CURATION.has(cs))
      reasons.push({ rule: 'status', id: eid, message: `invalid curationStatus "${cs}"` });

    // §7.1.2 Lineage
    for (const sel of selections) {
      if (sel.selectedCandidate != null && !candidateIdSet.has(sel.selectedCandidate))
        reasons.push({ rule: 2, id: sel['@id'] || eid,
          message: 'selectedCandidate not in candidateDefinitions',
          selectedCandidate: sel.selectedCandidate });
    }

    // §7.1.3 Fault separation
    for (const sel of selections) {
      if (sel['@type'] === 'lce:ResolutionNotice')
        reasons.push({ rule: 3, id: sel['@id'] || eid, message: 'ResolutionNotice in selectedDefinitions' });
      if (sel.selectedCandidate != null) {
        const refCand = candidates.find(c => c['@id'] === sel.selectedCandidate);
        if (refCand && refCand['@type'] === 'lce:ResolutionNotice')
          reasons.push({ rule: 3, id: sel['@id'] || eid,
            message: 'selectedCandidate references a ResolutionNotice',
            selectedCandidate: sel.selectedCandidate });
        if (noticeIdSet.has(sel.selectedCandidate))
          reasons.push({ rule: 3, id: sel['@id'] || eid,
            message: 'selectedCandidate references a resolutionEvent',
            selectedCandidate: sel.selectedCandidate });
      }
    }

    // §7.1.4 Cross-field consistency
    if (fs !== FETCH_STATUS.FETCHED && candidates.length > 0)
      reasons.push({ rule: 4, id: eid, message: `fetchStatus "${fs}" but candidateDefinitions non-empty` });
    if (cs === CURATION_STATUS.REJECTED && selections.length > 0)
      reasons.push({ rule: 4, id: eid, message: 'curationStatus "rejected" but selectedDefinitions non-empty' });
    if (cs === CURATION_STATUS.SELECTED) {
      if (fs !== FETCH_STATUS.FETCHED)
        reasons.push({ rule: 4, id: eid,
          message: `curationStatus "selected" requires fetchStatus "fetched", got "${fs}"` });
      if (selections.length === 0)
        reasons.push({ rule: 4, id: eid, message: 'curationStatus "selected" but selectedDefinitions empty' });
    }
    if (cs === CURATION_STATUS.PARTIALLY_SELECTED && selections.length === 0)
      reasons.push({ rule: 4, id: eid, message: 'curationStatus "partiallySelected" but selectedDefinitions empty' });

    // §7.1.5 Audit completeness
    for (const sel of selections) {
      const sid = sel['@id'] || eid;
      if (sel.curatedBy == null)
        reasons.push({ rule: 5, id: sid, message: 'DefinitionSelection missing curatedBy' });
      if (!VALID_SELECTION_METHODS.has(sel.selectionMethod))
        reasons.push({ rule: 5, id: sid,
          message: `DefinitionSelection invalid selectionMethod "${sel.selectionMethod}"` });
    }
  }

  // §7.1.6 Secret scan
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length > 0) {
      for (const path of findSecret(dataset, secret, ''))
        reasons.push({ rule: 6, path, message: 'secret value found in graph' });
    }
  }

  return {
    validationState: reasons.length === 0 ? 'ValidatedExport' : 'ValidationFailed',
    reasons,
  };
}

function findSecret(node, secret, path) {
  if (typeof node === 'string') return node.includes(secret) ? [path] : [];
  if (Array.isArray(node)) return node.flatMap((v, i) => findSecret(v, secret, `${path}[${i}]`));
  if (node !== null && typeof node === 'object')
    return Object.keys(node).flatMap(k => findSecret(node[k], secret, path ? `${path}.${k}` : k));
  return [];
}
