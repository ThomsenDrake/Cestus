# On-Device Secret Redaction

Status: approved.

## Desired Behavior

Cestus provides a fail-closed, on-device redaction service for the narrow class
of secret-like files admitted by later resident ingestion. The service handles
only `.env`, `.env.*`, and JSON that structurally contains private JWT signing
key material. It does not scan ordinary workspace documents for general PII.

The service uses Liquid AI's
`LiquidAI/LFM2.5-Encoder-350M-PII-Detector` at immutable Hugging Face revision
`b8c9cf3d2d6ae52501b35a27ba46f271449c9ce2`. Model setup is an explicit
human action. It downloads the approved package once, verifies the complete
manifest, runs a synthetic self-test, and atomically activates it. Runtime
inference is local, CPU-only, network-isolated, and never downloads or updates
code, weights, tokenizers, or dependencies. A changed revision or artifact
requires another explicit human setup approval and full revalidation.

The approved package contains these required files and SHA-256 digests:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `LICENSE` | 10,574 | `30adf9d6478191fb87f2424f63ba0728598335aaf99cd2848ef17e8e545fe94b` |
| `config.json` | 12,497 | `ced1b2917ec78c766b309233a38dd3351b6bd1cb4ba22c18363ce47c190679ac` |
| `context_cued.py` | 36,253 | `2a65a71e7625267b6dae4afd9a3256faa02ec3a724a754622f5c295d6252c33c` |
| `label_schema.json` | 7,966 | `d7cfec3e82e9fa51c24b6c59ad60dee63b718086c46f89999b6450da324668aa` |
| `model.safetensors` | 1,418,613,184 | `fbfec8b59db250a1d35b4ddc0d73571777f7088946ee22a5d7962e37c02ea6a8` |
| `modeling_phase2_tc.py` | 6,554 | `e48f084a44f25a43389a153dba6c94d53cb8f8fa4afd9f95b36ea697bf24d863` |
| `pii_hybrid_decode.py` | 11,746 | `798ee81182e1a5a68307d01e8bb350bcd36fa68ebe68e58bb5bacdc2a6c95ed5` |
| `tokenizer.json` | 4,733,371 | `1efc3a6609abf6b63b1f47188d139f3b59973a6a434dffe970a7261a51ed2711` |
| `tokenizer_config.json` | 616 | `2892f908f7cc397e412a92be1526234079542d139b3c2bc7e1b06921b6f55cd0` |

The reviewed worker stack is Python 3.12 with CPU-only `torch==2.12.0`,
`transformers==5.11.0`, `tokenizers==0.22.2`, `safetensors==0.8.0`, and
`huggingface_hub==1.19.0`. Implementation commits a hash-locked environment.
The worker may use verified custom model code from the activated local package,
but it must load with local-files-only behavior and may not execute mutable
remote code.

At runtime Cestus classifies the file before invoking the worker:

- `.env` and `.env.*` qualify. `.env.example` and equivalent example/template
  variants qualify only when deterministic inspection finds credential-like
  values; otherwise they remain excluded configuration.
- JSON qualifies when a JWK/JWKS contains a private parameter such as `d`,
  `p`, `q`, `dp`, `dq`, `qi`, or `oth`, or when a service-account/signing-key
  object contains a private key field. Public-only verification keys pass
  unchanged. Ordinary data JSON and ordinary configuration do not enter this
  redaction service.

Cestus parses eligible input with strict encoding, size, depth, and shape
limits. It sends only candidate values and minimal structural labels to a
non-listening Python worker over bounded stdin/stdout. The worker returns spans,
credential class, offsets, detection source, and model score; it never rewrites
or persists the file. Cestus combines model spans with deterministic credential
detectors, rewrites through a syntax-aware `.env` or JSON adapter, reparses the
result, and performs a second complete credential scan.

