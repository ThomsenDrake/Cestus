# Resident Agent Full-Vision CF-1 Contract Freeze

## Decision, Scope, And Dispatch Rule

This is the sole shared-contract decision for Waves 1–5 of the resident-agent
full-vision program. It consumes the approved Wave 0B plans (Tasks 109–116)
and resolves their pre-freeze proposals without granting production authority.
The governing sources are:

- `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@c7dc10b9dd351fc76df083df8f2222252ba73d89`
- `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`

CF-1 itself authorizes no production, provider, credential, Nous, browser,
tailnet, desktop, or live validation. A Wave 1–5 worker is non-dispatchable
until all of these facts exist in the append-only registry: a different fresh
reviewer approves this exact author commit; Relay A integrates that approved
commit; and the worker records the resulting full 40-character coordinator
integration SHA as `CF1-INTEGRATION-SHA` in its claim. The pre-freeze source
lock is `c996b197bde35aecff3be5120b654e7cc761f145`; it is evidence of the
complete Wave 0B input, never a substitute for `CF1-INTEGRATION-SHA`.

Only the Coordinator CF-1 contract task may add or version a shared event,
shared DTO, or shared capability row below. Later lanes may implement the
frozen rows but may not rename, widen, duplicate, or claim their ownership.
R is the only default runtime-factory writer. P is the only shared
provider-configuration writer. Existing gateway owners retain their own
approval/tool event lifecycles; no lane may replace them.

## Frozen Binding Matrix

Every row is a single atomic binding. The source/binding column is mandatory
provenance, not explanatory text. `none` approval means no new effect may be
invented; an existing gateway class remains independently enforced.

