#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { runOffline } from '../src/pipeline.mjs';

const args = process.argv.slice(2);

function getArg(name) {
  const prefix = `--${name}=`;
  const match = args.find(a => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

const inputPath = getArg('input');
const outputPath = getArg('output');

if (!inputPath) {
  process.stderr.write('Usage: node bin/lce.mjs --input=terms.csv [--output=result.jsonld]\n');
  process.exit(1);
}

const csvText = readFileSync(inputPath, 'utf8');

// Clock read here at the shell boundary; passed as an explicit arg to the pure core (§1.1)
const generatedAt = new Date().toISOString();

const { dataset, manifest } = runOffline(csvText, { generatedAt });

const exportDoc = {
  '@context': 'https://w3id.org/lce/context.jsonld',
  manifest,
  dataset,
};

const json = JSON.stringify(exportDoc, null, 2) + '\n';

if (outputPath) {
  writeFileSync(outputPath, json, 'utf8');
} else {
  process.stdout.write(json);
}
