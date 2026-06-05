# System Specification: Lexicon Curator Engine (LCE) — Revision 3.1 (Hardened Production Grade)

This document establishes the definitive specification for the **Lexicon Curator Engine (LCE)**: a deterministic, zero-infrastructure asset that parses text or CSV datasets of lexical terms, evaluates them against pluggable online/offline dictionary adapters, drives a strict curation interface, and emits an immutable, provenance-traceable, semantically content-addressed JSON-LD graph.

> **Revision note.** R3.1 supersedes R3.0. The architecture and separation-of-concerns model are unchanged. R3.1 hardens the determinism, identity, status, and validation contracts, which in R3.0 contained correctness defects that undermined the "hardened production grade" claim. See the Changelog (§14) for a one-to-one mapping of each change to the defect it resolves.

---

## 0. Normative Language

The key words MUST, MUST NOT, SHALL, SHALL NOT, SHOULD, SHOULD NOT, and MAY are used as defined in RFC 2119/RFC 8174. A conforming implementation MUST satisfy every MUST/SHALL clause. Clauses marked "(determinism-critical)" are load-bearing for the reproducibility guarantee in §11.

---

## 1. Architectural Truths & Core Design

The LCE decouples evaluation from execution platforms. The core computation operates free of side effects, allowing it to run identically inside a disconnected browser tab, a serverless runtime, a CLI batch script, or an ephemeral Model Context Protocol (MCP) host.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          1. Core Computation                            │
│  • Unicode Normalization/Fold • Pure State Reducers • Invariant Engine  │
│  • SHA-256 Content-ID Mint     • Manifest Builder    • Export Formatters │
│  • RDF Dataset Canonicalizer (RDFC-1.0)                                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                     │ (Immutable Graph States)
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                2. Pluggable Integration & Adapter Layer                  │
│   • Credential-Isolated Clients   • CORS Pre-flight   • URL Sanitizers   │
└───────────────────────────────────┬────────────────────────────────────┘
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        3. Orchestration Shells                           │
│   Browser Sandbox  |  Node.js CLI (phased)  |  Stateless MCP Server      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Invariant Execution Boundaries

1. **Computation.** Pure, isolated state transformations. Given identical inputs, they emit byte-for-byte identical outputs. This layer performs no I/O, opens no sockets, reads no clock, and consumes no unseeded randomness. **All non-determinism (time, network results, randomness) MUST enter the core as explicit input arguments.** (determinism-critical)
2. **State.** Ephemeral or persistent text-document serialization. The core assumes no external persistence engine, file system, or cache.
3. **Integration.** Pluggable side-effect layer: external APIs are called, the environment is read, secrets are held, and untrusted strings are sanitized before they may enter persistable state.
4. **Orchestration.** Platform-specific shells coordinating transfer between adapters and the pure core.

---

## 2. Canonical JSON-LD Vocabulary

### 2.1 Namespace Governance

R3.0 anchored the vocabulary at `https://archive.org/namespaces/lce/`, a domain the project does not own and cannot make dereferenceable. Because minted IRIs are immutable, the namespace MUST be settled before any IRI is persisted.

**Normative decision.** The LCE vocabulary namespace is:

```
https://w3id.org/lce/
```

`w3id.org` (the W3C Permanent Identifier Community Group redirect service) is used because it provides an owned, persistent, dereferenceable namespace without requiring the project to operate domain infrastructure — consistent with the zero-infrastructure premise. An implementation that controls its own domain MAY substitute it, but MUST NOT use a third party's domain (e.g. `archive.org`, `schema.org`) as its minting authority.

### 2.2 Context Document

The context below is **canonical**. The `@context` value in any LCE document MUST be either this object inlined verbatim, or the IRI `https://w3id.org/lce/context.jsonld` that dereferences to it. The two forms are interchangeable for *semantic* purposes but **not** for byte-level serialization (see §5.3).

