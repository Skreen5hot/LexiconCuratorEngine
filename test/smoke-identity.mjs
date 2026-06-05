import { mintContentId, hashDataset } from '../src/identity.mjs';

let failures = 0;

function assert(label, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    console.error(`FAIL [${label}]: expected ${b}, got ${a}`);
    failures++;
  } else {
    console.log(`PASS [${label}]`);
  }
}

// AC-I1: mintContentId determinism — same input → same IRI
{
  const node = { lemma: 'cat', source: 'wiktionary' };
  assert('AC-I1 determinism', mintContentId(node), mintContentId(node));
}

// AC-I2: IRI starts with expected base prefix
{
  const id = mintContentId({ x: 1 });
  assert('AC-I2 IRI prefix', id.startsWith('https://w3id.org/lce/id/'), true);
}

// AC-I3: hash segment is exactly 32 lowercase hex chars
{
  const id = mintContentId({ x: 1 });
  const hash = id.slice('https://w3id.org/lce/id/'.length);
  assert('AC-I3 hash length', hash.length, 32);
  assert('AC-I3 hash is lowercase hex', /^[0-9a-f]{32}$/.test(hash), true);
}

// AC-I4: mintContentId stable under top-level key reordering
{
  const a = mintContentId({ a: 1, b: 2, c: 'hello' });
  const b = mintContentId({ c: 'hello', a: 1, b: 2 });
  const c = mintContentId({ b: 2, c: 'hello', a: 1 });
  assert('AC-I4 key-order stability ab', a, b);
  assert('AC-I4 key-order stability ac', a, c);
}

// AC-I5: distinct content → distinct IRI
{
  const id1 = mintContentId({ lemma: 'cat' });
  const id2 = mintContentId({ lemma: 'dog' });
  assert('AC-I5 distinct content → distinct IRI', id1 !== id2, true);
}

// AC-I6: nested objects also have keys sorted
{
  const a = mintContentId({ outer: { z: 1, a: 2 }, x: 'v' });
  const b = mintContentId({ x: 'v', outer: { a: 2, z: 1 } });
  assert('AC-I6 nested key-order stability', a, b);
}

// AC-I7: arrays preserve order (not sorted) — [1,2,3] ≠ [3,2,1]
{
  const a = mintContentId({ items: [1, 2, 3] });
  const b = mintContentId({ items: [3, 2, 1] });
  assert('AC-I7 array order is significant', a !== b, true);
}

// AC-I8: hashDataset returns "sha256:" prefixed 64-char hex
{
  const h = hashDataset({ entries: [] });
  assert('AC-I8 sha256: prefix', h.startsWith('sha256:'), true);
  const hex = h.slice('sha256:'.length);
  assert('AC-I8 full 64-char hex', hex.length, 64);
  assert('AC-I8 hex chars', /^[0-9a-f]{64}$/.test(hex), true);
}

// AC-I9: hashDataset stable under key reordering
{
  const h1 = hashDataset({ '@type': 'lce:LexiconDataset', lexicalEntries: [], validationState: 'Unvalidated' });
  const h2 = hashDataset({ validationState: 'Unvalidated', lexicalEntries: [], '@type': 'lce:LexiconDataset' });
  assert('AC-I9 hashDataset key-order stability', h1, h2);
}

// AC-I10: hashDataset — distinct datasets → distinct hashes
{
  const h1 = hashDataset({ entries: ['cat'] });
  const h2 = hashDataset({ entries: ['dog'] });
  assert('AC-I10 distinct datasets → distinct hashes', h1 !== h2, true);
}

// AC-I11: hashDataset determinism across two calls
{
  const ds = { '@type': 'lce:LexiconDataset', lexicalEntries: [{ lemma: 'run' }] };
  assert('AC-I11 hashDataset determinism', hashDataset(ds), hashDataset(ds));
}

// AC-I12: mintContentId handles null values, numbers, booleans without throwing
{
  const id = mintContentId({ a: null, b: 42, c: true, d: false });
  assert('AC-I12 mixed scalar types — IRI prefix', id.startsWith('https://w3id.org/lce/id/'), true);
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
}