<!-- CF1-MATRIX-START -->
| ID | Frozen event or fact | DTO or capability key | Sole production file / owner | Consumers | Required source-event or authority binding | Approval class | Idempotency key | Targeted command | Merge and rebase gate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CF1-L-PLAN | `agent.resident-plan.recorded.v1` | `ResidentPlanRecord.v1` | `packages/agent/src/plan-observation-contracts.ts` / L | 120,136,R,U,A | exact task/attempt/run, descriptor hash, context/source hashes, authority, policy and causation | none; later gateway remains independent | task+attempt+run+plan-revision+policy-hash | `npm test -- packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts` | 120 merges before 132,133,136,140; all consumers rebase `CF1-INTEGRATION-SHA` |
| CF1-L-OBS | `agent.resident-observation.recorded.v1` | `ResidentObservationRecord.v1` | `packages/agent/src/plan-observation-contracts.ts` / L | 120,136,H,A | exact readback `planRecordEventId`, same authority, budget, source/context and causation | none | plan-record-event+observation-ordinal+category | `npm test -- packages/agent/test/plan-observation-projection.test.ts packages/agent/test/bounded-agent-loop.test.ts` | 120 before 136; rebase to 120 merge and `CF1-INTEGRATION-SHA` |
| CF1-L-STEP | `agent.resident-tool-step.recorded.v1` | `ResidentToolStepRecord.v1` | `packages/agent/src/plan-observation-contracts.ts` / L | 136,H,P,A | exact plan readback plus gateway request/event IDs, tool/version, preview, budget and authority | existing exact gateway class only | plan-record-event+step-ordinal+tool-id+tool-version+preview-hash | `npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/execution-loop.test.ts` | 120 and gateway compatibility before 136; rebase recorded predecessors |
| CF1-L-RESULT | `agent.resident-loop.suspended.v1` and `agent.resident-loop.result.recorded.v1` | `ResidentLoopTerminalOrResumableResult.v1` | `packages/agent/src/bounded-agent-loop.ts` / L | 136,H,W,U,A | exact plan and final observation; H recorded handoff for completed path; W authority for resumable path | gateway class carried from step; no self-approval | run+plan-record-event+final-observation-event+outcome-category | `npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/execution-loop.test.ts` | 136 consumes 120,124,126-130 and rebases all merged SHAs |
| CF1-T-REQUEST | `agent.trigger.requested.v1` | `ResidentTriggerDescriptor.v1`, `TriggerDecision.v1`, `TriggerSourceRef.v1` | `packages/agent/src/proactive-triggers.ts` / T | 149,150,151,L,W,H,A | exact mounted identity, policy artifact, sorted source events, reconstructed admission scope and high-water | none; a request is never approval | request-fingerprint -> deterministic request-id, dedupe-key and trigger-gate-key | `npm test -- packages/agent/test/proactive-triggers.test.ts packages/agent/test/prr-proactive-trigger.test.ts` | T consumer work rebases CF1, then 149-151 rebase T merge |
| CF1-W-AUTHORITY | durable authority facts only; no synthetic outage event | `WorkspaceAvailabilityAuthority.v1`, `WorkspaceAvailabilityDto.v1`, `WorkspaceUnavailableResult.v1` | `packages/local-runtime/src/portable-workspace-lifecycle.ts` / W | 125,132,135,137,R,H,L,T,U,A | workspace ID, mount instance, identity event, ledger high-water, policy/lock/store readback | none | authority evidence hash+operation+mount instance; stale token never revalidates | `npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts` | 125 before 132,135,137; dependents rebase 125 SHA and `CF1-INTEGRATION-SHA` |
| CF1-W-LIFECYCLE | `agent.wake.supervisor.lease.claimed.v1`, `agent.wake.supervisor.pause.requested.v1`, `agent.wake.supervisor.paused.v1`, `agent.wake.supervisor.resume.requested.v1`, `agent.wake.supervisor.recovery.verified.v1`, `agent.wake.supervisor.degraded.v1`, `agent.wake.supervisor.unrecoverable.v1` | `WakeStatusDto.v1`, `WakeSupervisorCommandResultDto.v1`, `WakeLifecycleEvidenceDto.v1` | `packages/agent/src/wake-supervisor.ts` / W | 124,137,141,U,R,A | resident `agent_default`, workspace, epoch, policy, identity, high-water, lock, causation and exact readback | local supervision command only; it never grants effect approval | workspace+epoch+transition+causation; coalesced wake source key | `npm test -- packages/agent/test/wake-supervisor.test.ts packages/agent/test/scheduler.test.ts` | 124 before 134,137,141; all consumers rebase 124 SHA |
| CF1-H-HANDOFF | existing `agent.specialist-run.step.recorded` final-output, `agent.specialist-handoff.prepared`, `agent.specialist-handoff.recorded`, `agent.specialist-run.completed`, `agent.task.orchestration.completed`, `agent.task.status.changed` | `HandoffReadback.v1`, `SpecialistHandoffProjection.v1`, `ResidentHandoffDto.v1` | H owns manifest/projection semantics in `packages/agent/src/specialist-handoff-projection.ts` | 121,122,123,135,138,U,L,A | material readback -> final-output -> manifest readback -> prepared -> recorded -> terminal run -> task status causation chain | workflow review or existing effect gate only; no completion approval | final-output key plus exact material/manifest hashes and run/task/type | `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts` | 121-123 before 134,135,138; 135 before 138; U waits for routes |
| CF1-P-POSTURE | `agent.provider.feasibility.observed.v1` and append-only superseding feasibility evidence | `ProviderCapability.v2`, `ProviderFeasibilityRecord.v1`, `CredentialReference.v2`, `OsSecretResolution.v1` | P provider files / P | 126-130,133,136,139,R,U,A | exact workspace/mount/run/provider/model/capability/ref/policy/source event binding | none for feasibility; no secret resolution without exact use | capability-hash+provider+model+ref+policy+mount+observed-category | `npm test -- packages/agent/test/byok-provider.test.ts packages/agent/test/secret-store.test.ts packages/agent/test/provider-readiness.test.ts` | 126-130 before 133,136,139; consumers rebase each required P merge |
| CF1-P-TRANSFER | existing `provider-byte-transfer` gateway event family only | `VerifiedProviderPosture.v1`, exact transfer preview | existing approval gateway / existing gateway owner; P consumes | P,R,L,H,A | independent human, preview hash, task/attempt/run, provider/model/ref, prompt/context/source hashes, policy, lock and budget | `provider-byte-transfer` | exact preview-hash+run+provider+model+capability+ref | `npm test -- packages/agent/test/provider-readiness.test.ts packages/agent/test/prompt-artifacts.test.ts` | P/R/L rebase relevant provider and prompt predecessors; no lane redefines gateway |
| CF1-R-CONTEXT | no new event; verified context remains provenance-bound | `MountedContextCapability.v1`, `VerifiedContextBindingSet.v1` | `packages/local-runtime/src/agent-runtime-context-packs.ts` / R | 132,133,134,136,140,H,A | workspace/mount, descriptor/version/hash, parser/producer identity, source projection and policy | none | run+pack-id+version+descriptor-hash+source-high-water | `npm test -- packages/local-runtime/test/agent-runtime-context-packs.test.ts packages/agent/test/context-packs.test.ts` | 132 after 120 and125; R records rebase of both SHAs |
| CF1-R-PROMPT | no new event; prompt artifact remains the provider boundary | `ProductionPromptCapability.v1`, `PromptArtifactEnvelope` | `packages/local-runtime/src/agent-runtime-prompt-renderer.ts` / R | 133,P,L,H,A | exact task/attempt/run, descriptor, verified contexts, provider posture, policy and renderer/template hashes | `provider-byte-transfer` when remote | run+template-version+renderer-hash+context-hashes+provider-posture-hash | `npm test -- packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts packages/agent/test/prompt-artifacts.test.ts` | 133 after 120 and126-130; rebase all required P/L SHAs |
| CF1-R-RUNNERS | no new event; runner dispatch reads frozen lifecycle | `ProductionSpecialistRunnerCapability.v1`, `SpecialistRunnerRegistrationBinding.v1` | `packages/local-runtime/src/agent-runtime-specialist-runners.ts` / R | 134,140,H,L,A | exact agent/task/attempt/run, descriptor, context, prompt, provider, approval, locks and handoff schema | existing workflow/gateway classes only | run+runner-id+runner-version+descriptor-hash+handoff-schema | `npm test -- packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/agent/test/specialist-runner-kernel.test.ts` | 134 after 121-124; rebase all workflow and wake SHAs |
| CF1-R-STORES | no new event; mounted receipts require exact readback | `MountedAgentArtifactStores.v1`, material and manifest readbacks | `packages/local-runtime/src/mounted-agent-artifact-stores.ts` / R | 135,138,140,H,A | same workspace/mount authority; material hash before final output; manifest hash before recorded | none | material-hash+authority-hash and manifest-hash+material-hash+authority-hash | `npm test -- packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/agent/test/specialist-handoff-projection.test.ts` | 135 after 121-123 and125; 138 and140 rebase 135 SHA |
| CF1-R-FACTORY | no new shared event; one composition boundary | `ProductionAgentRuntimeCompositionInput.v1`, `ProductionRuntimeReadiness.v1` | `packages/local-runtime/src/agent-runtime-factory.ts` / R only | 140,U,A | one verified mounted authority plus frozen context, prompt, provider, runner, store, handoff, approval and workflow capabilities | no new approval; consumes current classes | composition-version+workspace+mount+policy+component binding hashes | `npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts` | 140 after 132-139; rebase every predecessor SHA |
| CF1-P-CONFIG | no new shared event beyond P feasibility evidence | `ProviderCapabilityRegistry.v1`, `ProviderPolicyCapability.v1` | `packages/local-runtime/src/agent-provider-configuration.ts` / P only | 139,140,U,A | merged P capability/ref/feasibility records and exact prompt policy binding | existing provider-byte-transfer only | registry-version+capability-hash+policy-version+mount | `npm test -- packages/local-runtime/test/agent-provider-configuration.test.ts packages/agent/test/provider-registry.test.ts` | 139 after 126-130 and133; 140 rebase 139 SHA |
| CF1-U-BROWSER | no new canonical event; routes project only frozen readback | `ResidentRuntimeDto.v1`, `ResidentHandoffDto.v1`, `WakeStatusDto.v1` | `packages/ui/src/agent/resident-runtime-adapter.ts` / U | 131,141,A | exact run/task association, schema version, safe provenance, route producer and readback IDs | local supported command policy only; browser never approves or effects | dto-schema-version+run-id+task-id+projection-event-set | `npm test -- packages/ui/test/resident-runtime-adapter.test.ts packages/ui/test/agent-adapter.test.ts` | 131 before 141; U rebases merged routes and DTO producer SHAs |
| CF1-A-EVIDENCE | no canonical production event; acceptance evidence is safe report only | `ResidentAcceptanceEvidence.v1`, safe command identity and retry posture | A-owned test fixtures and acceptance report / A | A-01 through A-10, Coordinator | exact producer test evidence, safe IDs/hashes/counts/categories, served SHA or live marker where applicable | coordinator-only live Nous; deterministic tests credential-free | acceptance-id+producer-SHA+command-identity+evidence-hash | `npm test -- packages/agent/test/resident-acceptance-adversarial.test.ts` | A runs after producers; defects route to owner and A never patches production |
<!-- CF1-MATRIX-END -->