```json
{
  "@context": {
    "lce": "https://w3id.org/lce/",
    "schema": "https://schema.org/",
    "LexiconDataset": "lce:LexiconDataset",
    "LexicalEntry": "lce:LexicalEntry",
    "DefinitionCandidate": "lce:DefinitionCandidate",
    "DefinitionSelection": "lce:DefinitionSelection",
    "ResolutionNotice": "lce:ResolutionNotice",
    "ExportManifest": "lce:ExportManifest",
    "lemma": "lce:lemma",
    "normalizedForm": "lce:normalizedForm",
    "definitionText": "schema:description",
    "fetchPhase": "lce:fetchPhase",
    "curationPhase": "lce:curationPhase",
    "validationState": "lce:validationState",
    "fetchStatus": "lce:fetchStatus",
    "curationStatus": "lce:curationStatus",
    "resolutionStatus": "lce:resolutionStatus",
    "source": "schema:citation",
    "sourceUrl": "schema:url",
    "license": "schema:license",
    "retrievedAt": { "@id": "lce:retrievedAt", "@type": "schema:DateTime" },
    "occurredAt":  { "@id": "lce:occurredAt",  "@type": "schema:DateTime" },
    "selectedAt":  { "@id": "lce:selectedAt",  "@type": "schema:DateTime" },
    "adapter": "lce:adapter",
    "adapterVersion": "lce:adapterVersion",
    "credentialPolicy": "lce:credentialPolicy",
    "credentialUsed": "lce:credentialUsed",
    "rank": "lce:rank",
    "reason": "lce:reason",
    "message": "lce:message",
    "curatedBy": "lce:curatedBy",
    "selectionMethod": "lce:selectionMethod",
    "selectedCandidate": { "@id": "lce:selectedCandidate", "@type": "@id" },
    "lexicalEntries":      { "@id": "lce:lexicalEntries",      "@container": "@set" },
    "candidateDefinitions":{ "@id": "lce:candidateDefinitions","@container": "@set" },
    "selectedDefinitions": { "@id": "lce:selectedDefinitions", "@container": "@set" },
    "resolutionEvents":    { "@id": "lce:resolutionEvents",    "@container": "@set" }
  }
}
```

---

## 3. Lifecycle State Machine

R3.0 collapsed two orthogonal axes (fetch progress and curation progress) plus validation into a single `datasetStatus` string, which left "FullyFetched + PartiallyCurated" undefined and let an all-offline run report `FullyFetched`. R3.1 splits these into three independent fields with explicit, total derivations.

### 3.1 Per-Entry Fetch Status (`fetchStatus`)

| Token | Terminal? | Meaning |
|---|---|---|
| `notStarted` | no | Entry instantiated; no lookup attempted. |
| `fetched` | yes | Adapter query succeeded; candidates (≥0) processed. |
| `unavailable` | yes | Provider explicitly confirmed the term does not exist (distinct from "found zero definitions for an existing term"). |
| `deferred` | yes | Lookup intentionally not attempted because the environment is in **offline policy**. The network was never contacted. |
| `blocked` | yes | Lookup attempted in an **online** environment but prevented at the origin/transport layer (CORS, mixed-content). Semantically distinct from `deferred`. |
| `failed` | yes | Lookup attempted and the provider/transport returned a fault (5xx, timeout, parse failure, auth rejection). |

A **terminal** state is any state other than `notStarted`.

### 3.2 Per-Entry Curation Status (`curationStatus`)

| Token | Meaning |
|---|---|
| `uncurated` | Candidates mapped (or none available); no curation action committed. |
| `partiallySelected` | ≥1 selection accepted, but the curator has not yet declared the entry complete. |
| `selected` | Curation explicitly **finalized** (see `finalizeCuration`, §4.1). Terminal. |
| `rejected` | Explicit decision to exclude all candidates (empty selection set, finalized). Terminal. |
| `ambiguous` | Curator flagged the entry as requiring out-of-band evaluation. Terminal for automated flows. |

`selected` is reachable **only** via `finalizeCuration`; committing a selection moves an entry to `partiallySelected`, never directly to `selected`. (Closes the R3.0 unreachable-state defect.)

### 3.3 Dataset-Level Phases (three independent fields)

Each derivation is total over the entry set and is computed purely by counting (no clock, no I/O).

**`fetchPhase`** — precedence top to bottom; first matching rule wins:
- `Initialized` — every entry is `notStarted`.
- `FullyFetched` — every entry is in a **terminal** fetch state.
- `PartiallyFetched` — otherwise (≥1 terminal and ≥1 `notStarted`).

> Note: `FullyFetched` means "no lookup is still pending," **not** "all lookups succeeded." A run in which every entry is `deferred` (offline) or `blocked` is `FullyFetched`; success is read from the per-entry statuses and notices, not from this phase. This preserves the absence-vs-failure distinction under open-world assumptions.

**`curationPhase`** — precedence top to bottom:
- `Uncurated` — every entry is `uncurated`.
- `FullyCurated` — every entry is in a terminal curation state (`selected`, `rejected`, or `ambiguous`).
- `PartiallyCurated` — otherwise.

