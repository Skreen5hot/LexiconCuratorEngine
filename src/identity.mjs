import { sha256hex } from './sha256.mjs';

const BASE = 'https://w3id.org/lce/id/';

/**
 * Produces a deterministic, canonical JSON string with recursively sorted
 * object keys. Arrays preserve insertion order (ordered by definition).
 * Pure and deterministic — no I/O, no clock (§1.1).
 */
function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJSON).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJSON(value[k])).join(',') + '}';
}

/**
 * §5.1 Content-addressed IRI for any node.
 * IRI = BASE + sha256hex(canonicalJSON(node))[:32]
 * Stable under object key reordering; distinct content produces distinct IRIs.
 */
export function mintContentId(node) {
  return BASE + sha256hex(canonicalJSON(node)).slice(0, 32);
}

/**
 * §5.2 Semantic dataset hash stable under key reordering.
 * Returns "sha256:" + full 256-bit hex over the sorted-key canonical JSON form.
 * Two datasets that are key-reorderings of each other produce the same hash.
 */
export function hashDataset(dataset) {
  return 'sha256:' + sha256hex(canonicalJSON(dataset));
}