## Exclusive File Ownership And Wave Dispatch Matrix

The paths in this table are exclusive for their named task. A task may consume
the bindings above but cannot create a second writer for a frozen file or
contract. `CF1-INTEGRATION-SHA` means the exact full Relay A integration SHA,
not this author branch commit.

<!-- CF1-OWNERSHIP-START -->
| ID | Wave task and exclusive files | Owner | Frozen contracts consumed | Required source binding | Approval posture | Idempotency binding | Targeted command | Required predecessor rebase | Cross-lane command |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W1-120 | `packages/agent/src/plan-observation-contracts.ts`, `packages/agent/src/plan-observation-projection.ts`, `packages/agent/test/plan-observation-contracts.test.ts`, `packages/agent/test/plan-observation-projection.test.ts` | L | CF1-L-PLAN through CF1-L-RESULT | task/attempt/run plus source/context/authority | none | plan/observation event keys | `npm test -- packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts` | `CF1-INTEGRATION-SHA` | rerun 120 command after CF1 rebase |
| W1-121 | `packages/agent/src/prr-negotiation-workflow.ts`, `packages/agent/test/prr-negotiation-workflow.test.ts` | H | CF1-H-HANDOFF | PRR request/correspondence/context/draft source events | review or existing gateway only | H final-output/manifest keys | `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts` | `CF1-INTEGRATION-SHA` | rerun handoff projection after merge |
| W1-122 | `packages/agent/src/investigation-planner-workflow.ts`, `packages/agent/test/investigation-planner-workflow.test.ts` | H | CF1-H-HANDOFF | investigation/evidence/context/artifact event binding | none; advisory only | H final-output/manifest keys | `npm test -- packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts` | `CF1-INTEGRATION-SHA` | rerun handoff projection after merge |
| W1-123 | `packages/agent/src/ontology-bootstrap-workflow.ts`, `packages/agent/test/ontology-bootstrap-workflow.test.ts` | H | CF1-H-HANDOFF | staging report/candidate/evidence/content-hash/source binding | review only; proposal-only | H final-output/manifest keys | `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts` | `CF1-INTEGRATION-SHA` | rerun handoff projection after merge |
| W1-124 | `packages/agent/src/wake-supervisor.ts`, `packages/agent/test/wake-supervisor.test.ts` | W | CF1-W-LIFECYCLE | workspace/epoch/lease/policy/high-water/lock evidence | local supervision route only | lifecycle transition key | `npm test -- packages/agent/test/wake-supervisor.test.ts packages/agent/test/scheduler.test.ts` | `CF1-INTEGRATION-SHA` | rerun wake command before 134,137,141 review |
| W1-125 | `packages/local-runtime/src/portable-workspace-lifecycle.ts`, lifecycle test | W | CF1-W-AUTHORITY | identity event/mount/high-water/store/policy/lock | none | authority evidence hash+operation | `npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts` | `CF1-INTEGRATION-SHA` | rerun lifecycle command before 132,135,137 review |
| W1-126 | `packages/agent/src/byok-provider.ts`, `packages/agent/test/byok-provider.test.ts` | P | CF1-P-POSTURE | capability/ref/policy/mount/run binding | provider-byte-transfer when remote | capability+ref+policy feasibility key | `npm test -- packages/agent/test/byok-provider.test.ts packages/agent/test/openai-compatible-provider.test.ts` | `CF1-INTEGRATION-SHA` | rerun provider readiness before 133,136,139 |
| W1-127 | `packages/agent/src/os-secret-store.ts`, `packages/agent/test/os-secret-store.test.ts` | P | CF1-P-POSTURE | exact typed ref/capability/mount/run use | none; secret material is not durable | ref+capability+run exact-use key | `npm test -- packages/agent/test/os-secret-store.test.ts packages/agent/test/secret-store.test.ts` | `CF1-INTEGRATION-SHA` | rerun secret-store command before provider consumers |
| W1-128 | `packages/agent/src/local-model-provider.ts`, `packages/agent/test/local-model-provider.test.ts` | P | CF1-P-POSTURE | selected local capability/policy/budget/mount binding | local policy only; no fallback | capability+model+policy+mount key | `npm test -- packages/agent/test/local-model-provider.test.ts packages/agent/test/provider-readiness.test.ts` | `CF1-INTEGRATION-SHA` | rerun provider readiness before 133,136,139 |
| W1-129 | `packages/agent/src/codex-subscription-harness.ts`, `packages/agent/test/codex-subscription-harness.test.ts` | P | CF1-P-POSTURE | official-flow feasibility evidence only | official harness policy; no token extraction | provider+official-flow+policy+mount feasibility key | `npm test -- packages/agent/test/codex-subscription-harness.test.ts` | `CF1-INTEGRATION-SHA` | rerun harness command before 133,136,139 |
| W1-130 | `packages/agent/src/xai-subscription-harness.ts`, `packages/agent/test/xai-subscription-harness.test.ts` | P | CF1-P-POSTURE | official-flow feasibility evidence only | official harness policy; no token extraction | provider+official-flow+policy+mount feasibility key | `npm test -- packages/agent/test/xai-subscription-harness.test.ts` | `CF1-INTEGRATION-SHA` | rerun harness command before 133,136,139 |
| W1-131 | `packages/ui/src/agent/resident-runtime-types.ts`, `packages/ui/src/agent/resident-runtime-adapter.ts`, `packages/ui/test/resident-runtime-adapter.test.ts` | U | CF1-U-BROWSER | exact route schema/run/task/provenance binding | supported local command policy only | dto-schema+run+task+event-set | `npm test -- packages/ui/test/resident-runtime-adapter.test.ts packages/ui/test/agent-adapter.test.ts` | `CF1-INTEGRATION-SHA` | rerun adapter command before 141 |
| W2-132 | `packages/local-runtime/src/agent-runtime-context-packs.ts`, `packages/local-runtime/test/agent-runtime-context-packs.test.ts` | R | CF1-R-CONTEXT, CF1-L-PLAN, CF1-W-AUTHORITY | verified descriptor/parser/source/mount binding | none | exact run+pack+source-high-water key | `npm test -- packages/local-runtime/test/agent-runtime-context-packs.test.ts packages/agent/test/context-packs.test.ts` | 120 and125 merged SHAs plus `CF1-INTEGRATION-SHA` | rerun command after each 120/125 rebase |
| W2-133 | `packages/local-runtime/src/agent-runtime-prompt-renderer.ts`, `packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts` | R | CF1-R-PROMPT, CF1-L-PLAN, CF1-P-POSTURE | exact run/context/provider/policy/template binding | provider-byte-transfer only at later consumption | prompt artifact hash binding | `npm test -- packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts packages/agent/test/prompt-artifacts.test.ts` | 120 and126-130 SHAs plus `CF1-INTEGRATION-SHA` | rerun command after all required P merges |
| W2-134 | `packages/local-runtime/src/agent-runtime-specialist-runners.ts`, `packages/local-runtime/test/agent-runtime-specialist-runners.test.ts` | R | CF1-R-RUNNERS, CF1-H-HANDOFF, CF1-W-LIFECYCLE | exact workflow/context/prompt/provider/authority/lock binding | frozen gateway class only | run+runner+descriptor+handoff schema key | `npm test -- packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/agent/test/specialist-runner-kernel.test.ts` | 121-124 SHAs plus `CF1-INTEGRATION-SHA` | rerun command after each workflow/wake rebase |
| W2-135 | `packages/local-runtime/src/mounted-agent-artifact-stores.ts`, `packages/local-runtime/test/mounted-agent-artifact-stores.test.ts` | R | CF1-R-STORES, CF1-H-HANDOFF, CF1-W-AUTHORITY | material then manifest exact mounted readbacks | none | material/manifest/authority hash keys | `npm test -- packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/agent/test/specialist-handoff-projection.test.ts` | 121-123 and125 SHAs plus `CF1-INTEGRATION-SHA` | rerun command before 138 and140 |
| W2-136 | `packages/agent/src/bounded-agent-loop.ts`, `packages/agent/test/bounded-agent-loop.test.ts` | L | CF1-L-PLAN through CF1-L-RESULT, CF1-W-AUTHORITY, CF1-P-POSTURE | exact plan readback, gateway, budget, provider and handoff binding | exact gateway class only | plan+step+preview+budget key | `npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/execution-loop.test.ts` | 120,124,126-130 SHAs plus `CF1-INTEGRATION-SHA` | rerun command after all predecessor rebases |
| W2-137 | `packages/local-runtime/src/wake-supervisor-runtime.ts`, `packages/local-runtime/test/wake-supervisor-runtime.test.ts` | W | CF1-W-AUTHORITY, CF1-W-LIFECYCLE | mounted authority, lease, claim and lifecycle readback | local supervision command only | epoch+transition+causation key | `npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/agent/test/wake-supervisor.test.ts` | 124,125,132-135 SHAs plus `CF1-INTEGRATION-SHA` | rerun command after 132-135 merge/rebase |
| W2-138 | `packages/local-runtime/src/agent-handoff-projection.ts`, `packages/local-runtime/test/agent-handoff-projection.test.ts` | H | CF1-H-HANDOFF, CF1-R-STORES | exact manifest/material/ledger readback and run/task causation | none | recorded-event+manifest-hash+run key | `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts packages/agent/test/specialist-handoff-projection.test.ts` | 121-123 and135 SHAs plus `CF1-INTEGRATION-SHA` | rerun command after 135 merge |
| W2-139 | `packages/local-runtime/src/agent-provider-configuration.ts`, `packages/local-runtime/test/agent-provider-configuration.test.ts` | P | CF1-P-POSTURE, CF1-P-CONFIG, CF1-R-PROMPT | merged capability/ref/feasibility/prompt-policy binding | provider-byte-transfer only at consumption | registry+capability+policy+mount key | `npm test -- packages/local-runtime/test/agent-provider-configuration.test.ts packages/agent/test/provider-registry.test.ts` | 126-130 and133 SHAs plus `CF1-INTEGRATION-SHA` | rerun command before 140 |
| W2-140 | `packages/local-runtime/src/agent-runtime-factory.ts`, `packages/local-runtime/test/agent-runtime-composition.test.ts` | R only | CF1-R-FACTORY and all frozen capabilities | one verified mounted authority and exact component binding set | consumes existing classes; no factory self-approval | composition+mount+policy+component-hashes key | `npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts` | 132-139 SHAs plus `CF1-INTEGRATION-SHA` | rerun command after every required predecessor merge |
| W2-141 | `packages/local-runtime/src/agent-supervision-routes.ts`, `packages/ui/src/agent/ResidentSupervisionPanel.tsx`, `packages/ui/test/resident-supervision-panel.test.tsx`, `packages/local-runtime/test/agent-supervision-routes.test.ts` | U | CF1-U-BROWSER, CF1-W-LIFECYCLE, CF1-R-FACTORY | strict runtime route DTO and supported command evidence | supported local command policy only | dto+request-id+command+run/task binding | `npm test -- packages/ui/test/resident-supervision-panel.test.tsx packages/local-runtime/test/agent-supervision-routes.test.ts` | 131,137-140 SHAs plus `CF1-INTEGRATION-SHA` | rerun command after routes and factory merge |
| W3-142 | `packages/agent/src/evidence-triage-workflow.ts`, `packages/agent/test/evidence-triage-bounded-loop.test.ts` | Task142 vertical owner | CF1-L-RESULT, CF1-H-HANDOFF, CF1-P-POSTURE | evidence/context/source hashes and recorded handoff | coordinator-live Nous only if provider selected | workflow run+handoff material/manifest key | `npm test -- packages/agent/test/evidence-triage-bounded-loop.test.ts packages/agent/test/evidence-triage-workflow.test.ts` | 136 and140 readiness SHA plus `CF1-INTEGRATION-SHA` | rerun command and real Nous gate if selected |
| W3-143 | `packages/agent/src/ontology-bootstrap-workflow.ts`, `packages/agent/test/legacy-to-ontology-bootstrap.test.ts` | Task143 vertical owner | CF1-H-HANDOFF, CF1-L-RESULT | legacy staging/candidate/evidence/content-hash source binding | review only; proposal-only | run+candidate-set+material hash key | `npm test -- packages/agent/test/legacy-to-ontology-bootstrap.test.ts packages/agent/test/ontology-bootstrap-workflow.test.ts` | 136 and140 readiness SHA plus `CF1-INTEGRATION-SHA` | rerun command after handoff/factory rebase |
| W3-144 | `packages/agent/src/investigation-planner-workflow.ts`, `packages/agent/test/investigation-planner-bounded-loop.test.ts` | Task144 vertical owner | CF1-L-RESULT, CF1-H-HANDOFF | investigation/evidence/context/source event binding | none; advisory only | run+plan+material hash key | `npm test -- packages/agent/test/investigation-planner-bounded-loop.test.ts packages/agent/test/investigation-planner-workflow.test.ts` | 136 and140 readiness SHA plus `CF1-INTEGRATION-SHA` | rerun command after handoff/factory rebase |
| W3-145 | `packages/agent/src/prr-negotiation-workflow.ts`, `packages/agent/test/prr-negotiation-draft-only.test.ts` | Task145 vertical owner | CF1-T-REQUEST, CF1-L-RESULT, CF1-H-HANDOFF | trigger/PRR/correspondence/draft source binding | review only; no send | request fingerprint+run+draft material hash key | `npm test -- packages/agent/test/prr-negotiation-draft-only.test.ts packages/agent/test/prr-negotiation-workflow.test.ts` | 136 and140 readiness SHA plus `CF1-INTEGRATION-SHA` | rerun command proving no send |
| W3-146 | `packages/agent/src/timeline-builder-workflow.ts`, `packages/agent/test/timeline-builder-workflow.test.ts` | Task146 vertical owner | CF1-L-RESULT, CF1-H-HANDOFF | sourced timeline/evidence/context binding | none; local draft only | run+source-set+material hash key | `npm test -- packages/agent/test/timeline-builder-workflow.test.ts` | 136 and140 readiness SHA plus `CF1-INTEGRATION-SHA` | rerun command after runtime rebase |
| W3-147 | `packages/agent/src/contradiction-finder-workflow.ts`, `packages/agent/test/contradiction-finder-workflow.test.ts` | Task147 vertical owner | CF1-L-RESULT, CF1-H-HANDOFF | source-bound advisory candidate binding | none; no accepted graph mutation | run+source-set+material hash key | `npm test -- packages/agent/test/contradiction-finder-workflow.test.ts` | 136 and140 readiness SHA plus `CF1-INTEGRATION-SHA` | rerun command after runtime rebase |
| W3-148 | `packages/agent/src/report-builder-workflow.ts`, `packages/agent/test/report-builder-draft-only.test.ts` | Task148 vertical owner | CF1-L-RESULT, CF1-H-HANDOFF | sourced report/context/artifact binding | none; no publication/export | run+source-set+material hash key | `npm test -- packages/agent/test/report-builder-draft-only.test.ts` | 136 and140 readiness SHA plus `CF1-INTEGRATION-SHA` | rerun command proving no export |
| W3-149 | `packages/agent/src/prr-proactive-trigger.ts`, `packages/agent/test/prr-proactive-trigger.test.ts` | T | CF1-T-REQUEST | exact PRR source events and admission scope | none; demand only | trigger fingerprint/dedupe/gate key | `npm test -- packages/agent/test/prr-proactive-trigger.test.ts packages/agent/test/proactive-triggers.test.ts` | T merge and140 readiness SHA plus `CF1-INTEGRATION-SHA` | rerun command proving no send |
| W3-150 | `packages/agent/src/ingestion-proactive-trigger.ts`, `packages/agent/test/ingestion-proactive-trigger.test.ts` | T | CF1-T-REQUEST | ingestion/evidence/readiness source event binding | none; demand only | trigger fingerprint/dedupe/gate key | `npm test -- packages/agent/test/ingestion-proactive-trigger.test.ts packages/agent/test/proactive-triggers.test.ts` | T merge and140 readiness SHA plus `CF1-INTEGRATION-SHA` | rerun command proving no parse/provider/graph effect |
| W3-151 | `packages/agent/src/investigation-proactive-trigger.ts`, `packages/agent/test/investigation-proactive-trigger.test.ts` | T | CF1-T-REQUEST | cadence/high-water/source projection binding | none; demand only | trigger fingerprint/dedupe/gate key | `npm test -- packages/agent/test/investigation-proactive-trigger.test.ts packages/agent/test/proactive-triggers.test.ts` | T merge and140 readiness SHA plus `CF1-INTEGRATION-SHA` | rerun command proving cooldown/budget/high-water |
| W3-152 | `packages/agent/src/memory-curation.ts`, `packages/agent/test/memory-curation.test.ts` | Task152 vertical owner | CF1-L-RESULT, CF1-H-HANDOFF | source-bound advisory memory binding | none; no ontology truth | run+source-set+material hash key | `npm test -- packages/agent/test/memory-curation.test.ts packages/agent/test/memory.test.ts` | 136 and140 readiness SHA plus `CF1-INTEGRATION-SHA` | rerun command after runtime rebase |
| W4-A01-A10 | `packages/local-runtime/test/fixtures/resident-acceptance-fixture.ts`, `packages/local-runtime/test/resident-acceptance-mounted-restart.test.ts`, `packages/local-runtime/test/resident-acceptance-disconnect-reconnect.test.ts`, `packages/agent/test/resident-acceptance-nous-and-legacy.test.ts`, `packages/agent/test/resident-acceptance-trigger-and-planning.test.ts`, `packages/agent/test/resident-acceptance-provider-feasibility.test.ts`, `packages/ui/test/resident-acceptance-cockpit-tailnet.test.tsx`, `packages/agent/test/resident-acceptance-adversarial.test.ts`, `packages/agent/test/fixtures/resident-acceptance-evidence.ts` | A | CF1-A-EVIDENCE and all producer contracts | exact producer command evidence, safe hashes/IDs and current served or live evidence | deterministic credential-free; coordinator-only Nous and served-checkout gates | acceptance-id+producer-SHA+command+evidence hash | `npm test -- packages/agent/test/resident-acceptance-adversarial.test.ts` | all relevant producer SHAs and `CF1-INTEGRATION-SHA` | rerun producer command then acceptance case; route defect to owner |
| W5-153 | `docs/agentic/resident-agent-full-vision-program-registry.md`, `docs/agentic/resident-agent-full-vision-acceptance-matrix.md`, `docs/agentic/claims/task-153-resident-full-vision-release-gate.md` | Coordinator release gate | CF1-A-EVIDENCE | recorded A-01 through A-10 verdicts, accepted repair SHAs, served SHA and durable evidence | coordinator-only Nous and deployment decision | acceptance-matrix ID+served SHA+evidence hash | `npm run verify` | every accepted Wave 1-4 integration SHA plus `CF1-INTEGRATION-SHA` | rebuild served checkout, run Nous smoke, then record release facts |
<!-- CF1-OWNERSHIP-END -->