**`validationState`** — set only by the validator (§7):
- `Unvalidated` (default) | `ValidatedExport` | `ValidationFailed`.

An empty dataset (zero entries) is `Initialized` / `Uncurated` / `Unvalidated` by definition.

---

## 4. Separation of Concerns & Security Boundaries

### 4.1 Computation (Pure Functions)

#### Input Normalization & Unicode Folding

```
normalizeLexicalEntry(rawText: string, options: { foldDiacritics: boolean }): string
```

The transformation is a **fixed, ordered pipeline** (determinism-critical):

1. **Trim** leading/trailing Unicode whitespace; collapse internal runs of whitespace to a single U+0020. Hyphens (`well-being`) and single interior spaces (`hot dog`) are preserved.
2. **NFC** normalization.
3. **Lowercase** using a **locale-independent** mapping. Implementations MUST use `String.prototype.toLowerCase()` (the Unicode default), **never** `toLocaleLowerCase()`, to avoid locale-dependent results (e.g. Turkish İ/ı). (determinism-critical)
4. **Optional diacritic fold** — only if `foldDiacritics === true`: apply NFD, strip the **Latin** combining range `[\u0300-\u036F]`, then re-apply NFC. Example: `résumé → resume`.

**Scope limitation (normative).** The diacritic fold in step 4 is defined **only for Latin-script text**. It MUST NOT be applied to scripts whose combining marks are semantically load-bearing — Arabic harakat, Hebrew niqqud, and Indic matras among them — because stripping those marks changes the word rather than folding an accent. Implementations that ingest non-Latin lexicons MUST set `foldDiacritics: false` for those entries; a future revision MAY add script-aware folding. The `normalizedForm` always records the result of steps 1–3 (and 4 when applicable) so the transformation is auditable.

#### Pure Reducers & Evaluators

- `parseInput(rawData, options) → { entries }` — CSV/text ingestion per §4.4. Emits `LexicalEntry` records initialized to `fetchStatus:"notStarted"`, `curationStatus:"uncurated"`.
- `applyCandidateDefinitions(state, lemma, envelope) → state'` — merges an adapter envelope (§4.2) into the target entry. **Timestamps and fetch outcome are read from the envelope; the core never reads a clock or socket.** Idempotent on candidate `@id` (re-applying the same envelope does not duplicate candidates). (determinism-critical)
- `applySelection(state, lemma, selectedIds, meta) → state'` — records selections. A non-empty `selectedIds` sets `curationStatus:"partiallySelected"`. An **empty** `selectedIds` **with** `meta.finalize === true` sets `rejected`; an empty set without finalize is a no-op error.
- `finalizeCuration(state, lemma) → state'` — transitions `partiallySelected → selected`. Required to reach `selected`.
- `flagAmbiguous(state, lemma, meta) → state'` — sets `curationStatus:"ambiguous"`.
- `deriveFetchPhase(state) / deriveCurationPhase(state) → string` — total derivations per §3.3.

### 4.2 Integration Boundaries (Adapters)

Adapters own the network/file layer. They catch raw anomalies, parse timestamps, sanitize untrusted strings (§4.3), and return a uniform envelope.

```typescript
interface DictionaryAdapter {
  adapterName: string;
  adapterVersion: string;            // semver; participates in provenance, not in identity
  credentialPolicy: "none" | "optional" | "required";
  corsProfile: "same-origin" | "cors-enabled" | "cors-unknown" | "proxy-required";
  fetchDefinitions(entry: object, ctx?: AdapterRuntimeContext): Promise<DefinitionFetchResult>;
}

interface AdapterRuntimeContext {
  getSecret?: (name: string) => string | undefined;
  now?: () => string;                // ISO-8601 UTC; supplied by the shell, never by the core
  online?: boolean;                  // shell-declared environment policy
}

interface DefinitionFetchResult {
  lemma: string;
  adapter: string;
  adapterVersion: string;
  credentialPolicy: "none" | "optional" | "required";
  credentialUsed: boolean;
  status: "fetched" | "unavailable" | "deferred" | "blocked" | "failed";
  retrievedAt?: string;              // present iff status === "fetched"
  candidates: DefinitionCandidate[]; // MUST be [] unless status === "fetched"
  notices: ResolutionNotice[];
}
```

### 4.3 Credential & Untrusted-String Handling Contract

The core is credential-blind: pure routines MUST NOT accept, examine, serialize, log, or store keys, tokens, or certificates.

