#!/usr/bin/env node
// §9 MCP Server Interface — a stateless wrapper over stdin/stdout. JSON-RPC 2.0,
// newline-delimited. Every tool is a pure function of its arguments (including
// currentState); the server holds no session state. Dependency-free (no MCP SDK),
// per the zero-infrastructure premise. Run: node bin/mcp.mjs  (an MCP host pipes it).

import { createInterface } from 'node:readline';
import * as tools from '../src/mcp-tools.mjs';

const TOOLS = [
  { name: 'lce_load_words', description: 'Build a LexiconDataset (fetchPhase Initialized) from a list of words.',
    inputSchema: { type: 'object', properties: { words: { type: 'array', items: { type: 'string' } } }, required: ['words'] } },
  { name: 'lce_fetch_definitions', description: 'Look up definitions for every notStarted entry; returns {state, envelopes} so the caller can persist the envelopes for replay.',
    inputSchema: { type: 'object', properties: { currentState: { type: 'object' }, online: { type: 'boolean' } }, required: ['currentState'] } },
  { name: 'lce_get_pending_matrix', description: 'A view filtered to curationStatus "uncurated".',
    inputSchema: { type: 'object', properties: { currentState: { type: 'object' } }, required: ['currentState'] } },
  { name: 'lce_select_definitions', description: 'Select candidate @ids for a lemma → partiallySelected.',
    inputSchema: { type: 'object', properties: { currentState: { type: 'object' }, lemma: { type: 'string' }, selectedIds: { type: 'array', items: { type: 'string' } }, agentName: { type: 'string' } }, required: ['currentState', 'lemma', 'selectedIds'] } },
  { name: 'lce_finalize_curation', description: 'Finalize a lemma → selected (with selections) or rejected.',
    inputSchema: { type: 'object', properties: { currentState: { type: 'object' }, lemma: { type: 'string' } }, required: ['currentState', 'lemma'] } },
  { name: 'lce_validate', description: 'Run the §7 invariant contract; returns {state, validationState, reasons}.',
    inputSchema: { type: 'object', properties: { currentState: { type: 'object' } }, required: ['currentState'] } },
  { name: 'lce_export', description: 'Pinned serialization (§8.1) + ExportManifest (§5.4) with datasetHash.',
    inputSchema: { type: 'object', properties: { currentState: { type: 'object' }, generatedAt: { type: 'string' } }, required: ['currentState'] } },
];

const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const result = (id, res) => send({ jsonrpc: '2.0', id, result: res });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(req) {
  const { id, method, params = {} } = req;
  switch (method) {
    case 'initialize':
      return result(id, { protocolVersion: '2024-11-05', serverInfo: { name: 'lexicon-curator-engine', version: '3.1.0' }, capabilities: { tools: {} } });
    case 'notifications/initialized':
      return;                                  // notification — no reply
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, { tools: TOOLS });
    case 'tools/call': {
      const { name, arguments: args = {} } = params;
      const fn = tools[name];
      if (typeof fn !== 'function') return fail(id, -32602, 'unknown tool: ' + name);
      try {
        const out = await fn(args);
        return result(id, { content: [{ type: 'text', text: JSON.stringify(out) }] });
      } catch (e) {
        return result(id, { isError: true, content: [{ type: 'text', text: 'error: ' + (e && e.message || e) }] });
      }
    }
    default:
      if (id !== undefined) fail(id, -32601, 'method not found: ' + method);
  }
}

createInterface({ input: process.stdin }).on('line', async line => {
  line = line.trim();
  if (!line) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  await handle(req);
});