## Merge, Rebase, And Recovery Protocol

1. The coordinator records the full `CF1-INTEGRATION-SHA` only after a
   different fresh reviewer approves this freeze and Relay A integrates it.
   Every Wave 1 worktree must fast-forward/rebase to that exact SHA before
   writing its first task artifact; an author SHA, a parent SHA, or `neo` is
   invalid.
2. After every contract-changing merge, the coordinator appends the producing
   SHA and makes each listed consumer rebase to it. The worker reruns the row's
   cross-lane command before fresh review. A stale consumer is non-dispatchable
   and cannot be approved by merely rerunning its own unit test.
3. Dependency order is fixed: 120 before 132/133/136/140; 121–123 before
   134/135/138; 124/125 before 137; 126–130 before 133/136/139; 132–139
   before 140; routes before 141; Wave 2 readiness before Wave 3; integrated
   A-01 through A-10 before Task153.
4. No worker self-merges, no worker changes another row's shared contract, and
   the coordinator never merges into `neo` without a new explicit user
   instruction. A shared-event change after this decision is a new CF-1
   revision with a fresh review, integration, and dependent rebase ledger.

## Section-Local Documentation Audit

Run this exact command from the repository root:

```bash
awk 'BEGIN { block = 0 } /^```bash$/ { block += 1; next } block == 2 && /^```$/ { exit } block == 2 { print }' docs/agentic/resident-agent-full-vision-contract-freeze.md | bash
```

