# Resident Multimodal Candidate Extraction

Status: approved.

## Desired Behavior

Cestus uses the resident's exact active configured backend/model to extract
provisional ontology candidates from committed local/OCR derivatives and sends
original raw image/PDF artifacts when that same model declares the matching
direct modality. It produces evidence-linked candidate bundles only. It does
not append `assertion.proposed`, accept truth, mutate ontology boundaries, or
create entity/relationship graph events.

Planning snapshots resident instance/configuration revision, authentication/
provider kind, provider adapter, exact configured model, resolved-model
contract, context/output limits, declared `text`/`image`/`document`
capabilities, tool-disable capability, and provider-transfer policy.

A Nous Portal resident uses its exact configured Nous model. A ChatGPT-
authenticated resident uses its exact specified ChatGPT model. A local resident
uses its exact local model. There is no silent model, provider, authentication,
modality, or context fallback. All passes for one artifact retain the same
backend, configured/resolved model, capability revision, and adapter; drift
stops the artifact and outputs from different models are never merged.

Extraction may run before Specification 25 approves an ontology boundary, but
its vocabulary/term, entity, scalar assertion, and relationship candidates are
explicitly provisional. Specifications 25 through 27 block every proposal,
truth, entity, and relationship acceptance until current human authority
exists. Storage, ranking, recommendation, or high confidence never makes model
output truth.

Specification 22/23 blocks and anchors remain immutable. A versioned packer
uses the active model's declared tokenizer/context contract, preserves
canonical block order, reserves fixed system/schema space, limits input to 75%
of context, and reserves at least 4,096 output tokens. Oversized canonical
blocks receive deterministic invocation-only subranges linked to original
anchors. Packing never rewrites derivatives. Model/config change creates a new
invocation plan.

Text-capable models receive canonical local/OCR packs. Image-capable models
also receive each standalone/embedded raw image once in one holistic
multimodal pass. Document-capable models receive each raw PDF once in one
holistic document pass. Capabilities are distinct and never inferred from a
model name. Cestus does not rasterize PDF to bypass absent document support.
The holistic raw pass includes a bounded OCR outline/anchor catalog; remaining
passes use anchored derivative text only. Raw bytes are not retransmitted with
every chunk. Mandatory Specification 23 OCR remains required regardless of
direct modality.

For remote residents, the provider-byte-transfer gate binds exact resident/
provider/model/capability snapshot, derivative packs/bytes, raw artifact
identity/type/hash/one-pass bytes, prompt/schema, planned call count/repeated
bytes, destination/authentication policy, and output limits. An authenticated
human approves that exact plan. Import/Mistral authority cannot satisfy it, and
the resident cannot approve it. Local residents need no external-transfer
approval but retain every model/tool/schema gate.

The extraction adapter has tools, function calls, connectors, browsing, code
execution, memory writes, workspace writes, and delegation disabled. Tool
schemas are absent. It cannot access credentials, source paths, arbitrary
workspace data, ledger mutation ports, provider configuration, PRR/export/
publication tools, or network destinations beyond the exact inference
endpoint. Evidence is delimited as untrusted input. Extraction mutates no
resident conversation or long-term memory. Returned tool/function calls fail.

Every candidate contains deterministic candidate ID/kind, provisional subject/
entity/vocabulary reference, predicate/proposed term, scalar object or
provisional relationship target, model confidence, exact evidence/derivative/
block/source anchors, pass/invocation identities, bounded rationale,
uncertainty, alternatives, optional conflict group, resolved provider/model,
and `review-only` reasons.

Candidate identity derives from invocation, response ordinal, canonical
candidate content, and anchor set. Safe fields reject credential-shaped
material. Unknown kinds/types/fields/evidence/anchors/objects/confidence or
cross-artifact references fail validation. Malformed JSON/schema, unsupported
anchors, tool calls, unsafe metadata, credential-shaped safe fields, output
overflow, or model mismatch fails the complete invocation. No partial
publication or automatic repair call exists; rerun requires a new exact
invocation/transfer decision.

Limits are 1,000 candidates per invocation, 64 KiB per serialized candidate,
16 MiB response, 32 evidence anchors per candidate, 16 alternatives per
candidate, 4,096 UTF-8 bytes of rationale, and eight passes per artifact.
Artifacts requiring more passes become `blocked-context-limit`; blocks are
never silently omitted.

A candidate is individually `review-only` when model confidence is below
`0.75`, supporting OCR words average below `0.85`, any supporting OCR word is
below `0.70`, direct interpretation conflicts with OCR, passes propose
incompatible values for one subject/predicate, support is whole-artifact only,
a formula cache is missing, or a vocabulary/entity reference is outside the
current approved boundary. Scores never authorize truth or bulk acceptance.

Exact canonical duplicates may consolidate while retaining all invocation/
evidence anchors. Semantic alternatives remain separate. Conflict groups
retain every competing candidate and OCR/direct evidence path. The resident
provides one non-authoritative evidence-based recommendation, but no alternative
is preselected. Later human review resolves or explicitly preserves conflict.

Image results may cite a checked normalized region with raw-artifact identity
and related OCR blocks. Direct PDF results may cite checked page/region only
when document capability returns it. Whole-artifact-only claims stay review-
only. OCR and raw anchors remain distinguishable.

Terminal results are `candidate-bundle-generated`,
`review-only-bundle-generated`, `blocked-transfer-approval`,
`blocked-capability`, `blocked-context-limit`, `failed-input`,
`failed-model-drift`, `failed-provider`, and `failed-output`. A committed bundle
is immutable and binds plan, responses, model identities, derivatives, anchors,
and transfer approval. Same-invocation replay is idempotent; new model/rerun
creates a new bundle.

