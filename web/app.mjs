// Lexicon Curator — browser front-end (the §1 Orchestration shell).
// Reads the lexicon, the clock, and the network at the shell boundary and hands them
// to the pure, gated core (§1.1). The core modules (parse / adapter / curation reducers /
// identity / manifest / validate) were built + gated by the IntegratedAgent agile cycle;
// this file is just the front door + the curation interaction (§8.3).

import { parseInput } from '../src/parse.mjs';
import { fetchDefinitions } from '../src/adapter.mjs';
import { applyCandidateDefinitions, applySelection, finalizeCuration, flagAmbiguous } from '../src/curation.mjs';
import { mintContentId } from '../src/identity.mjs';
import { buildExportManifest } from '../src/manifest.mjs';
import { validateDataset } from '../src/validate.mjs';
import { deriveFetchPhase, deriveCurationPhase } from '../src/phases.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let state = { '@type': 'lce:LexiconDataset', lexicalEntries: [] };

function load() {
  const { entries } = parseInput($('csv').value, { foldDiacritics: $('fold').checked, hasHeader: $('header').checked });
  state = { '@type': 'lce:LexiconDataset', lexicalEntries: entries };
  $('lookup').disabled = entries.length === 0;
  $('jsonwrap').hidden = true;
  render();
}

async function lookup() {
  const btn = $('lookup');
  btn.disabled = true;
  const n = state.lexicalEntries.length;
  let i = 0;
  for (const entry of state.lexicalEntries.slice()) {
    btn.textContent = `looking up… ${++i}/${n}`;
    let env;
    try { env = await fetchDefinitions(entry.normalizedForm, { online: true }); }
    catch (e) { env = { status: 'failed', candidates: [], notices: [{ '@type': 'lce:ResolutionNotice', reason: 'ShellError', message: String(e && e.message || e) }] }; }
    state = applyCandidateDefinitions(state, entry.normalizedForm, env);
    render();
  }
  btn.textContent = 'Look up definitions (online) ↻';
  btn.disabled = false;
}

const meta = () => ({ curatedBy: 'browser-curator', selectionMethod: 'manual', selectedAt: new Date().toISOString() });
function select(lemma, id) { state = finalizeCuration(applySelection(state, lemma, [id], meta()), lemma); render(); }
function reject(lemma)     { state = applySelection(state, lemma, [], { finalize: true }); render(); }
function ambiguous(lemma)  { state = flagAmbiguous(state, lemma); render(); }

function entryCard(entry) {
  const fs = entry.fetchStatus, cur = entry.curationStatus;
  const lemmaAttr = esc(entry.normalizedForm);
  const selSet = new Set((entry.selectedDefinitions || []).map(s => s.selectedCandidate));
  const cands = entry.candidateDefinitions || [];
  const orig = entry.lemma !== entry.normalizedForm ? `<span class="orig">was “${esc(entry.lemma)}”</span>` : '';
  const head = `<div class="ehead"><b>${esc(entry.normalizedForm)}</b>${orig}` +
    `<span class="badge f-${fs}">${fs}</span><span class="badge c-${cur}">${cur}</span></div>`;
  if (!cands.length) {
    const notice = (entry.resolutionEvents || []).slice(-1)[0];
    const why = fs === 'notStarted' ? 'not looked up yet' : esc((notice && notice.message) || fs);
    return `<div class="entry"><div>${head}<div class="cand-none">${why}</div></div></div>`;
  }
  const list = cands.map(c =>
    `<button type="button" class="cand ${selSet.has(c['@id']) ? 'sel' : ''}" data-act="select" data-lemma="${lemmaAttr}" data-id="${esc(c['@id'])}">` +
    `<span class="pos">${esc(c.partOfSpeech || '')}</span> ${esc(c.definitionText)}</button>`).join('');
  const acts = `<div class="acts">` +
    `<button type="button" data-act="reject" data-lemma="${lemmaAttr}">reject (none fit)</button>` +
    `<button type="button" data-act="ambiguous" data-lemma="${lemmaAttr}">ambiguous</button></div>`;
  return `<div class="entry"><div>${head}<div class="cands">${list}${acts}</div></div></div>`;
}

function render() {
  const e = state.lexicalEntries;
  const vs = validateDataset(state).validationState;
  $('summary').innerHTML = e.length
    ? `<b>${e.length}</b> entries &middot; fetch <b>${deriveFetchPhase(e)}</b> &middot; ` +
      `curation <b>${deriveCurationPhase(e)}</b> &middot; ` +
      `<span class="${vs === 'ValidatedExport' ? 'ok' : 'bad'}">${vs}</span>`
    : 'Load a lexicon to begin.';
  $('entries').innerHTML = e.map(entryCard).join('');
  $('export').disabled = e.length === 0;
}

function exportGraph() {
  // mint a content-addressed @id for every entry (§5.1), validate (§7), build the manifest (§5.4)
  const entries = state.lexicalEntries.map(en => (en['@id'] ? en : { '@id': mintContentId(en), ...en }));
  const dataset = { '@type': 'lce:LexiconDataset', lexicalEntries: entries };
  dataset.validationState = validateDataset(dataset).validationState;
  const manifest = buildExportManifest(dataset, { generatedAt: new Date().toISOString() });
  const doc = { '@context': 'https://w3id.org/lce/context.jsonld', manifest, dataset };
  const json = JSON.stringify(doc, null, 2);
  $('json').textContent = json;
  $('jsonwrap').hidden = false;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/ld+json' }));
  a.download = 'lexicon.jsonld';
  a.click();
  URL.revokeObjectURL(a.href);
}

$('load').addEventListener('click', load);
$('lookup').addEventListener('click', lookup);
$('export').addEventListener('click', exportGraph);
$('file').addEventListener('change', async ev => { const f = ev.target.files[0]; if (f) { $('csv').value = await f.text(); load(); } });
$('entries').addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const { act, lemma, id } = b.dataset;
  if (act === 'select') select(lemma, id);
  else if (act === 'reject') reject(lemma);
  else if (act === 'ambiguous') ambiguous(lemma);
});

load();   // parse the sample lexicon on page load
