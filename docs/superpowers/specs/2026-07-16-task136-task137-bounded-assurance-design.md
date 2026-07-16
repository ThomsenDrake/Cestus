# Task136/Task137 Bounded Assurance Design

**Date:** 2026-07-16
**Status:** Approved coordinator reset design
**Authority:** `RV-1-E-545` in
`docs/agentic/resident-agent-full-vision-program-registry.md`

## Purpose

Task136 and Task137 protect important resident-agent composition and mounted
workspace boundaries, but their acceptance contracts became open-ended.
Mutable recovery lineage was copied into several documents, executable checks
grew inside Markdown, and Task137 review evolved into an unbounded source-flow
analysis exercise. This design replaces those moving targets with finite,
versioned assurance contracts.

The reset preserves Cestus's append-only ledger, provenance, projection
rebuildability, mounted-workspace currentness, lifecycle, human authority, and
portable-workspace invariants. It changes how implementation evidence is
bounded and reviewed; it does not weaken runtime behavior.

## Considered Approaches

### 1. Finite contracts plus coarse source policy - selected

Move executable assurance out of mutable plan prose, define one lineage
authority, freeze versioned grammars and mutation corpora, and prohibit
unneeded production loading/evaluator forms. This is deterministic, reviewable,
and strong enough for the actual Cestus module boundary.

### 2. Continue expanding the current analyzers - rejected

This could model more JavaScript forms, but every additional alias, binding,
reassignment, evaluator, or loader form creates another acceptance dimension.
It has no natural completion condition and is not a product capability Cestus
needs.

### 3. Rely only on package exports and human review - rejected

Package exports are necessary but do not check direct source imports, role
swaps, accidental re-exports, or the release graph. Human review alone is not a
repeatable admission gate.

## Authority And Versioning

### Recovery lineage

The program registry is the sole authority for mutable recovery history,
candidate revisions, review verdicts, integration revisions, and task status.
Task claims may record immutable evidence for their own candidate and must
point to the governing registry event. Active implementation plans contain only
stable contract IDs and the registry path; they must not repeat recovery
numbers, rejected revisions, reviewer-session details, or mutable status.

Historical prose remains append-only evidence. A new bounded section may
supersede it, but old records are not rewritten into apparent approval.

### Frozen contract IDs

- Task136 module grammar: `task136-composition-grammar.v1`
- Task136 mutation corpus: `task136-composition-corpus.v1`
- Task136 release graph: `task136-release-graph.v1`
- Task137 import grammar: `task137-authority-import-grammar.v1`
- Task137 mutation corpus: `task137-authority-import-corpus.v1`
- Task137 terminal gate: `task137-terminal-gate.v2`

A corpus or grammar changes only through a new version and a coordinator-
approved contract revision. A reviewer finding outside the active version is
recorded as proposed hardening and is not a release blocker.

## Task136 Contract

### Release graph

`task136-release-graph.v1` contains the existing 28 topologically ordered
release cards. Each static card has exactly these fields:

```text
id
prerequisiteIds[]
ownedPaths[] { disposition, path }
transferToIds[]
command
```

Allowed dispositions are `owned` and `transferred`. Mutable release records in
the program registry bind each card to candidate, two exact-revision reviews,
integration, release event, and owned-path blob SHAs. Every SHA is lowercase
hex, both reviews bind the candidate and say unqualified `APPROVED`, every
prerequisite release precedes the consumer candidate, transfer ownership is
explicit, and every owned blob is unchanged at its required checkpoints. The
checker combines one static graph with one registry authority. It does not
infer status from copied plan prose.

The success marker is:

```text
TASK136_RELEASE_GRAPH_OK records=28
```

### Composition module grammar

`task136-composition-grammar.v1` is a manifest grammar, not a general
TypeScript parser. A fixture module has:

```ts
interface Task136FixtureModuleV1 {
  readonly id: string;
  readonly path: string;
  readonly template: "types" | "factory" | "adapter" | "registry" | "composition";
  readonly imports: readonly {
    readonly from: string;
    readonly names: readonly string[];
    readonly typeOnly: boolean;
  }[];
  readonly exports: readonly string[];
}
```

The generator alone turns this manifest into fixture source. Generated modules
use direct relative `.js` ESM imports, named value or type imports, declarations
provided by one of the five templates, and explicit named exports. Default
imports, namespace imports, re-exports, dynamic imports, CommonJS loading,
evaluators, arbitrary source fragments, and caller-supplied templates are not
part of the grammar.

The frozen corpus has one accepted fixture and 20 rejected single-fact
mutations. The rejected categories are: unknown node; duplicate node; reordered
node; missing prerequisite; dependency inversion; undeclared transfer;
overlapping final owner; missing owned path; extra owned path; wrong path
disposition; noncanonical module path; unsupported template; unknown import;
wrong import kind; missing export; extra export; default import; namespace
import; dynamic/CommonJS loader; and fixture source outside the generator.

The success marker is:

```text
TASK136_COMPOSITION_CORPUS_OK green=1 red=20
```

The existing command-card and ABI checks remain finite with these markers:

```text
TASK136_COMMAND_CARDS_OK cards=28
TASK136_ABI_CORPUS_OK green=1 red=15
```

No Task136 review may add a twenty-first blocking mutation to v1.

## Task137 Contract

### Production-source finding

The current production tree contains no required use of `eval`, the `Function`
constructor, `createRequire`, direct CommonJS loading, or dynamic loading of a
protected mounted-authority module. Two unrelated dynamic imports are required
and are exact exemptions:

```text
packages/ingestion/src/cli-runner.ts -> await import("./index.js")
packages/workspace-ops/src/node-runner.ts -> await import("node:sqlite")
```

