# Pinned LFM Installation And Isolated Runtime

Status: approved.

## Desired Behavior

Cestus installs, validates, activates, and launches one pinned on-device LFM
worker bundle for protected-source redaction. This specification does not scan
sources, open import artifacts, classify secrets, redact content, quarantine
observations, or admit evidence. It supplies the verified offline worker
interface consumed by Specification 18.

One explicit authenticated human setup action authorizes all network effects
needed for a complete bundle: a self-contained CPython 3.12 distribution,
hash-locked CPU-only dependencies, model files, tokenizer, verified custom
model code, license, and metadata. Setup downloads only exact manifest URLs;
every initial URL and permitted redirect host is listed in the checked-in
installation manifest. The installer supplies no credential and rejects an
unlisted host, redirect, scheme, proxy injection, artifact, or dependency.

The model is
`LiquidAI/LFM2.5-Encoder-350M-PII-Detector` at immutable Hugging Face revision
`b8c9cf3d2d6ae52501b35a27ba46f271449c9ce2`. Its required package is:

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

The reviewed dependency surface is CPython 3.12, CPU-only `torch==2.12.0`,
`transformers==5.11.0`, `tokenizers==0.22.2`, `safetensors==0.8.0`, and
`huggingface_hub==1.19.0`. The checked-in manifest and uv lock must identify the
exact CPython patch/distribution and every transitive wheel by source URL,
filename, size, and SHA-256 digest. Source distributions, mutable version
ranges, dependency resolution during activation, GPU packages, and reliance on
the host Python are forbidden.

Changing any URL, redirect allowlist, byte count, digest, CPython distribution,
wheel, dependency, custom-code file, tokenizer, decoder, model revision,
sandbox contract, or self-test vector requires a new explicit setup approval.
Runtime never checks for updates or contacts an artifact host.

Setup downloads into a private same-filesystem staging directory. It creates no
executable or active path until every artifact has passed expected URL, final
host, regular-file, size, digest, archive-shape, ownership, permission, and
dependency-closure checks. Archive extraction rejects absolute paths, `..`,
links, devices, duplicate members, case/Unicode collisions, and expansion
beyond declared limits.

Validation loads the exact local tokenizer, verified custom code, and model
with local-files-only behavior and runs a deterministic synthetic inference
self-test. The self-test runs under the same `bubblewrap` policy as production.
Files and parent directories are flushed before one atomic compare-and-swap
activation-pointer update. Concurrent setup, activation, rollback, or deletion
with stale state fails closed. A crash before activation leaves the prior
bundle current; a crash after activation exposes exactly one complete,
revalidatable bundle.

Cestus retains the current verified bundle and one prior verified bundle.
Rollback is explicit, authenticated, and human-approved, never automatic, and
reruns complete validation before activation. A bundle referenced by a durable
protected-derivative envelope cannot be deleted. Further retention requires a
new storage-policy decision.

Every worker launch revalidates the active activation identity, complete
manifest, regular-file types, ownership and permissions, all artifact digests,
CPython/runtime versions, dependency closure, self-test version, read-only
bundle status, and `bubblewrap` availability. Any mismatch makes the worker
unavailable. There is no unsandboxed, online, alternate-model, alternate-
runtime, or host-Python fallback.

Production inference runs through `bubblewrap` with a new network namespace,
no listening socket, the verified bundle mounted read-only, a minimal required
read-only system surface, an empty private temporary filesystem, and no home,
workspace, source root, SSH/cloud configuration, credential store, product
ledger, arbitrary device, or host temporary-directory mount. The launcher
clears the environment and reconstructs a strict fixed allowlist. Runtime
downloads, telemetry, remote-code resolution, update checks, and subprocesses
outside the fixed bundle are disabled.

Source text enters only through a bounded pipe or sealed anonymous memory
object and never through a path or command argument. The versioned,
length-delimited response channel carries structured spans, labels, scores,
model identity, and bounded runtime measurements. CPU, memory, process count,
file descriptors, input, token context, output, and wall time are capped.
Malformed requests/results, unknown protocol fields, excessive output,
timeouts, worker crashes, sandbox loss, or resource exhaustion fail closed and
emit only fixed secret-safe error codes.

## Observable Acceptance Examples

- A fake approved setup installs exactly the manifest-listed CPython runtime,
  wheels, and nine model files through listed HTTPS hosts and redirects. An
  extra file, changed final host, proxy-injected URL, dependency substitution,
  size mismatch, or digest mismatch prevents activation.
