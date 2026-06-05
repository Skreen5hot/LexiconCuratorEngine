import { pinnedSerialize, serializationHash } from '../src/serialize.mjs';

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

function assertNotEqual(label, actual, notExpected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(notExpected);
  if (a === b) {
    console.error(`FAIL [${label}]: expected values to differ, but both are ${a}`);
    failures++;
  } else {
    console.log(`PASS [${label}]`);
  }
}

// SS-1: two docs differing only in key order serialize byte-identically
{
  const docA = {
    '@context': 'https://w3id.org/lce/context.jsonld',
    '@id': 'https://w3id.org/lce/id/entry/abc',
    '@type': 'lce:LexicalEntry',
    lemma: 'cat',
    normalizedForm: 'cat',
    fetchStatus: 'notStarted',
  };
  const docB = {
    fetchStatus: 'notStarted',
    normalizedForm: 'cat',
    '@context': 'https://w3id.org/lce/context.jsonld',
    lemma: 'cat',
    '@type': 'lce:LexicalEntry',
    '@id': 'https://w3id.org/lce/id/entry/abc',
  };
  const serialA = pinnedSerialize(docA);
  const serialB = pinnedSerialize(docB);
  assert('SS-1 key-reordered docs serialize byte-identically', serialA, serialB);
}

// SS-2: @id then @type lead in the output
{
  const doc = {
    zzz: 'last-alpha',
    aaa: 'first-alpha',
    '@type': 'lce:SomeType',
    '@id': 'https://w3id.org/lce/id/def/abc123',
    meta: 'value',
  };
  const serialized = pinnedSerialize(doc);
  const lines = serialized.split('\n');
  // Find the lines with @id, @type, aaa, zzz
  const idLine = lines.findIndex(l => l.includes('"@id"'));
  const typeLine = lines.findIndex(l => l.includes('"@type"'));
  const aaaLine = lines.findIndex(l => l.includes('"aaa"'));
  const zzzLine = lines.findIndex(l => l.includes('"zzz"'));
  assert('SS-2 @id comes first', idLine < typeLine && idLine < aaaLine && idLine < zzzLine, true);
  assert('SS-2 @type comes second (before regular keys)', typeLine < aaaLine && typeLine < zzzLine, true);
  assert('SS-2 aaa before zzz (lexicographic after @-keys)', aaaLine < zzzLine, true);
}

// SS-3: @id-bearing array members are sorted by @id
{
  const doc = {
    '@context': 'https://w3id.org/lce/context.jsonld',
    entries: [
      { '@id': 'https://w3id.org/lce/id/def/ccc', value: 3 },
      { '@id': 'https://w3id.org/lce/id/def/aaa', value: 1 },
      { '@id': 'https://w3id.org/lce/id/def/bbb', value: 2 },
    ],
  };
  const serialized = pinnedSerialize(doc);
  const aaaPos = serialized.indexOf('def/aaa');
  const bbbPos = serialized.indexOf('def/bbb');
  const cccPos = serialized.indexOf('def/ccc');
  assert('SS-3 @id-bearing array sorted: aaa before bbb', aaaPos < bbbPos, true);
  assert('SS-3 @id-bearing array sorted: bbb before ccc', bbbPos < cccPos, true);
}

// SS-4: arrays of primitives preserve insertion order (not sorted)
{
  const doc = { items: [3, 1, 2] };
  const serialized = pinnedSerialize(doc);
  const pos3 = serialized.indexOf('3');
  const pos1 = serialized.indexOf('1');
  const pos2 = serialized.indexOf('2');
  assert('SS-4 primitive array preserves order: 3 before 1', pos3 < pos1, true);
  assert('SS-4 primitive array preserves order: 1 before 2', pos1 < pos2, true);
}

// SS-5: top-level @context string kept as-is (IRI reference form)
{
  const doc = {
    '@context': 'https://w3id.org/lce/context.jsonld',
    '@id': 'https://example.org/x',
  };
  const serialized = pinnedSerialize(doc);
  assert('SS-5 @context preserved as IRI string', serialized.includes('"https://w3id.org/lce/context.jsonld"'), true);
}

// SS-6: output is 2-space-indented JSON with LF newlines and terminal newline
{
  const doc = { '@id': 'x', name: 'test' };
  const serialized = pinnedSerialize(doc);
  // terminal newline
  assert('SS-6 terminal newline', serialized.endsWith('\n'), true);
  // LF not CRLF
  assert('SS-6 LF line endings (no CR)', serialized.includes('\r'), false);
  // 2-space indent: second line should start with 2 spaces
  const lines = serialized.split('\n').filter(l => l.length > 0);
  const indentedLine = lines.find(l => l.startsWith('  ') && !l.startsWith('   '));
  assert('SS-6 2-space indent present', indentedLine !== undefined, true);
}

// SS-7: no trailing whitespace on any line
{
  const doc = { '@id': 'x', '@type': 'T', data: [1, 2, 3] };
  const serialized = pinnedSerialize(doc);
  const lines = serialized.split('\n');
  const hasTrailing = lines.some(l => l !== l.trimEnd());
  assert('SS-7 no trailing whitespace', hasTrailing, false);
}

// SS-8: serializationHash returns sha256: prefixed string
{
  const doc = { '@id': 'x', value: 42 };
  const hash = serializationHash(doc);
  assert('SS-8 serializationHash prefix', hash.startsWith('sha256:'), true);
  const hex = hash.slice('sha256:'.length);
  assert('SS-8 serializationHash 64-char hex', hex.length, 64);
  assert('SS-8 serializationHash lowercase hex', /^[0-9a-f]{64}$/.test(hex), true);
}

// SS-9: serializationHash is deterministic and key-order stable
{
  const docA = { z: 1, a: 2, '@id': 'x' };
  const docB = { '@id': 'x', a: 2, z: 1 };
  assert('SS-9 serializationHash key-order stable', serializationHash(docA), serializationHash(docB));
}

// SS-10: two semantically different docs have different serializationHash
{
  const docA = { '@id': 'x', value: 1 };
  const docB = { '@id': 'x', value: 2 };
  assertNotEqual('SS-10 distinct docs have distinct hash', serializationHash(docA), serializationHash(docB));
}

// SS-11: nested object keys are also sorted with @id/@type first rule
{
  const doc = {
    outer: {
      zzz: 'z',
      '@type': 'lce:Inner',
      '@id': 'https://example.org/inner',
      aaa: 'a',
    },
  };
  const serialized = pinnedSerialize(doc);
  const idPos = serialized.indexOf('"@id"');
  const typePos = serialized.indexOf('"@type"');
  const aaaPos = serialized.indexOf('"aaa"');
  const zzzPos = serialized.indexOf('"zzz"');
  assert('SS-11 nested @id before @type', idPos < typePos, true);
  assert('SS-11 nested @type before aaa', typePos < aaaPos, true);
  assert('SS-11 nested aaa before zzz', aaaPos < zzzPos, true);
}

// SS-12: mixed array (not all objects with @id) preserves insertion order
{
  const doc = {
    mixed: [
      { '@id': 'z', v: 1 },
      'string-item',
      { '@id': 'a', v: 2 },
    ],
  };
  const serialized = pinnedSerialize(doc);
  // Since not all items have @id (string-item doesn't), should NOT be sorted
  const zPos = serialized.indexOf('"z"');
  const aPos = serialized.indexOf('"a"');
  // z should appear before a (insertion order preserved)
  assert('SS-12 mixed array preserves insertion order: z before a', zPos < aPos, true);
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
}
