# Syntax-Aware Redaction And Protected Derivative Eligibility

> **Development authority:** This is a non-authoritative product-requirement
> source. Historical status, execution, role, risk, repair, review, integration,
> and verification text below does not govern current work. Follow \`AGENTS.md\`,
> Compound Engineering, and \`SECURITY.md\`.

Status: approved.

## Desired Behavior

Cestus processes only protected source observations: POSIX basenames exactly
`.env` or beginning `.env.`, and ASCII case-insensitive `.json` files that
structurally match private or symmetric JWK/JWKS material. It produces either a
policy-validated protected derivative envelope or a metadata-only quarantine
disposition. It does not traverse paths, install models, schedule jobs, admit
product evidence, invoke a resident/provider, or change ontology truth.

Specification 19 supplies one descriptor-confined immutable byte snapshot.
This service never reopens the source path. Before parsing, it uses
Specification 16's non-exporting API to compute a fresh nonce-bound commitment
over that exact snapshot. Source identity, manifest entry, byte count,
commitment context, and import approval remain bound through publication. Raw
bytes exist only in bounded memory and never enter a file, blob, cache, log,
diagnostic, exception, crash report, event, prompt, quarantine record, or
command argument.

The Specification 19 descriptor is transferred directly to a dedicated local
worker without the supervisor reading, mapping, copying, or buffering source
bytes. Before accepting or forwarding that descriptor, the supervisor, worker,
and every helper process capable of holding raw bytes set `RLIMIT_CORE=0`,
`PR_SET_DUMPABLE=0`, and an empty Linux core-dump filter; any process that
cannot attest that posture is excluded from the transfer path. Raw-byte
parsing/redaction runs in that worker, which establishes the same posture before
accepting input; disables language-runtime diagnostic/core reports; inherits no
crash uploader; and zeroes request/reconstruction buffers before exit. The
supervisor never includes input, output, model text, traceback, or memory dumps
in a diagnostic. Failure to establish or attest this posture blocks the
snapshot before transfer to the worker. Kernel/OOM telemetry outside Cestus is
not a product surface, but Cestus creates no dumpable process containing raw
bytes.

`.env` matching is case-sensitive and excludes names such as `.environment`.
The parser accepts UTF-8 blank lines, comments, optional `export`, conventional
identifiers, and unquoted, single-quoted, or double-quoted single-line values.
It preserves original newline style, whitespace, ordering, comments, and every
unaffected byte. Multiline values, malformed quotes/escapes, invalid encoding,
or unsupported extensions fail closed. A repeated name is accepted only when
its decoded values are byte-identical; conflicting duplicates are quarantined.
Every nonempty assignment value is deterministically redacted, regardless of
its name or model result.

JSON must be valid UTF-8 with no duplicate property names. It qualifies only
as one recognized structure:

- a JWK with `kty: "oct"` and a nonempty symmetric `k` value;
- an RSA JWK with private `d`, including any present `p`, `q`, `dp`, `dq`,
  `qi`, or `oth` private parameters;
- an EC or OKP JWK with private `d`; or
- a JWKS `keys` array containing at least one such JWK.

Every recognized private or symmetric value is deterministically replaced.
Public parameters such as `kty`, `kid`, `alg`, `use`, `n`, `e`, `x`, and `y`
remain unchanged unless the model identifies credential content inside a
string value of an already-qualified private/symmetric JWK/JWKS structure.
Public-only JWK/JWKS bypasses this service entirely and remains ordinary byte-
identical JSON under Specification 19.
Generic fields named `secret`, `password`, or `private_key`, service-account
objects, unrelated configuration, mixed unknown key schemas, malformed key
material, and ambiguous structures do not silently broaden this protected
class; ambiguity is quarantined for human resolution.

Protected input is capped at 1 MiB. A `.env` logical value is capped at 64 KiB.
JSON is capped at depth 32 and 10,000 nodes. Invalid UTF-8, excessive input,
value, depth, node, token, span, or output limits produce metadata-only
quarantine. Ordinary non-protected import limits belong to later import
specifications and are unchanged.

The activated Specification 17 worker receives only these deterministic
semantic candidates with checked source-coordinate mappings: each decoded
nonempty `.env` assignment value, and every JSON string leaf inside an already
qualified private/symmetric JWK or a JWKS member containing one. Candidate
order is source-byte order. At most 10,000 candidates, 64 KiB UTF-8 per
candidate, 262,144 tokenizer tokens per file, 512 returned spans per window,
and 8,192 spans per file are permitted; overflow quarantines the whole
observation. It may affect content only for these six
labels: `credential.api_key`, `credential.password`,
`credential.private_key`, `credential.jwt`, `credential.connection_string`,
and `developer.login_credentials`. Every emitted span in one of those classes
is redacted regardless of score. Other PII labels cannot alter content.
Unknown labels, invalid offsets, invalid Unicode boundaries, contradictory
overlaps, malformed output, timeout, worker failure, or incomplete inference
cause quarantine; confidence is never a bypass.

Canonical source coordinates are zero-based half-open UTF-8 byte ranges. Model
character ranges are converted through a checked Unicode-scalar-to-byte map.
Each candidate is tokenized exactly once with the pinned tokenizer, without
truncation or added model text. Token windows are `[s, min(s + 4096, N))` with
`s = k * 3584`, giving 512-token overlap. For a non-first window the owned
span-start lower bound is `s + 256`; for a non-last window its exclusive upper
bound is `s + 3840`; the first/last bounds are `0`/`N`. Thus every token-start
belongs to exactly one window and every owned start has room for a complete
256-token span in its owning window. Emitted spans are at most 256 tokens and only
the owning window contributes them. A span touching a truncated window edge
must reconstruct identically from the adjacent window; missing, disagreeing,
out-of-window, or incomplete reconstruction quarantines the observation.
Character offsets are decoded against the one tokenization and then mapped to
the canonical source bytes. Window/result order never changes ownership.

Deterministic and model spans are unioned, with deterministic spans taking
precedence when overlaps normalize. Replacements reveal only a fixed
credential class, never original value, length, digest, prefix, suffix, or a
correlatable token. `.env` receives a syntax-safe fixed unquoted value; JSON
receives a valid fixed JSON string. Reconstruction copies all non-redacted
bytes exactly.

The completed derivative is reparsed, reruns deterministic validation, and
passes a second complete isolated LFM policy run. Residual deterministic
credential material, malformed output, inconsistent/non-idempotent results, or
failed model execution causes quarantine. A successful result is certified as
having completed this exact versioned deterministic/model policy; it is not
represented as globally secret-free.

A protected derivative envelope binds the manifest entry and immutable source
observation, nonce-bound source commitment, derivative SHA-256 and byte count,
redaction-policy revision, parser/coordinate versions, active model/runtime
bundle, commitment-key version, normalized replacement ranges/classes, exact
import approval, and Specification 16 security posture. It contains no source
credential bytes or reversible transform.

After the exact import selection is approved, a successful derivative becomes
eligible for automatic evidence admission by Specification 20 without another
per-artifact approval. Quarantined observations remain metadata-only and are
never admitted or transferred to a resident/provider.

A human may provide a manually sanitized replacement explicitly bound to one
source-observation commitment. It must pass the same limits, parser,
deterministic validation, isolated model policy, and publication checks. A
separate authenticated human decision approves only that exact replacement
digest; it cannot waive a failed check, authorize original bytes, or apply to a
different observation, source, boundary, workspace, or import approval.

No derivative becomes visible until both policy passes, commitment
verification, and final digesting succeed. Publication uses one conditional
append against current manifest entry, import approval, policy revision,
runtime bundle, commitment key/posture, and destination. Stale state fails
without partial admission. Replaying an identical envelope is idempotent;
conflicting reuse of an observation identity fails closed.

## Observable Acceptance Examples

- `.env` containing `API_KEY=synthetic-secret` and `REGION=us-east-1`
  produces valid `.env` with both nonempty values replaced by fixed tokens;
  names, ordering, comments, whitespace, and newlines remain byte-identical.
- `.env.production` and `.env.example` qualify. `.environment`, `.envrc`,
  Markdown, unsupported multiline syntax, conflicting duplicate assignments,
  invalid UTF-8, and over-limit files produce no ingestible derivative.
- Private RSA, EC, OKP, symmetric JWK, and mixed public/private JWKS fixtures
  replace all private/symmetric parameters. Public-only JWK/JWKS remains
  byte-identical. Unrelated JSON, generic secret-named fields, duplicate keys,
  malformed or ambiguous schemas do not silently enter automatic redaction.
- Low-score output for each approved credential label is redacted. A PII-only
  label cannot alter content. Invalid classes, Unicode/byte ranges, window-edge
  spans, excessive results, timeouts, and crashes quarantine the observation.
- Descriptor-transfer fixtures prove no supervisor/helper reads or maps raw
  bytes and every possible raw-byte holder establishes no-dump posture before
  receipt; failed attestation prevents transfer.
- Exact 4,096/512/3,584-token boundary fixtures prove ownership at token starts
  3,839/3,840, complete cross-window reconstruction, disagreement quarantine,
  and candidate/token/span cap failures without partial output.
- Repeated source values reveal no stable replacement or public commitment.
  Every non-redacted output byte matches the source snapshot exactly.
- A changed source, manifest, approval, policy, model bundle, commitment key,
  posture, or destination between processing and conditional publication
  yields no derivative or evidence.
- A manually sanitized replacement for one synthetic observation cannot be
  reused for another and cannot bypass either validation pass.
- Standard verification uses synthetic values, immutable fake snapshots, a
  fake commitment backend, and a fake worker. It does not read the attached
  SSD, inspect a real credential, download/run the model, invoke a provider,
  bind a socket, or create live evidence.

## Allowed Scope

- `packages/ingestion/src/**` only for protected-file classification, bounded
  `.env`/JWK syntax adapters, deterministic spans, Unicode coordinates,
  replacement, derivative/quarantine envelopes, conditional eligibility, and
  injected commitment/worker ports.
- `packages/ingestion/test/**` for synthetic classification, syntax, limits,
  spans, windowing, byte preservation, first-observation races, manual
  replacement, conditional publication, non-correlation, fail-closed, and
  no-leak tests.
- `packages/local-runtime/src/**` only for authenticated manually sanitized
  replacement preview/decision, non-dumpable protected-worker supervision, and
  dependency wiring through existing ingestion services.
- `packages/local-runtime/test/**` for replacement actor/binding and
  secret-safe route/CLI tests.
- Do not modify source traversal/manifests, model installation/sandboxing,
  commitment cryptography/posture, ordinary evidence storage, scheduler
  terminality, general PII policy, provider/OCR behavior, resident prompts,
  ontology truth, UI, PRR, legal, export, publication, or destructive
  operations.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/15-resident-source-boundary.md`
- `docs/agentic/specifications/16-secret-commitment-backend.md`
- `docs/agentic/specifications/17-pinned-lfm-installation-runtime.md`
- `packages/ingestion/src/runtime.ts`
- `packages/ingestion/src/local-filesystem.ts`
- `packages/ingestion/src/mount-contract.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`
- `packages/local-runtime/src/runtime-factory.ts`

## Risk Lane

Red. This slice handles synthetic representations of credential-bearing source
content and permits automatic eligibility after an exact import approval.
Manual sanitized-replacement acceptance remains an authenticated human action;
build verification may process only synthetic fixtures and fake workers.

## Targeted Verification

- `npm test -- packages/ingestion/test/protected-source-classification.test.ts packages/ingestion/test/protected-env-redaction.test.ts packages/ingestion/test/protected-jwk-redaction.test.ts packages/ingestion/test/protected-redaction-worker.test.ts packages/ingestion/test/protected-derivative-eligibility.test.ts`
- `npm test -- packages/local-runtime/test/protected-sanitized-replacement.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves the exact protected-file
allowlist, complete `.env` value redaction, exact private JWK/JWKS handling,
credential-label-only LFM union, syntax/byte preservation, immutable snapshot
binding, two-pass fail-closed validation, derivative-only eligibility,
metadata-only quarantine, replacement authority, and zero real secret/live
effects.

## Integration Verification

Build only after Specifications 16 and 17 are integrated. Update the candidate
normally against latest `neo`, obtain a fresh Sol `ship` verdict on the final
diff, then run `npm run verify` once on the final merged candidate. Compare with
the current recorded baseline and latest `neo` CI; reject any new or worsened
failure. Integrate with normal Git history, push only configured `origin`,
observe CI, do not open a pull request, and do not force-push. Live source
processing and manually sanitized replacement acceptance remain separate
human-gated actions.

## Escalation Conditions

Escalate for another protected file type or PII class, best-effort handling of
ambiguous syntax, a higher protected-input limit, retaining any raw source,
plain/correlatable source hashes, confidence-based credential bypass, an
override for failed validation, evidence admission without exact import
approval, model/provider transfer, real secret/source access during build,
unavailable required parser/worker behavior, or the same concrete failure
surviving two focused repair attempts.
