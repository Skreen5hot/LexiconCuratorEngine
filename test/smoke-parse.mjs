import { parseInput } from '../src/parse.mjs';

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

// AC-P1: Basic CSV with header row
{
  const csv = 'term\nexample\nhello';
  const { entries } = parseInput(csv);
  assert('AC-P1 entry count', entries.length, 2);
  assert('AC-P1 first lemma', entries[0].lemma, 'example');
  assert('AC-P1 second lemma', entries[1].lemma, 'hello');
  assert('AC-P1 fetchStatus', entries[0].fetchStatus, 'notStarted');
  assert('AC-P1 curationStatus', entries[0].curationStatus, 'uncurated');
  assert('AC-P1 candidateDefinitions', entries[0].candidateDefinitions, []);
  assert('AC-P1 selectedDefinitions', entries[0].selectedDefinitions, []);
  assert('AC-P1 resolutionEvents', entries[0].resolutionEvents, []);
  assert('AC-P1 type', entries[0]['@type'], 'lce:LexicalEntry');
}

// AC-P2: Quoted fields with embedded comma
{
  const csv = 'term,note\n"hot, dog",a compound\nhello,world';
  const { entries } = parseInput(csv);
  assert('AC-P2 quoted field with comma', entries[0].lemma, 'hot, dog');
  assert('AC-P2 plain field', entries[1].lemma, 'hello');
}

// AC-P3: Quoted fields with escaped double-quote
{
  const csv = 'term\n"say \"\"hello\"\""';
  const { entries } = parseInput(csv);
  assert('AC-P3 escaped double-quote', entries[0].lemma, 'say "hello"');
}

// AC-P4: normalizedForm is lowercased and NFC
{
  const csv = 'term\nR\u00e9sum\u00e9';
  const { entries } = parseInput(csv, { foldDiacritics: false });
  assert('AC-P4 normalizedForm lowercase NFC', entries[0].normalizedForm, 'r\u00e9sum\u00e9');
  assert('AC-P4 lemma preserved', entries[0].lemma, 'R\u00e9sum\u00e9');
}

// AC-P5: foldDiacritics option
{
  const csv = 'term\nR\u00e9sum\u00e9';
  const { entries } = parseInput(csv, { foldDiacritics: true });
  assert('AC-P5 foldDiacritics true', entries[0].normalizedForm, 'resume');
}

// AC-P6: custom termColumn name
{
  const csv = 'word,definition\ncat,a small animal\ndog,a friendly animal';
  const { entries } = parseInput(csv, { termColumn: 'word' });
  assert('AC-P6 custom column count', entries.length, 2);
  assert('AC-P6 custom column first', entries[0].lemma, 'cat');
  assert('AC-P6 custom column second', entries[1].lemma, 'dog');
}

// AC-P7: hasHeader:false falls back to column 0
{
  const csv = 'apple\nbanana';
  const { entries } = parseInput(csv, { hasHeader: false });
  assert('AC-P7 no-header count', entries.length, 2);
  assert('AC-P7 no-header first', entries[0].lemma, 'apple');
}

// AC-P8: empty input returns empty entries
{
  const { entries } = parseInput('');
  assert('AC-P8 empty input', entries.length, 0);
}

// AC-P9: blank lines skipped, whitespace-only terms skipped
{
  const csv = 'term\n\nexample\n   \nhello';
  const { entries } = parseInput(csv);
  assert('AC-P9 blank lines skipped', entries.length, 2);
}

// AC-P10: CRLF line endings handled (RFC 4180)
{
  const csv = 'term\r\nexample\r\nhello';
  const { entries } = parseInput(csv);
  assert('AC-P10 CRLF count', entries.length, 2);
  assert('AC-P10 CRLF first', entries[0].lemma, 'example');
}

// AC-P11: multi-column CSV, missing termColumn falls back to column 0
{
  const csv = 'id,label\n1,cat\n2,dog';
  const { entries } = parseInput(csv, { termColumn: 'label' });
  assert('AC-P11 named second column', entries.length, 2);
  assert('AC-P11 named second column value', entries[0].lemma, 'cat');
}

// AC-P12: hyphen and interior space preserved in lemma and normalizedForm
{
  const csv = 'term\nwell-being\nhot dog';
  const { entries } = parseInput(csv);
  assert('AC-P12 hyphen preserved lemma', entries[0].lemma, 'well-being');
  assert('AC-P12 hyphen preserved normalizedForm', entries[0].normalizedForm, 'well-being');
  assert('AC-P12 interior space preserved', entries[1].normalizedForm, 'hot dog');
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
}