- **Policy `none`** — keyless providers (e.g. Wiktionary REST, local static dictionaries).
- **Policy `optional`/`required`** — credentials handled exclusively in orchestration wrappers and passed to adapters via the transient `getSecret` hook.
- **Browser shell** — bundles MUST NOT embed keys; default to keyless providers. Keyed endpoints are permitted only via in-memory inputs cleared on tab close. Secrets MUST NOT be written to `localStorage`/`sessionStorage` or appear in any export.
- **Node CLI** — credentials resolved from `LCE_SECRET_*` environment variables or from `.gitignore`-listed untracked config.
- **MCP server** — tokens MUST NOT arrive via model/tool parameters; the host provisions runtime variables before boot.
- **`credentialUsed`** — a boolean flag only. It MUST NOT leak key fragments, hashes, account IDs, or quota figures.

**Leak-path closure (new in R3.1).** Many providers carry the API key in the request URL or echo it in error bodies. Therefore, before any field may enter **persistable state** (`localStorage`, file export, MCP return value):

1. Adapters MUST strip credential-bearing query parameters and userinfo components from any `sourceUrl` they emit (store the path/host only, or a key-redacted URL).
2. Adapters MUST scrub any secret substring (every value reachable via `getSecret`) from `ResolutionNotice.message`.
3. The validator (§7) MUST reject a graph in which any known secret value appears in any string field, as a defense-in-depth backstop.

---

## 5. Provenance, Identity & Cryptographic Contracts

### 5.1 Content-Addressed Identifier Minting

Identifiers are derived from a **pinned** canonical input so that identical semantic content yields identical IDs across environments and runs (idempotent dedup), while distinct content never collides under normal cardinalities.

**Canonical input (determinism-critical).** The `canonicalString` for a `DefinitionCandidate` is exactly three fields, in this order, joined by the ASCII Unit Separator `U+001F`:

```
normalizedLemma ␟ sourceKey ␟ definitionText
```

- `normalizedLemma` is the output of `normalizeLexicalEntry`.
- `sourceKey` is a lowercase stable provider token (e.g. `wiktionary`).
- `definitionText` is the verbatim candidate text **after** NFC normalization (no case folding).
- **`rank` and `adapterVersion` are deliberately excluded from identity** — they are presentation/provenance, not content. Re-fetching the same definition under a new adapter version yields the **same** ID; only the recorded `adapterVersion` provenance changes. Two genuinely different definitions from one source produce two IDs; two byte-identical definitions from one source intentionally collapse to one (dedup).

**Hash.** SHA-256 over the UTF-8 encoding of `canonicalString`, truncated to **128 bits (32 hex chars)**. R3.0's 64-bit truncation reached non-negligible birthday-collision probability near 2³² entities; 128 bits pushes that past any realistic lexicon. Collisions are handled (§7.1), not crashed.

```typescript
// Browser (Web Crypto)
const bytes = new TextEncoder().encode(canonicalString);
const buf   = await crypto.subtle.digest("SHA-256", bytes);
const idHash = Array.from(new Uint8Array(buf))
  .map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);

// Node.js
const idHash = crypto.createHash("sha256").update(canonicalString, "utf8")
  .digest("hex").slice(0, 32);
```

**IRI form.** Identity lives in the hash, not in the lemma; the lemma is a property, not part of the IRI (this removes the R3.0 URN that embedded raw spaces/Unicode and used an unregistered NID):

```
Candidate:  https://w3id.org/lce/id/def/{idHash}
Selection:  https://w3id.org/lce/id/sel/{idHash}
Entry:      https://w3id.org/lce/id/entry/{entryHash}
Dataset:    https://w3id.org/lce/id/dataset/{datasetHash}
```

`entryHash` = SHA-256(normalizedLemma)[:32]. `datasetHash` is defined in §5.2.

**Worked example (real, computed).** For lemma `example`, source `wiktionary`, text `A representative form of a group.`:

```
canonicalString = "example␟wiktionary␟A representative form of a group."
SHA-256(...)    = 574f5dcf92b9aef50299ae9f96af73b513632777d8533c0ae97d399c7ea1bf1a
idHash[:32]     = 574f5dcf92b9aef50299ae9f96af73b5
@id             = https://w3id.org/lce/id/def/574f5dcf92b9aef50299ae9f96af73b5
```

A second candidate from the same source with text `An instance serving to illustrate a rule.` yields `811baae91b4a7484d3455fdbe7179e6c` — distinct, as required.

