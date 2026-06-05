import { stripCredentials, scrubSecrets } from '../src/sanitize.mjs';

let failed = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS [' : 'FAIL [') + name + ']'); if (!cond) failed++; };

// §4.3(1) — strip userinfo + credential-bearing query params
assert('AC strips userinfo', !stripCredentials('https://user:pass@example.com/x').includes('user:pass'));
assert('AC redacts api_key', stripCredentials('https://api.example.com/d?api_key=SEKRET&q=hi').includes('api_key=REDACTED'));
assert('AC redacts token', stripCredentials('https://api.example.com/d?token=abc').includes('token=REDACTED'));
assert('AC keeps benign params', stripCredentials('https://api.example.com/d?q=hi').includes('q=hi'));
assert('AC passes non-URL through', stripCredentials('en.wiktionary.org/wiki/x') === 'en.wiktionary.org/wiki/x');

// §4.3(2) — scrub every secret substring
assert('AC scrubs a secret', scrubSecrets('error: key SEKRET123 rejected', ['SEKRET123']) === 'error: key [REDACTED] rejected');
assert('AC no-op without secrets', scrubSecrets('clean message', []) === 'clean message');
assert('AC scrubs multiple secrets', scrubSecrets('a A b B', ['A', 'B']) === 'a [REDACTED] b [REDACTED]');

if (failed) { console.error(failed + ' assertion(s) failed'); process.exit(1); }
console.log('All assertions passed.');