Only these detected classes may be redacted:
`credential.api_key`, `credential.connection_string`, `credential.jwt`,
`credential.password`, `credential.private_key`, and
`developer.login_credentials`, plus structurally private JWT-key fields. Other
PII classes are ignored. Replacements are typed, non-reversible, and
non-correlatable, for example `[REDACTED:credential.api_key]`. The service
preserves valid `.env` or JSON structure and never stores a secret-derived
equality token.

Raw source bytes exist only in bounded process memory. They are never written
to a Cestus blob, derivative, ledger event, log, diagnostic, crash report,
prompt, cache, temporary file, or model cache. Provenance uses a fresh
per-observation nonce and a keyed commitment produced through a device-local,
non-exportable key handle. It permits exact-source revalidation but cannot be
compared across observations or used as an offline plain-hash oracle.

A clean derivative is eligible for automatic ingestion under the later exact
source-import approval; redaction itself requires no second routine approval.
Failure or uncertainty produces a metadata-only quarantine record. The human
may exclude the source, retry after an approved setup repair, or provide a
manually sanitized replacement bound to the exact observation. A replacement
requires explicit human approval and must pass the same parse and rescan gates.
No approval can override residual-secret detection.

The Python worker runs through `bubblewrap` with a separate network namespace,
read-only verified model and runtime mounts, an empty temporary area, a scrubbed
environment, no home/workspace/source/credential/ledger mount, no listening
socket, and process, memory, input, context, output, and time limits. Source
paths are never sent to the worker. Raw stderr and Python tracebacks are
suppressed from product surfaces; Cestus records only fixed secret-safe error
codes and counts.

Append-only ledger behavior, projection rebuildability, evidence provenance,
consume-time approval validation, provider transfer gates, PRR/legal/export/
publication gates, and no-fallback-write behavior remain unchanged.

## Observable Acceptance Examples

- Setup downloads only the nine manifest files from the exact revision above.
  A mismatched byte count, digest, repository revision, dependency lock,
  license file, self-test result, or interrupted download leaves the previous
  approved installation active or leaves the service unavailable. No partial
  directory can become active.
- A second setup request for a changed model, decoder, tokenizer, dependency,
  or manifest requires a new authenticated human decision. The resident may
  request setup but cannot approve it. Runtime never checks Hugging Face for an
  update.
- `.env` containing `API_KEY=sk-proj-synthetic000000000000000` and
  `REGION=us-east-1` produces valid `.env` with the API key replaced and the
  region preserved. The original value is absent from every serialized result,
  log, exception, and fake durable store.
- `.env.production`, `.env.local`, and a credential-bearing `.env.example`
  qualify. A placeholder-only `.env.example`, `.envrc`, `settings.yaml`, and
  Markdown do not enter the service.
- A private RSA/EC/OKP JWK, a private member inside a JWKS `keys` array, and a
  service-account JSON object with `private_key` qualify. An ordinary data JSON
  object and a JWK containing only `kty`, `kid`, `alg`, `use`, `n`, `e`, `x`,
  or `y` do not require redaction and remain byte-identical.
- Repeated occurrences of the same synthetic secret receive no stable shared
  token. Repeating the same source observation can be revalidated through its
  keyed commitment; observing the same bytes twice yields non-comparable
  public commitments.
- Malformed JSON, unsupported encoding, oversized input/value, ambiguous
  offsets, truncated inference, worker timeout, worker crash, unavailable
  `bubblewrap`, unavailable verified model, or any residual credential signal
  yields quarantine metadata only and no ingestible derivative.
- A manually sanitized replacement cannot be used for another source
  observation, another workspace, or a changed source. It is admitted only
  after human approval and the same clean rescan.
- The worker command exposes only pipe descriptors and verified read-only
  mounts. Tests assert an unshared network namespace and the absence of source,
  workspace, home, and credential mounts before any model input is written.
- Standard verification uses synthetic values and a fake worker. It does not
  download weights, inspect a real credential, read the attached SSD, run live
  inference, bind a socket, or invoke an external provider.

