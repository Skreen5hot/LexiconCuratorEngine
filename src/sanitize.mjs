// §4.3 Credential & untrusted-string handling — leak-path closure helpers.
//
// The core is credential-blind. The keyless Wiktionary adapter (credentialPolicy
// 'none') carries no secrets, so these are defense-in-depth — they exist so a KEYED
// adapter can strip credential-bearing URL components and scrub secret substrings
// BEFORE any field enters persistable state (export / localStorage / MCP return).
// The validator's secret scan (§7.1.6) is the final backstop.

// Query-parameter names commonly used to carry credentials.
const CREDENTIAL_PARAMS = new Set([
  'key', 'api_key', 'apikey', 'token', 'access_token', 'auth', 'secret',
  'password', 'passwd', 'signature', 'sig', 'client_secret',
]);

/**
 * §4.3(1) Strip userinfo and credential-bearing query parameters from a URL, so a
 * sourceUrl never carries a key. Returns a key-redacted URL string; if the input is
 * not a parseable URL it is returned unchanged (callers store path/host only).
 */
export function stripCredentials(url) {
  let u;
  try { u = new URL(String(url)); } catch { return String(url); }
  u.username = '';
  u.password = '';
  for (const k of [...u.searchParams.keys()]) {
    if (CREDENTIAL_PARAMS.has(k.toLowerCase())) u.searchParams.set(k, 'REDACTED');
  }
  return u.toString();
}

/**
 * §4.3(2) Replace every secret substring (each value reachable via getSecret) with a
 * redaction marker, so a secret can never appear in a ResolutionNotice.message or any
 * other persisted string. Pure; deterministic.
 */
export function scrubSecrets(text, secrets = []) {
  let out = String(text);
  for (const s of secrets) {
    if (typeof s === 'string' && s.length > 0) out = out.split(s).join('[REDACTED]');
  }
  return out;
}