Task137 therefore uses a coarse source policy instead of modeling evaluator or
loader value flow.

### Coarse production policy

Across `packages/**/src/**/*.{ts,tsx,mts,cts}`:

- Identifiers named `eval` or `Function` are prohibited.
- Direct `require(...)`, `module.require(...)`, TypeScript `import = require`,
  and imports or calls of `createRequire` are prohibited.
- Dynamic `import(...)` is prohibited except for the two exact file,
  specifier, syntax, and occurrence exemptions above.
- Protected mounted-authority modules may be consumed only through the finite
  static ESM grammar below.

This policy intentionally does not trace aliases, assignments, closures,
bindings, or arbitrary computed expressions. Cestus is enforcing its own
production source convention, not implementing a JavaScript sandbox or
whole-program analyzer.

### Static authority import grammar

`task137-authority-import-grammar.v1` permits only direct, unaliased, named ESM
imports in these roles:

| Owner module | Imported module | Permitted names |
| --- | --- | --- |
| `mounted-artifact-authority-operation.ts` | `portable-workspace-lifecycle.js` | `assertPortableWorkspaceLifecyclePortsForMountedArtifactAuthority`, `inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority`, `PortableWorkspaceLifecyclePorts`, `PortableWorkspaceMountedFacts` |
| `mounted-artifact-authority-operation.ts` | `runtime-factory.js` | `captureFactoryIssuedMountedRuntime`, `inspectFactoryIssuedMountedRuntimeCapture`, `FactoryIssuedMountedRuntimeCapture`, `FactoryIssuedMountedRuntimeSourceHighWater`, `FactoryIssuedMountedWorkspaceSnapshot`, `LocalRuntimeHandle` |
| `wake-supervisor-runtime.ts` | `mounted-artifact-authority-operation.js` | `registerMountedArtifactAuthorityIssuerForWakeRuntime` |
| `agent-runtime-factory.ts` | `mounted-artifact-authority-operation.js` | `issueMountedArtifactAuthorityOperationForFactory` |
| `portable-mounted-agent-artifact-stores.ts` | `mounted-artifact-authority-operation.js` | `inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores`, `MountedArtifactAuthorityOperation`, `PortableMountedArtifactAuthorityOperationInspection` |

Value/type position must match the declaration. Aliases, default imports,
namespace imports, import queries, re-exports, barrels, package subpath exports,
and imports from any other owner module are rejected. The root and package
manifests may not export a protected module or protected symbol.

### Frozen Task137 corpus

The v1 corpus has eight allowed fixtures: the five role imports above, an
unrelated static import, a harmless comment/string containing a protected file
name, and the two exact dynamic-import exemptions counted as one exemption
fixture.

It has 20 rejected fixtures: unauthorized owner; wrong role symbol; wrong
protected module; alias; default import; namespace import; named re-export;
star re-export; import query; unauthorized type import; protected literal
dynamic import; computed dynamic import; extra dynamic-import occurrence;
direct `require`; `module.require`; `import = require`; direct `createRequire`;
aliased `createRequire`; `eval` identifier; and `Function` identifier.

The success marker is:

```text
TASK137_POLICY_CORPUS_OK allowed=8 rejected=20
```

The checker must terminate within 10 seconds for the repository and within two
seconds for each isolated fixture. Timeout is failure, not skipped evidence.

## Terminal Gate

The Task137 gate is a committed executable file, not a Markdown block piped to
a shell. It runs by pathname with standard input attached to `/dev/null`, and
each child command also receives `/dev/null`.

It emits these six stage markers exactly once and in order:

```text
TASK137_GATE_STAGE_OK tests
TASK137_GATE_STAGE_OK typecheck
TASK137_GATE_STAGE_OK source-policy
TASK137_GATE_STAGE_OK package-boundary
TASK137_GATE_STAGE_OK factory-readiness
TASK137_GATE_STAGE_OK checkout
```

Only after all six stages does it emit:

```text
TASK137_GATE_COMPLETE stages=6
```

Exit 0 without all seven markers is failure. A regression test must prove the
old standard-input form stops before later stages and the committed script
reaches every stage with controlled command doubles. Coordinator admission
also runs the real script, checks marker order/count, and rejects dirty or
linked checkouts.

## Review Contract

Every implementation candidate receives two fresh, read-only, exact-revision
reviews:

1. Architecture and invariant review.
2. Executability, finite-scope, and command review.

Reviewers run the frozen corpus and inspect all contract categories. A new
form is blocking only when it is inside the supported grammar or proves an
explicit prohibition ineffective. Other findings are recorded as proposed
hardening with a suggested next contract version. Reviewers cannot expand the
active acceptance scope, edit the candidate, or require another Recovery-N
round.

Both reviews must return unqualified `APPROVED`. Integration is into the
program branch only. Task139 remains blocked until Task136 is integrated and
both the corrected Task137 gate and Task137 candidate are integrated.

## Failure And Safety Behavior

- A malformed contract, missing marker, timeout, dirty checkout, dependency
  link, stale revision, or corpus count mismatch fails closed.
- No gate writes to the portable ontology, calls a provider, uses credentials,
  or invokes an external service.
- No reset action merges, pushes, runs full verification, or touches `neo`
  until separately authorized by the program coordinator.
- Existing branches and forensic records remain preserved throughout the
  reset.

## Acceptance

This design is satisfied when the versioned contracts are machine-readable,
the finite RED/GREEN corpora pass with exact counts, the terminal gate proves
all stages, two fresh reviewers approve each exact candidate without expanding
scope, Task136 and Task137 integrate into the program branch in dependency
order, and Task139 resumes only after its required release record is valid.