```bash
node --input-type=module <<'NODE'
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const path = "docs/agentic/resident-agent-full-vision-contract-freeze.md";
const text = readFileSync(path, "utf8");
const expectedHash = "9d74e2cd2b10ea15ec2b758858260132badfa5b6d0e094e9ec5192ba17810681";
const matrixStart = "<!-- CF1-MATRIX-START -->";
const matrixEnd = "<!-- CF1-OWNERSHIP-END -->";
const start = text.indexOf(matrixStart);
const end = text.indexOf(matrixEnd);
const matrix = start >= 0 && end > start ? text.slice(start, end + matrixEnd.length) : "";
const rows = matrix.split("\n").filter((line) => /^\| (CF1-|W[1-5]-)/.test(line));
const requiredIds = new Set([
  "CF1-L-PLAN", "CF1-L-OBS", "CF1-L-STEP", "CF1-L-RESULT", "CF1-T-REQUEST", "CF1-W-AUTHORITY", "CF1-W-LIFECYCLE", "CF1-H-HANDOFF", "CF1-P-POSTURE", "CF1-P-TRANSFER", "CF1-R-CONTEXT", "CF1-R-PROMPT", "CF1-R-RUNNERS", "CF1-R-STORES", "CF1-R-FACTORY", "CF1-P-CONFIG", "CF1-U-BROWSER", "CF1-A-EVIDENCE",
  "W1-120", "W1-121", "W1-122", "W1-123", "W1-124", "W1-125", "W1-126", "W1-127", "W1-128", "W1-129", "W1-130", "W1-131", "W2-132", "W2-133", "W2-134", "W2-135", "W2-136", "W2-137", "W2-138", "W2-139", "W2-140", "W2-141", "W3-142", "W3-143", "W3-144", "W3-145", "W3-146", "W3-147", "W3-148", "W3-149", "W3-150", "W3-151", "W3-152", "W4-A01-A10", "W5-153"
]);

function rowCells(line) {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}
function validate(candidate) {
  const errors = [];
  const candidateStart = candidate.indexOf(matrixStart);
  const candidateEnd = candidate.indexOf(matrixEnd);
  const candidateMatrix = candidateStart >= 0 && candidateEnd > candidateStart
    ? candidate.slice(candidateStart, candidateEnd + matrixEnd.length)
    : "";
  const candidateRows = candidateMatrix.split("\n").filter((line) => /^\| (CF1-|W[1-5]-)/.test(line));
  const actualHash = createHash("sha256").update(candidateMatrix).digest("hex");
  if (actualHash !== expectedHash) errors.push("canonical matrix hash mismatch");
  const counts = new Map();
  for (const row of candidateRows) {
    const cells = rowCells(row);
    const [id, event, dto, fileOrOwner, consumers, source, approval, idempotency, test, rebase] = cells;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (cells.length !== 10 || cells.some((cell) => cell.length === 0)) errors.push(`${id ?? "unknown"}: incomplete binding row`);
    const owner = id?.startsWith("CF1-") ? fileOrOwner?.split("/").at(-1)?.trim() : fileOrOwner;
    if (!owner || owner.includes("+") || owner.includes(" / ") || owner === "Task142 vertical owner" && id !== "W3-142") errors.push(`${id ?? "unknown"}: non-dispatchable owner`);
    if (!event || !dto || !consumers || !source || !approval || !idempotency || !test || !rebase) errors.push(`${id ?? "unknown"}: missing governed field`);
  }
  for (const id of requiredIds) {
    if (counts.get(id) !== 1) errors.push(`${id}: missing or conflicting row`);
  }
  if (candidateRows.length !== requiredIds.size) errors.push("unexpected shared-contract or ownership row");
  if (!candidate.includes("R is the only default runtime-factory writer") || !candidate.includes("P is the only shared\nprovider-configuration writer") || !candidate.includes("Only the Coordinator CF-1 contract task may add or version a shared event")) {
    errors.push("exclusive shared-writer rule missing");
  }
  if (!candidate.includes("CF1-INTEGRATION-SHA") || !candidate.includes("full 40-character coordinator")) errors.push("required rebase SHA rule missing");
  return errors;
}

const initialErrors = validate(text);
if (initialErrors.length > 0) throw new Error(`freeze invalid: ${initialErrors.join("; ")}`);
let mutations = 0;
for (const row of rows) {
  const cells = rowCells(row);
  for (let cellIndex = 1; cellIndex < cells.length; cellIndex += 1) {
    const changed = [...cells];
    changed[cellIndex] = `counterfactual-${cellIndex}`;
    const replacement = `| ${changed.join(" | ")} |`;
    const candidate = text.replace(row, replacement);
    if (validate(candidate).length === 0) throw new Error(`audit escaped direct mutation of ${cells[0]} field ${cellIndex}`);
    mutations += 1;
  }
}
const firstRow = rows[0];
const missingOwner = text.replace(firstRow, firstRow.replace(" / L |", " /  |"));
const conflictingOwner = text.replace(firstRow, firstRow.replace(" / L |", " / L + P |"));
if (!validate(missingOwner).some((error) => error.includes("non-dispatchable owner"))) throw new Error("audit escaped missing owner");
if (!validate(conflictingOwner).some((error) => error.includes("non-dispatchable owner"))) throw new Error("audit escaped conflicting owner");
console.log(`GREEN: CF-1 matrix audit passed (${mutations + 2} direct counterfactual mutations rejected, including missing/conflicting ownership).`);
NODE
```

## CF-1 Non-Production Boundary

This freeze is ready only for a different fresh documentation review after its
author verification record is appended. It does not start Wave 1. Provider
selection, credential resolution, browser/tailnet inspection, Nous, and all
live checks remain prohibited until later task-specific authorizations and
their frozen acceptance gates.