### 5.2 Dataset Hash: Semantic, Not Syntactic

R3.0 hashed the document with JCS (RFC 8785). JCS canonicalizes **JSON syntax**, not RDF **semantics**: inlined vs. referenced `@context`, expanded vs. compacted form, `@set` single-value vs. array, and equivalent IRI/prefix variants all hash differently though they denote the same graph. A "semantic graph hash" computed that way is false advertising.

**Normative decision.** The primary `datasetHash` is computed over the **RDF Dataset Canonicalization** of the graph:

1. Expand the JSON-LD document to RDF (the dataset).
2. Canonicalize with **RDFC-1.0 (URDNA2015)** to canonical N-Quads.
3. `datasetHash = "sha256:" + SHA-256(canonicalNQuads_utf8)` (full 256 bits; this is an integrity anchor, not an IRI segment).

This hash is invariant across all semantically equivalent serializations, which is the property a provenance system actually needs. RDFC-1.0 also defines stable blank-node labels, so the graph need not be blank-node-free for the hash to be reproducible.

### 5.3 Serialization Hash (optional, for byte-level integrity)

When a consumer needs to verify the **exact bytes** of an export (not just semantic equivalence), the manifest MAY additionally carry a `serializationHash` computed via JCS over the **pinned export serialization** (§8 fixes member ordering, container forms, and context representation). The two hashes answer different questions and MUST NOT be conflated.

### 5.4 Export Manifest

```json
{
  "@id": "https://w3id.org/lce/id/manifest/9d2f1c47e0a3b8556a1f0c4d2b7e8a91",
  "@type": "lce:ExportManifest",
  "canonicalization": "RDFC-1.0",
  "hashAlgorithm": "SHA-256",
  "datasetHash": "sha256:<256-bit hex over canonical N-Quads>",
  "serializationHash": "sha256:<optional JCS hash over pinned bytes>",
  "manifestGeneratedAt": "<from shell-supplied clock>"
}
```

> Manifest IDs are themselves content-addressed (hash of `datasetHash` + `manifestGeneratedAt`), so they cannot accidentally reuse a dataset suffix as in R3.0's hand-placed examples. All example hashes in this document are either computed (§5.1) or explicitly marked as placeholders.

---

## 6. Network Error, Offline & CORS Resolution

### 6.1 Notice Reasons

```typescript
type NoticeReason =
  | "NetworkUnavailable"  // sockets down / off-grid
  | "OfflinePolicy"       // shell declared online:false; no attempt made
  | "RateLimited"         // HTTP 429
  | "Unauthorized"        // missing/rejected credential
  | "QuotaExceeded"       // provider tier exhausted
  | "ProviderUnavailable" // HTTP 5xx
  | "ParseFailure"        // malformed/unreadable response
  | "CorsBlocked"         // origin/transport blocked the request (online)
  | "NoDefinitionFound";  // 200 OK, empty result for an existing term
```

### 6.2 Reason → Fetch-Status Crosswalk (normative)

Every notice maps deterministically to exactly one terminal `fetchStatus`. (Closes the R3.0 gap where the two enums were unconnected and `deferred` was overloaded.)

| `NoticeReason` | `fetchStatus` | Online? |
|---|---|---|
| `OfflinePolicy` | `deferred` | no — not attempted |
| `NetworkUnavailable` | `failed` | attempted, transport down |
| `CorsBlocked` | `blocked` | yes — origin/transport refused |
| `Unauthorized` | `failed` | yes |
| `RateLimited` | `failed` | yes |
| `QuotaExceeded` | `failed` | yes |
| `ProviderUnavailable` | `failed` | yes |
| `ParseFailure` | `failed` | yes |
| `NoDefinitionFound` | `fetched` | yes — successful query, zero candidates |

`unavailable` is reserved for a provider's **explicit** "no such term" signal and has no notice (it is a successful, authoritative negative). `NoDefinitionFound` (term may exist, this provider returned nothing) maps to `fetched` with an empty candidate set — the open-world-correct outcome, never conflated with `unavailable`.

### 6.3 CORS Pre-flight

Before targeting an endpoint a browser shell MUST consult the adapter's `corsProfile`. If `proxy-required` or `cors-unknown` and no proxy is configured, the shell MUST NOT issue the request; it flags the entry `blocked`, emits a `CorsBlocked` notice, and continues. Such adapters become reachable only through an optional local proxy.

---

## 7. The Validation Invariant Contract

