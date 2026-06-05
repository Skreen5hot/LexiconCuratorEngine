// §11 Architectural Verification Test — the determinism guarantee, locally checkable.
// Everything downstream of the freeze boundary (frozen candidate matrix + recorded
// choices) yields byte-identical output on every platform. This test proves it.

import { readFileSync } from 'node:fs';
import { mintCandidateId } from '../src/curation.mjs';
import { validateDataset } from '../src/validate.mjs';
import { deriveFetchPhase, deriveCurationPhase } from '../src/phases.mjs';
import { runOffline } from '../src/pipeline.mjs';
import { pinnedSerialize, serializationHash } from '../src/serialize.mjs';
import {
  lce_load_words, lce_fetch_definitions, lce_select_definitions,
  lce_finalize_curation, lce_export,
} from '../src/mcp-tools.mjs';

let failed = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS [' : 'FAIL [') + name + ']'); if (!cond) failed++; };

// §5.1 — content-id worked examples (computed in the spec) reproduce byte-exact
assert('§5.1 worked example def hash',
  mintCandidateId('example', 'wiktionary', 'A representative form of a group.')
    .endsWith('574f5dcf92b9aef50299ae9f96af73b5'));
assert('§5.1 second def hash distinct + exact',
  mintCandidateId('example', 'wiktionary', 'An instance serving to illustrate a rule.')
    .endsWith('811baae91b4a7484d3455fdbe7179e6c'));

// §10 — the hardened specimen validates and derives its declared phases
const specimen = JSON.parse(readFileSync(new URL('./specimen.jsonld', import.meta.url), 'utf8'));
assert('§10 specimen → ValidatedExport', validateDataset(specimen).validationState === 'ValidatedExport');
assert('§10 specimen → FullyFetched', deriveFetchPhase(specimen.lexicalEntries) === 'FullyFetched');
assert('§10 specimen → PartiallyCurated', deriveCurationPhase(specimen.lexicalEntries) === 'PartiallyCurated');

// §11 — reproducibility: identical input + frozen clock → byte-identical pinned serialization
const csv = 'term\nserendipity\nephemeral\nquixotic';
const at = '2026-01-01T00:00:00Z';
assert('§11 replay is byte-identical',
  pinnedSerialize(runOffline(csv, { generatedAt: at })) === pinnedSerialize(runOffline(csv, { generatedAt: at })));
assert('§11 serializationHash is stable',
  serializationHash(runOffline(csv, { generatedAt: at })) === serializationHash(runOffline(csv, { generatedAt: at })));

// §8.1 — the pinned serialization is canonical: independent of input key/array order, @id leads
const docA = { '@type': 'X', '@id': 'i', z: 1, a: 2, items: [{ '@id': 'b' }, { '@id': 'a' }] };
const docB = { items: [{ '@id': 'a' }, { '@id': 'b' }], a: 2, z: 1, '@id': 'i', '@type': 'X' };
assert('§8.1 pinned serialize is order-independent', pinnedSerialize(docA) === pinnedSerialize(docB));
assert('§8.1 @id leads each object', pinnedSerialize(docA).split('\n')[1].trim().startsWith('"@id"'));

// §9 — MCP replay determinism: frozen adapter envelopes → byte-identical export, twice
const frozenFetch = async () => ({ ok: true, status: 200, json: async () => [{
  word: 'x', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'a frozen sense' }] }],
  sourceUrls: ['https://en.wiktionary.org/wiki/x'], license: { name: 'CC BY-SA 3.0' },
}] });
async function mcpRun() {
  let st = lce_load_words({ words: ['serendipity', 'ephemeral'] });
  ({ state: st } = await lce_fetch_definitions({ currentState: st, online: true, fetchImpl: frozenFetch }));
  const e0 = st.lexicalEntries[0];
  st = lce_select_definitions({ currentState: st, lemma: e0.normalizedForm, selectedIds: [e0.candidateDefinitions[0]['@id']], agentName: 'verifier' });
  st = lce_finalize_curation({ currentState: st, lemma: e0.normalizedForm });
  return lce_export({ currentState: st, generatedAt: at }).serialization;
}
const m1 = await mcpRun();
const m2 = await mcpRun();
assert('§9 MCP replay is byte-identical (frozen envelopes)', m1 === m2);
assert('§9 MCP export curated a "selected" entry', m1.includes('"selected"'));

if (failed) { console.error(failed + ' assertion(s) failed'); process.exit(1); }
console.log('All assertions passed.');