## Allowed Scope

- `packages/ingestion/src/**` only for secret-file classification, bounded
  syntax adapters, deterministic detectors, redaction contracts, safe
  manifests/quarantine, and the injected keyed-commitment port.
- `packages/ingestion/model-workers/lfm-pii/**` for the reviewed pipe worker,
  exact model manifest, dependency lock, local-only loader, and synthetic
  self-test. Do not commit model weights or a model cache.
- `packages/ingestion/test/**` for focused synthetic classification,
  redaction, syntax, non-correlation, fail-closed, and no-leak tests.
- `packages/agent/src/os-secret-store.ts` and its focused tests only if needed
  to expose an opaque keyed-commitment handle; no key bytes or new generic
  credential API may be exposed.
- `packages/local-runtime/src/**` only for authenticated model setup request,
  explicit human setup execution, atomic activation, readiness, worker launch,
  quarantine resolution, and dependency injection.
- `packages/local-runtime/test/**` for setup, readiness, isolation command,
  actor authority, activation rollback, replacement approval, and secret-safe
  route/CLI tests.
- `package.json` and `package-lock.json` only for bounded setup/readiness scripts
  or dependency-neutral test wiring. Python dependencies belong in the worker's
  hash-locked environment.
- Do not modify general PII policy, ordinary document ingestion, ontology truth,
  resident model selection, Mistral OCR, provider credentials/transfer,
  scheduler behavior outside the focused jobs, UI, PRR, legal, export,
  publication, destructive operations, or historical product-design material.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/15-resident-source-boundary.md`
- `packages/ingestion/src/runtime.ts`
- `packages/ingestion/src/local-filesystem.ts`
- `packages/ingestion/src/mount-contract.ts`
- `packages/agent/src/os-secret-store.ts`
- `packages/agent/src/tool-gateway.ts`
- `packages/local-runtime/src/cli.ts`
- `packages/local-runtime/src/runtime-factory.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`

## Risk Lane

Red. This slice introduces a credential/secret trust boundary and an external
model-package download. The exact setup download, model replacement, and
manual sanitized-replacement acceptance remain authenticated human actions.
Build and verification may prepare those paths but may not perform a real
download, inspect a credential, or process real source content.

## Targeted Verification

- `python -m py_compile packages/ingestion/model-workers/lfm-pii/*.py`
- `npm test -- packages/ingestion/test/on-device-secret-redaction.test.ts packages/ingestion/test/secret-source-commitment.test.ts`
- `npm test -- packages/local-runtime/test/secret-redaction-model-setup.test.ts packages/local-runtime/test/secret-redaction-readiness.test.ts packages/local-runtime/test/secret-redaction-quarantine.test.ts`
- `npm test -- packages/agent/test/os-secret-store.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means the named suites prove exact manifest pinning, human-only setup
and replacement, atomic activation, local-only sandboxed inference, the exact
file/class allowlist, syntax-preserving redaction, clean-rescan automatic
eligibility, metadata-only quarantine, non-correlatable provenance, and zero
raw-secret persistence. Every command exits zero without a model download or
live inference.

## Integration Verification

Update the candidate normally against the latest `neo`, obtain a fresh Sol
`ship` verdict on the final diff, then run `npm run verify` once on the final
merged candidate. Compare with the current recorded baseline and latest `neo`
CI; reject any new or worsened failure. Integrate with normal Git history, push
only configured `origin`, observe CI, do not open a pull request, and do not
force-push. The live model setup remains a separate human-gated action.

## Escalation Conditions

Escalate for a different model/revision, changed artifact or dependency pin,
support for more file types or PII classes, removal of OS-enforced network
isolation, persistent raw input, plain or correlatable source fingerprints,
an override for a failed rescan, credential exposure, a real model download or
live secret processing during build, an unavailable required isolation or
runtime dependency, or the same concrete failure surviving two focused repair
attempts.