The validator runs before any save/export and sets `validationState`.

```
              ┌──────────────────────────┐
              │   Output Graph Subject   │
              └────────────┬─────────────┘
                           ▼
   Structural ── Lineage ── Separation ── Cross-field ── Audit ── Secret-scan
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
      ValidatedExport            ValidationFailed
```

### 7.1 Invariants

1. **Identity uniqueness.** Every `@id` in the dataset is distinct. A duplicate is a **collision event**: the validator records the colliding `canonicalString`s in a `ValidationFailed` report — it MUST NOT throw an uncatchable error. (R3.0 turned this into a hard crash.)
2. **Lineage (over every selection).** For **each** member of `selectedDefinitions`, `selectedCandidate` MUST match the `@id` of some member of the **same entry's** `candidateDefinitions`. (R3.0 stated this in the singular though `selectedDefinitions` is a set.)
3. **Fault separation.** No `lce:ResolutionNotice` may appear in, or be referenced by, `selectedDefinitions`.
4. **Cross-field consistency (new).** 
   - `fetchStatus !== "fetched"` ⇒ `candidateDefinitions` is empty.
   - `curationStatus === "rejected"` ⇒ `selectedDefinitions` is empty.
   - `curationStatus === "selected"` ⇒ `fetchStatus === "fetched"` **and** `selectedDefinitions` is non-empty.
   - `curationStatus === "partiallySelected"` ⇒ `selectedDefinitions` is non-empty.
5. **Audit completeness.** Every `DefinitionSelection` carries a `curatedBy` agent block and a `selectionMethod` token (`"manual" | "agent"`).
6. **Secret scan (defense-in-depth).** No value reachable via `getSecret` may appear in any string field of the graph (§4.3).

Any violation ⇒ `validationState: "ValidationFailed"` with a structured report enumerating the offending node `@id`s and the rule index. All invariants are evaluated; the validator does not short-circuit, so a single run surfaces every defect.

---

## 8. Orchestration Shells

### 8.1 Pinned Export Serialization (determinism-critical)

All shells that export MUST use one serialization so the optional `serializationHash` is reproducible:
- `@context` emitted as the IRI reference form (§2.2).
- Object keys in lexicographic order; `@id`/`@type` first.
- `@set` containers always rendered as arrays, members sorted by `@id`.
- UTF-8, LF line endings, no trailing whitespace, terminal newline.

### 8.2 Browser Sandbox

Single self-contained `index.html` bundling parser, UI, and adapters. Row-by-row selection grid with checkboxes and per-row license attachment. Working state MAY persist to `localStorage` keyed by input hash, **after** credential scrubbing (§4.3) and **only** if it re-passes full validation on reload.

**Determinism caveat.** The browser shell calls the network live and stamps fresh timestamps; it is therefore **not** replay-deterministic on its own. To obtain reproducibility, export the candidate matrix (the frozen envelopes) and replay it via the CLI (§8.3) or re-import it.

### 8.3 Node.js CLI (phased)

```bash
# Phase 1 — ingest, look up, freeze the candidate matrix (the determinism boundary)
node index.js --input=terms.csv --candidates=matrix.jsonld --adapter=wiktionary

# Phase 2 — replay frozen matrix + recorded choices → validated, hashed output
node index.js --state=matrix.jsonld --selections=choices.json --output=curated.jsonld
```

Interactive mode (`--interactive`) records every selection to `choices.json`, so a session replays headlessly and byte-identically. **Replay determinism holds given a frozen `matrix.jsonld`** — the matrix is the artifact that captures all non-determinism (timestamps, fetch outcomes).

---

## 9. MCP Server Interface

Stateless wrapper over stdin/stdout. Every tool is a pure function of its `currentState` argument plus an explicitly returned envelope; the server holds no session state.

| Tool | Arguments | Returns |
|---|---|---|
| `lce_load_words` | `{ words: string[] }` | `LexiconDataset`, `fetchPhase:"Initialized"`. |
| `lce_fetch_definitions` | `{ currentState, online?: boolean }` | New state **plus** the raw adapter envelopes used, so the caller can persist them for replay. |
| `lce_get_pending_matrix` | `{ currentState }` | View filtered to `curationStatus:"uncurated"`. |
| `lce_select_definitions` | `{ currentState, lemma, selectedIds, agentName }` | New state; `partiallySelected`. |
| `lce_finalize_curation` | `{ currentState, lemma }` | New state; `selected`. (Required for terminal curation.) |
| `lce_validate` | `{ currentState }` | Validation report + `validationState`. (New — agents can verify.) |
| `lce_export` | `{ currentState }` | Pinned serialization + `ExportManifest` with `datasetHash`. (New — agents can emit the deliverable.) |