## Observable Acceptance Examples

- Nous, ChatGPT-authenticated, and local fixtures select exactly the active
  configured model. Changed provider/model/capability during a multipass
  artifact stops without merging outputs or falling back.
- A text-only model receives anchored OCR text only. An image-capable model
  receives one raw image holistic pass plus derivative packs. A document-
  capable model receives one raw PDF pass; image-only capability cannot cause
  PDF rasterization.
- Mandatory OCR completes before direct vision/document reconciliation and is
  never skipped because the resident supports raw modality.
- Remote invocation needs an exact human transfer approval for every planned
  pack/raw byte. Local invocation needs no external transfer approval. Import/
  OCR authority and resident-originated approval both fail.
- Prompt-injection evidence cannot enable a tool, connector, memory write,
  workspace/ledger mutation, credential access, or unrelated network request.
- Canonical packing is deterministic and preserves all blocks within eight
  passes. Overflow becomes `blocked-context-limit`, not omitted context.
- Each candidate kind validates exact anchors. Malformed schema, unknown/cross-
  evidence anchors, unsafe fields, tool calls, response overflow, or model
  mismatch fails the whole invocation without a repair call.
- The fixed confidence/OCR thresholds and every direct/OCR conflict produce
  review-only candidates with all evidence paths and a non-preselected
  recommendation.
- Pre-boundary extraction stores provisional candidates and appends no
  assertion, accepted truth, entity, or relationship event.
- Standard verification uses fake models/providers/tokenizers/transfer gates
  and synthetic derivatives. It uses no real credential, resident/provider
  call, SSD read, socket bind, truth mutation, PRR, or publication.

## Allowed Scope

- `packages/agent/src/provider.ts`, provider capability/selection/transfer
  adapters, and focused adjacent modules for exact active model snapshot,
  modality declarations, tool-disabled inference, deterministic packing, and
  exact transfer consumption.
- `packages/agent/src/ontology-bootstrap-workflow.ts` and focused adjacent
  modules for strict provisional candidate validation, conflicts,
  recommendations, immutable bundles, and safe status projection.
- `packages/agent/test/**` for exact model selection, modalities, transfer,
  isolation/prompt injection, packing, drift, strict output, confidence,
  conflict, idempotency, and zero-live-effect fixtures.
- `packages/ontology-bootstrap/src/**` only for provisional vocabulary/entity/
  assertion/relationship candidate and bundle contracts; no proposed/accepted
  events.
- `packages/ontology-bootstrap/test/**` for schema, anchors, conflict, and
  pre-boundary non-authority tests.
- `packages/local-runtime/src/**` only for active resident snapshot/dependency
  wiring, exact transfer preview/decision, per-artifact execution, and safe
  read projection.
- `packages/local-runtime/test/**` for configured-provider routing, actor,
  transfer binding, local/remote distinction, and zero-live-effect tests.
- Do not modify source/import/redaction/OCR authority, canonical derivative
  content, ontology boundary/truth/entity/relationship acceptance, provider
  credentials, audio/video, UI, PRR, legal, export, publication, or destructive
  operations.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/22-local-artifact-derivatives-anchors.md`
- `docs/agentic/specifications/23-automatic-mistral-ocr.md`
- `packages/agent/src/provider.ts`
- `packages/agent/src/provider-registry.ts`
- `packages/agent/src/provider-selection.ts`
- `packages/agent/src/adapters/provider-byte-transfer.ts`
- `packages/agent/src/ontology-bootstrap-workflow.ts`
- `packages/ontology-bootstrap/src/contracts.ts`
- `packages/local-runtime/src/agent-provider-configuration.ts`
- `packages/local-runtime/src/runtime-factory.ts`

## Risk Lane

Red. This slice may transfer imported evidence/raw artifacts to a configured
remote resident provider and incur cost. Exact provider-byte-transfer approval
remains a human action; build verification uses only fakes and performs no
transfer or model invocation.

## Targeted Verification

- `npm test -- packages/agent/test/provider-capability-modalities.test.ts packages/agent/test/provider-byte-transfer.test.ts packages/agent/test/resident-model-selection.test.ts packages/agent/test/resident-candidate-extraction.test.ts packages/agent/test/resident-extraction-isolation.test.ts`
- `npm test -- packages/ontology-bootstrap/test/contracts.test.ts packages/ontology-bootstrap/test/candidate-bundles.test.ts`
- `npm test -- packages/local-runtime/test/resident-artifact-derivation.test.ts packages/local-runtime/test/resident-transfer-approval.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves exact active-model use,
declared multimodal routing, one raw holistic pass, mandatory OCR, exact remote
transfer authority, local no-transfer behavior, tool-disabled isolation,
deterministic bounded packing, strict anchored provisional candidates,
review/conflict rules, zero truth events, and zero live/external effects.

## Integration Verification

Build only after Specifications 22 and 23 are integrated. Update the candidate
normally against latest `neo`, obtain a fresh Sol `ship` verdict on the final
diff, then run `npm run verify` once on the final merged candidate. Compare with
the current recorded baseline and latest `neo` CI; reject any new or worsened
failure. Integrate with normal Git history, push only configured `origin`,
observe CI, do not open a pull request, and do not force-push. Real resident
credential/transfer/invocation remains a separately human-gated live action.

## Escalation Conditions

Escalate for a different resident model/provider, inferred modality, raw PDF
rasterization, repeated raw transfer beyond the approved plan, removal of
provider-byte-transfer approval, enabled tool/connector/write behavior,
partial/auto-repaired output, changed limits/thresholds, model output becoming
truth, live credential/provider use during build, unavailable required model/
tool-disable capability, or the same concrete failure surviving two focused
repair attempts.
