// Lexicon Curator — browser front-end (the §1 Orchestration shell, offline mode).
// Reads the lexicon + clock at the shell boundary and hands them to the pure core
// runOffline (§1.1: all non-determinism enters as explicit args). The core is the
// agent-built, gated pipeline; this file is just the front door.

import { runOffline } from '../src/pipeline.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/ld+json' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function render({ dataset, manifest }) {
  const entries = dataset.lexicalEntries;
  const ok = manifest.validationState === 'ValidatedExport';
  $('summary').innerHTML =
    `<b>${entries.length}</b> entries &middot; fetch <b>${manifest.fetchPhase}</b> ` +
    `&middot; curation <b>${manifest.curationPhase}</b> ` +
    `&middot; <span class="${ok ? 'ok' : 'bad'}">${manifest.validationState}</span> ` +
    `&middot; <code title="semantic dataset hash (§5.2)">${manifest.datasetHash.slice(0, 24)}…</code>`;

  $('entries').innerHTML =
    '<tr><th>lemma</th><th>normalized (§4.1)</th><th>fetch</th><th>curation</th><th>content @id (§5.1)</th></tr>' +
    entries.map(x =>
      `<tr><td>${esc(x.lemma)}</td><td>${esc(x.normalizedForm)}</td>` +
      `<td>${x.fetchStatus}</td><td>${x.curationStatus}</td>` +
      `<td><code>…${esc(x['@id'].split('/').pop().slice(0, 12))}</code></td></tr>`).join('');

  const doc = { '@context': 'https://w3id.org/lce/context.jsonld', manifest, dataset };
  const json = JSON.stringify(doc, null, 2);
  $('json').textContent = json;
  $('download').onclick = () => download('lexicon.jsonld', json);
  $('output').hidden = false;
}

function curate() {
  try {
    const result = runOffline($('csv').value, {
      foldDiacritics: $('fold').checked,
      hasHeader: $('header').checked,
      generatedAt: new Date().toISOString(),   // clock read here, at the shell boundary (§1.1)
    });
    render(result);
  } catch (err) {
    $('summary').innerHTML = `<span class="bad">Error: ${esc(err.message)}</span>`;
    $('entries').innerHTML = '';
    $('json').textContent = '';
    $('output').hidden = false;
  }
}

$('run').addEventListener('click', curate);
$('file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (file) { $('csv').value = await file.text(); curate(); }
});

curate();   // run once on load with the sample lexicon, so the page shows real output
