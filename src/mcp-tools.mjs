import { normalizeLexicalEntry } from './normalize.mjs';
import { fetchDefinitions } from './adapter.mjs';
import { applyCandidateDefinitions, applySelection, finalizeCuration } from './curation.mjs';
import { validateDataset } from './validate.mjs';
import { buildExportManifest } from './manifest.mjs';
import { pinnedSerialize, serializationHash } from './serialize.mjs';
import { mintContentId } from './identity.mjs';
import { FETCH_STATUS, CURATION_STATUS } from './status.mjs';

export function lce_load_words({ words }) {
  const lexicalEntries = (words || []).map(word => ({
    '@type': 'lce:LexicalEntry',
    lemma: word,
    normalizedForm: normalizeLexicalEntry(word, { foldDiacritics: false }),
    fetchStatus: FETCH_STATUS.NOT_STARTED,
    curationStatus: CURATION_STATUS.UNCURATED,
    candidateDefinitions: [],
    selectedDefinitions: [],
    resolutionEvents: [],
  }));
  return { '@type': 'lce:LexiconDataset', lexicalEntries };
}

export async function lce_fetch_definitions({ currentState, online = true, fetchImpl }) {
  const opts = { online };
  if (fetchImpl !== undefined) opts.fetchImpl = fetchImpl;
  let state = currentState;
  const envelopes = [];
  for (const entry of (currentState.lexicalEntries || [])) {
    if (entry.fetchStatus !== FETCH_STATUS.NOT_STARTED) continue;
    const envelope = await fetchDefinitions(entry.normalizedForm, opts);
    envelopes.push(envelope);
    state = applyCandidateDefinitions(state, entry.normalizedForm, envelope);
  }
  return { state, envelopes };
}

export function lce_get_pending_matrix({ currentState }) {
  const lexicalEntries = (currentState.lexicalEntries || []).filter(
    e => e.curationStatus === CURATION_STATUS.UNCURATED
  );
  return { '@type': 'lce:LexiconDataset', lexicalEntries };
}

export function lce_select_definitions({ currentState, lemma, selectedIds, agentName }) {
  return applySelection(currentState, lemma, selectedIds, {
    selectionMethod: 'agent',
    curatedBy: agentName,
  });
}

export function lce_finalize_curation({ currentState, lemma }) {
  return finalizeCuration(currentState, lemma);
}

export function lce_validate({ currentState }) {
  const { validationState, reasons } = validateDataset(currentState);
  const state = { ...currentState, validationState };
  return { state, validationState, reasons };
}

export function lce_export({ currentState, generatedAt = '' }) {
  const entries = (currentState.lexicalEntries || []).map(e =>
    e['@id'] ? e : { '@id': mintContentId(e), ...e }
  );
  const datasetWithIds = { ...currentState, lexicalEntries: entries };
  const { validationState } = validateDataset(datasetWithIds);
  const dataset = { ...datasetWithIds, validationState };
  const manifest = buildExportManifest(dataset, { generatedAt, serializationHash: serializationHash(dataset) });
  const doc = {
    '@context': 'https://w3id.org/lce/context.jsonld',
    manifest,
    dataset,
  };
  return { serialization: pinnedSerialize(doc), manifest };
}