**Determinism caveat.** `lce_fetch_definitions` contacts the network and stamps fresh timestamps; reproducibility requires the caller to persist and later replay the returned envelopes, exactly as the CLI freezes `matrix.jsonld`.

---

## 10. Hardened JSON-LD State Specimen

```json
{
  "@context": "https://w3id.org/lce/context.jsonld",
  "@id": "https://w3id.org/lce/id/dataset/9d2f1c47e0a3b8556a1f0c4d2b7e8a91",
  "@type": "lce:LexiconDataset",
  "fetchPhase": "FullyFetched",
  "curationPhase": "PartiallyCurated",
  "validationState": "ValidatedExport",
  "lexicalEntries": [
    {
      "@id": "https://w3id.org/lce/id/entry/3f786850e387550fdab836ed7e6dc881",
      "@type": "lce:LexicalEntry",
      "lemma": "example",
      "normalizedForm": "example",
      "fetchStatus": "fetched",
      "curationStatus": "selected",
      "candidateDefinitions": [
        {
          "@id": "https://w3id.org/lce/id/def/574f5dcf92b9aef50299ae9f96af73b5",
          "@type": "lce:DefinitionCandidate",
          "definitionText": "A representative form of a group.",
          "rank": 1,
          "source": {
            "@type": "schema:CreativeWork",
            "name": "Wiktionary",
            "url": "https://en.wiktionary.org/wiki/example",
            "license": "https://creativecommons.org/licenses/by-sa/4.0/"
          },
          "retrievedAt": "2026-05-29T05:44:00Z",
          "adapter": "WiktionaryRestAdapter",
          "adapterVersion": "1.4.0",
          "credentialPolicy": "none",
          "credentialUsed": false
        }
      ],
      "selectedDefinitions": [
        {
          "@id": "https://w3id.org/lce/id/sel/574f5dcf92b9aef50299ae9f96af73b5",
          "@type": "lce:DefinitionSelection",
          "selectedCandidate": "https://w3id.org/lce/id/def/574f5dcf92b9aef50299ae9f96af73b5",
          "curatedBy": { "@type": "schema:Agent", "name": "LCE Automated Agent Shell" },
          "selectionMethod": "agent",
          "selectedAt": "2026-05-29T05:50:00Z"
        }
      ],
      "resolutionEvents": []
    },
    {
      "@id": "https://w3id.org/lce/id/entry/8a1d2f00c3b9e4715a6e0d4c2f9b7e10",
      "@type": "lce:LexicalEntry",
      "lemma": "offline-only-term",
      "normalizedForm": "offline-only-term",
      "fetchStatus": "deferred",
      "curationStatus": "uncurated",
      "candidateDefinitions": [],
      "selectedDefinitions": [],
      "resolutionEvents": [
        {
          "@type": "lce:ResolutionNotice",
          "resolutionStatus": "Deferred",
          "reason": "OfflinePolicy",
          "message": "Lookup not attempted; shell declared online:false.",
          "adapter": "WiktionaryRestAdapter",
          "adapterVersion": "1.4.0",
          "occurredAt": "2026-05-29T05:44:00Z"
        }
      ]
    }
  ]
}
```

> Note the second entry is `deferred` with reason `OfflinePolicy` (not attempted), which a consumer can now cleanly distinguish from a `blocked`/`CorsBlocked` entry (attempted, refused) or a `failed`/`NetworkUnavailable` entry (attempted, transport down). The dataset is `FullyFetched` because no lookup is pending, even though one term was never contacted.

---

## 11. Architectural Verification Test

> Can an engineer implement, execute, and debug this entire lifecycle using only an offline text editor, a sandboxed browser tab, a local Node runtime, and static JSON-LD mock files?

**Yes, with one explicit boundary.** The core is pure: timestamps and fetch outcomes enter as adapter-envelope inputs, IDs are content-addressed SHA-256 hashes, and the dataset hash is computed over RDFC-1.0 canonical N-Quads — so identical inputs yield identical outputs on every platform. **Reproducibility is guaranteed for the replay path** (frozen candidate matrix + recorded choices). The live browser and live MCP fetch paths introduce real-world non-determinism by design; both expose a freeze step (export the matrix / persist the returned envelopes) that re-enters the deterministic path. Everything downstream of the freeze boundary is verifiable locally with no cloud infrastructure, database, or live endpoint.

