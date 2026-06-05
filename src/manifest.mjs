import { sha256hex } from './sha256.mjs';
import { hashDataset } from './identity.mjs';
import { deriveFetchPhase, deriveCurationPhase, DEFAULT_VALIDATION_STATE } from './phases.mjs';

const MANIFEST_BASE = 'https://w3id.org/lce/id/manifest/';

/**
 * §5.4 Build an ExportManifest JSON-LD node.
 * Pure and deterministic — all non-determinism (time) enters as explicit args (§1.1).
 *
 * @param {object} dataset - LexiconDataset with lexicalEntries array
 * @param {object} [opts]
 * @param {string} [opts.generatedAt] - ISO timestamp from the calling shell (§1.1)
 * @param {string} [opts.serializationHash] - Optional JCS byte-level hash (§5.3)
 * @returns {object} ExportManifest JSON-LD node
 */
export function buildExportManifest(dataset, opts = {}) {
  const { generatedAt = '', serializationHash } = opts;
  const entries = dataset.lexicalEntries || [];

  const datasetHash = hashDataset(dataset);
  const fetchPhase = deriveFetchPhase(entries);
  const curationPhase = deriveCurationPhase(entries);
  const validationState = dataset.validationState ?? DEFAULT_VALIDATION_STATE;

  const entryCount = entries.length;
  const selectionCount = entries.reduce(
    (sum, e) => sum + (e.selectedDefinitions ? e.selectedDefinitions.length : 0),
    0
  );

  // §5.4: manifest @id = hash(datasetHash + manifestGeneratedAt)[:32]
  const manifestIdHash = sha256hex(datasetHash + generatedAt).slice(0, 32);

  const manifest = {
    '@id': MANIFEST_BASE + manifestIdHash,
    '@type': 'lce:ExportManifest',
    // §5.2 HONESTY: this datasetHash is a syntactic, key-order-stable JSON hash (recursively
    // sorted keys), NOT the semantic RDFC-1.0 / URDNA2015 graph canonicalization §5.2 names as
    // the ideal. Labeled accurately until URDNA2015 lands. (serializationHash §5.3 is byte-level.)
    canonicalization: 'sorted-keys-json',
    hashAlgorithm: 'SHA-256',
    datasetHash,
    manifestGeneratedAt: generatedAt,
    entryCount,
    selectionCount,
    fetchPhase,
    curationPhase,
    validationState,
  };

  if (serializationHash !== undefined) {
    manifest.serializationHash = serializationHash;
  }

  return manifest;
}
