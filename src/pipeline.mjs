import { parseInput } from './parse.mjs';
import { FETCH_STATUS } from './status.mjs';
import { validateDataset } from './validate.mjs';
import { mintContentId } from './identity.mjs';
import { buildExportManifest } from './manifest.mjs';

/**
 * §8.2 Offline end-to-end pipeline.
 * All non-determinism (time, secrets) enters as explicit arguments (§1.1).
 *
 * @param {string} csvText
 * @param {object} [options]
 * @param {boolean} [options.foldDiacritics=false]
 * @param {string} [options.termColumn='term']
 * @param {boolean} [options.hasHeader=true]
 * @param {string} [options.generatedAt=''] - ISO timestamp from the calling shell
 * @param {string[]} [options.secrets=[]] - secret strings to scan for in the graph
 * @returns {{ dataset: object, manifest: object, validationReasons: object[] }}
 */
export function runOffline(csvText, options = {}) {
  const {
    foldDiacritics = false,
    termColumn = 'term',
    hasHeader = true,
    generatedAt = '',
    secrets = [],
  } = options;

  // 1. Parse CSV → initialized entries (notStarted, uncurated)
  const { entries: parsedEntries } = parseInput(csvText, { foldDiacritics, termColumn, hasHeader });

  // 2. Mark every entry fetchStatus 'deferred' (offline policy, §3.1)
  const deferredEntries = parsedEntries.map(entry => ({
    ...entry,
    fetchStatus: FETCH_STATUS.DEFERRED,
    resolutionEvents: [
      ...entry.resolutionEvents,
      {
        '@type': 'lce:ResolutionNotice',
        reason: 'OfflinePolicy',
        message: 'Lookup not attempted; shell declared online:false.',
      },
    ],
  }));

  // 3. Mint content-addressed @id for each entry (§5.1)
  const identifiedEntries = deferredEntries.map(entry => ({
    '@id': mintContentId(entry),
    ...entry,
  }));

  // 4. Validate dataset (§7); deriveFetchPhase/deriveCurationPhase called inside buildExportManifest
  const preliminaryDataset = { '@type': 'lce:LexiconDataset', lexicalEntries: identifiedEntries };
  const { validationState, reasons } = validateDataset(preliminaryDataset, secrets);

  // 5. Build final dataset with validationState
  const dataset = { ...preliminaryDataset, validationState };

  // 6. Build ExportManifest (§5.4)
  const manifest = buildExportManifest(dataset, { generatedAt });

  return { dataset, manifest, validationReasons: reasons };
}