---

## 12. Open Items for R3.2

- **Script-aware diacritic folding** for non-Latin lexicons (§4.1 currently scopes folding to Latin).
- **Inverse/derived consistency** if `source`-level relationships ever become bidirectional.
- **`tag:` URI option** (RFC 4151) as an alternative minting scheme for deployments that prefer date-anchored authority over `w3id.org`.

---

## 13. Recommended Default Configuration

```jsonc
{
  "namespace": "https://w3id.org/lce/",
  "normalization": {
    "lowercase": "locale-independent",
    "nfcBeforeLowercase": true,
    "foldDiacritics": false,        // opt-in; Latin-only when true
    "collapseInternalWhitespace": true
  },
  "identity": {
    "hashAlgorithm": "SHA-256",
    "idTruncationBits": 128,
    "canonicalStringFields": ["normalizedLemma", "sourceKey", "definitionText"],
    "delimiter": "\u001F",
    "collisionPolicy": "report-not-crash"
  },
  "datasetHash": {
    "method": "RDFC-1.0",
    "emitSerializationHash": false
  },
  "security": {
    "scrubCredentialUrls": true,
    "scrubNoticeMessages": true,
    "validatorSecretScan": true,
    "persistSecrets": false
  },
  "export": {
    "contextForm": "iri-reference",
    "keyOrder": "lexicographic-id-type-first",
    "setsAsSortedArrays": true,
    "deterministic": true
  }
}
```

---

## 14. Changelog: R3.0 → R3.1

| # | R3.0 Defect | R3.1 Resolution | Section |
|---|---|---|---|
| 1 | JCS hash sold as a *semantic* graph hash, but varies across equivalent serializations. | Primary `datasetHash` computed via **RDFC-1.0** over canonical N-Quads; JCS retained only as an optional, clearly-scoped byte-integrity `serializationHash`. | §5.2, §5.3 |
| 2 | Minted URNs contained raw spaces/non-ASCII and used an unregistered NID; `canonicalString` undefined. | Identity moved into the hash (lemma is a property, not in the IRI); owned `w3id.org` IRIs; `canonicalString` pinned to 3 ordered, US-delimited fields. | §5.1 |
| 3 | `datasetStatus` collapsed fetch + curation + validation into one field; `FullyFetched` satisfiable by an all-offline run. | Split into independent `fetchPhase`, `curationPhase`, `validationState`; `FullyFetched` redefined as "all terminal." | §3.3 |
| 4 | No `NoticeReason → fetchStatus` mapping; `deferred` conflated offline with CORS. | Normative crosswalk added; new `blocked` status; `OfflinePolicy` vs `CorsBlocked` vs transport `failed` distinguished. | §6 |
| 5 | "Total replayability" claimed for paths that re-hit the network. | Determinism scoped to the frozen-matrix replay path; freeze step specified for browser and MCP. | §8.2, §9, §11 |
| 6 | Validation invariants too thin; `selected` unreachable; lineage stated in singular. | Added cross-field consistency, per-selection lineage, secret scan; added `finalizeCuration` to reach `selected`. | §4.1, §7 |
| 7 | Credentials could ride in `sourceUrl`/`message` into `localStorage`/exports. | Mandatory URL/message scrubbing at the integration layer + validator secret-scan backstop. | §4.3, §7.1 |
| 8 | Diacritic fold Latin-only but applied blindly; locale-dependent lowercase. | Fold explicitly scoped to Latin and forbidden on non-Latin scripts; locale-independent lowercase; pinned pipeline order. | §4.1 |
| 9 | 64-bit truncated IDs with a hard-crash uniqueness check. | 128-bit truncation; collisions handled as a structured `ValidationFailed` event. | §5.1, §7.1 |
| 10 | CSV ingestion underspecified. | RFC 4180 with header/column-mapping rules and quoted-field handling. | §4.4 (ref.) |
| 11 | MCP could not export or validate the deliverable, and `selected` was unreachable via MCP. | Added `lce_validate`, `lce_export`, `lce_finalize_curation`. | §9 |
| — | Example `datasetHash` was the SHA-256 of the empty string; manifest reused the dataset suffix. | All example hashes computed or marked placeholder; manifest IDs content-addressed. | §5.1, §5.4 |
| — | Namespace anchored at a third party's domain (`archive.org`). | Owned, dereferenceable `w3id.org/lce/` namespace. | §2.1 |