- An interrupted download, truncated archive, traversal member, symlink,
  duplicate member, decompression overrun, failed dependency closure, or failed
  self-test leaves the previous activation unchanged.
- A second setup with any changed bundle input requires a new human decision.
  The resident may request setup but cannot approve it.
- Per-launch mutation of a model, tokenizer, custom-code, Python, wheel,
  manifest, permission, or activation pointer prevents all model input.
- The sandbox has no usable network, home, workspace, source, credential,
  ledger, host temporary directory, or writable bundle path. A synthetic
  attempt to open one or spawn an unlisted executable fails.
- Inputs and outputs exceeding configured byte/token/span limits, malformed
  protocol frames, timeouts, crashes, and missing `bubblewrap` fail closed with
  no unsandboxed retry.
- Explicit rollback revalidates and atomically activates the retained prior
  bundle. Stale, resident-originated, automatic, or referenced-bundle deletion
  requests fail.
- Standard verification uses a tiny synthetic fake bundle and fake downloader.
  It performs no real download, model inference, credential use, source read,
  provider call, or listening network action.

## Allowed Scope

- `packages/ingestion/model-workers/lfm-pii/**` for the reviewed worker,
  checked-in artifact manifest, uv lock, local-only loader, protocol, sandbox
  self-test, and synthetic fixtures. Do not commit model weights, downloaded
  runtimes, wheels, or caches.
- `packages/ingestion/src/**` only for the injected worker protocol and
  availability contract; no classification or admission behavior.
- `packages/ingestion/test/**` for protocol, malformed result, timeout,
  resource-bound, and fail-closed worker fixtures.
- `packages/local-runtime/src/**` only for authenticated setup/rollback
  previews and decisions, strict downloader, staged verification, atomic
  activation, retention protection, per-launch validation, and sandbox launch.
- `packages/local-runtime/test/**` for supply-chain, archive, concurrency,
  crash, rollback, sandbox, environment, resource, and no-leak tests.
- `package.json` and `package-lock.json` only for bounded setup/readiness scripts
  or dependency-neutral test wiring. Python dependencies remain in the
  hash-locked worker environment.
- Do not modify source scanning, commitment cryptography, redaction policy,
  evidence admission, provider/OCR behavior, ontology truth, UI, scheduler
  semantics outside this worker, PRR, legal, export, publication, or
  destructive operations.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/16-secret-commitment-backend.md`
- `packages/ingestion/src/runtime.ts`
- `packages/local-runtime/src/cli.ts`
- `packages/local-runtime/src/runtime-factory.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`
- `package.json`
- `package-lock.json`

## Risk Lane

Red. This slice performs an external software/model download and activates
verified custom model code. The exact setup, update, rollback, and deletion
decisions remain authenticated human actions; verification may not perform a
real download or live inference.

## Targeted Verification

- `python3 -m py_compile packages/ingestion/model-workers/lfm-pii/*.py`
- `npm test -- packages/ingestion/test/lfm-worker-protocol.test.ts packages/ingestion/test/lfm-worker-fail-closed.test.ts`
- `npm test -- packages/local-runtime/test/lfm-model-setup.test.ts packages/local-runtime/test/lfm-model-readiness.test.ts packages/local-runtime/test/lfm-model-isolation.test.ts packages/local-runtime/test/lfm-model-rollback.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves exact full-bundle pinning,
single-action setup authority, atomic activation, explicit rollback, retained
reference protection, per-launch validation, local-only sandboxed inference,
secret-safe bounded protocol failure, and zero real download/live effects.

## Integration Verification

Build only after Specification 16 is integrated. Update the candidate normally
against latest `neo`, obtain a fresh Sol `ship` verdict on the final diff, then
run `npm run verify` once on the final merged candidate. Compare with the
current recorded baseline and latest `neo` CI; reject any new or worsened
failure. Integrate with normal Git history, push only configured `origin`,
observe CI, do not open a pull request, and do not force-push. Real setup and
rollback remain separately human-gated actions.

## Escalation Conditions

Escalate for a changed model/revision/artifact/dependency, an unpinned runtime
or source distribution, a broader download host, credentialed download,
runtime network access, removal of OS-enforced isolation, an unsandboxed or
alternate-model fallback, automatic rollback, deletion of a referenced bundle,
real setup/inference during build, unavailable required isolation/runtime
support, or the same concrete failure surviving two focused repair attempts.
