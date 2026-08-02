import { describe, expect, it } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto, buildRequestQueueRows, type RequestQueueRow } from "../../prr/src/read-api.js";
import { goldenPrrLedgerEvents } from "../../prr/test/fixtures/golden-prr-ledger.js";
import type { AgentStatusDto } from "../src/agent/agent-types.js";
import { runtimeUnavailableAgentStatus } from "../src/agent/agent-adapter.js";
import type { EvidenceWorkspaceDto } from "../src/evidence/evidence-types.js";
import { runtimeUnavailableStatus } from "../src/operator-status/operator-status-adapter.js";
import type { OperatorStatusDto } from "../src/operator-status/operator-status-types.js";
import type { OntologyWorkspaceDto } from "../src/ontology/ontology-types.js";
import { buildCommandBoardViewModel, filterQueueItems, getSelectedCommandItem } from "../src/workspace/command-model.js";
import {
  buildCommandBoardInputFromRuntime,
  type CommandIngestionRuntimeDto
} from "../src/workspace/command-runtime.js";
import { commandWorkspaceFixture } from "../src/workspace/command-fixtures.js";

describe("CommandBoardViewModel", () => {
  it("turns PRR projection rows into operator-friendly queue items", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const rows = buildRequestQueueRows(projection);

    const model = buildCommandBoardViewModel({
      requestRows: rows,
      diagnostics: projection.diagnostics,
      evidenceAlerts: [],
      todayIso: "2026-07-20",
      reviewedItemIds: []
    });

    expect(model.statusMetrics).toContainEqual({
      id: "open-requests",
      label: "Open requests",
      value: "9",
      tone: "cyan"
    });
    expect(model.statusMetrics).toContainEqual({
      id: "due-soon",
      label: "Due soon",
      value: "3",
      tone: "amber"
    });
    expect(model.queueItems).toContainEqual(expect.objectContaining({
      id: "deadline:prr_req_001",
      kind: "deadline",
      severity: "medium",
      title: "Example Agency response window",
      sourceLabel: "estimated deadline",
      actionLabel: "Review deadline"
    }));
  });

  it("prioritizes confirmed stalling before routine deadline items", () => {
    const rows: RequestQueueRow[] = [
      {
        prrRequestId: "prr_req_stalled",
        agencyName: "Stalled Agency",
        status: "awaitingProduction",
        deadlineDate: "2026-07-18",
        deadlineSource: "confirmed",
        possibleStalling: true,
        confirmedStalling: true,
        productionCount: 0
      },
      {
        prrRequestId: "prr_req_due",
        agencyName: "Due Agency",
        status: "sent",
        deadlineDate: "2026-07-21",
        deadlineSource: "estimated",
        possibleStalling: false,
        confirmedStalling: false,
        productionCount: 0
      }
    ];

    const model = buildCommandBoardViewModel({
      requestRows: rows,
      diagnostics: [],
      evidenceAlerts: [],
      todayIso: "2026-07-20",
      reviewedItemIds: []
    });

    expect(model.queueItems.map((item) => item.id)).toStrictEqual([
      "signal:prr_req_stalled",
      "deadline:prr_req_stalled",
      "deadline:prr_req_due"
    ]);
    expect(model.statusMetrics).toContainEqual({
      id: "stalled-signals",
      label: "Stalled signals",
      value: "1",
      tone: "red"
    });
  });

  it("filters queue items and returns selected detail without mutating the model", () => {
    const model = buildCommandBoardViewModel(commandWorkspaceFixture);

    expect(filterQueueItems(model.queueItems, "evidence").every((item) => item.kind === "evidence")).toBe(true);
    expect(filterQueueItems(model.queueItems, "all")).toHaveLength(model.queueItems.length);
    expect(getSelectedCommandItem(model, "evidence:ev_prr_production_003")?.detail.provenanceRefs).toStrictEqual([
      "ev_prr_production_003"
    ]);
    expect(getSelectedCommandItem(model, "missing")).toBeUndefined();
  });

  it("adds decision votes to the default rail and selected queue details", () => {
    const model = buildCommandBoardViewModel(commandWorkspaceFixture);
    const stalled = getSelectedCommandItem(model, "signal:prr_req_airport_022");

    expect(model.decisionRail.defaultVotes.map((vote) => [vote.id, vote.state])).toStrictEqual([
      ["legal-risk", "review"],
      ["factual-confidence", "watch"],
      ["cost-pressure", "review"]
    ]);

    expect(stalled?.detail.decisionVotes.map((vote) => [vote.id, vote.state])).toStrictEqual([
      ["legal-risk", "human-decision-required"],
      ["factual-confidence", "review"],
      ["cost-pressure", "watch"]
    ]);
    expect(stalled?.detail.provenanceRefs).toContain("prr_req_airport_022");
  });

  it("derives the AgentBrief from resident agent status when supplied", () => {
    const model = buildCommandBoardViewModel({
      ...commandWorkspaceFixture,
      agentStatus: agentStatus()
    });

    expect(model.agentBrief.watching).toContain("1 pending agent approval");
    expect(model.agentBrief.watching).toContain("1 active agent lock");
    expect(model.agentBrief.watching).toContain("1 provider backend: Fake Local Model Provider");
    expect(model.agentBrief.changedSinceReview).toContain("Review provider approval | evt_task_created");
    expect(model.agentBrief.uncertain).toContain("Lock lock_legal_escalation active from evt_lock_active");
    expect(model.agentBrief.recommendedActions).toContain(
      "Review toolreq_provider_preview approval for external-byte-transfer | evt_tool_requested"
    );
  });

  it("redacts credential-shaped strings from serialized AgentBrief fields", () => {
    const model = buildCommandBoardViewModel({
      ...commandWorkspaceFixture,
      agentStatus: agentStatus({
        providers: [
          {
            providerId: "provider_openai",
            label: "OpenAI sk-live-provider OPENAI_API_KEY DATABASE_PASSWORD GOOGLE_APPLICATION_CREDENTIALS",
            adapterVersion: "openai-adapter.v1",
            endpointKind: "openai-api",
            modelFamilies: ["gpt-4.1"],
            credentialKinds: ["api-key-bearer"],
            supportsStructuredOutput: true,
            supportsToolCalling: true,
            safeDataNotes: "Safe notes."
          }
        ],
        tasks: [
          {
            taskId: "task_sk_live_task",
            residentAgentId: "agent_default",
            title: "Review ghp_task, OPENAI_API_KEY, DATABASE_PASSWORD, and GOOGLE_APPLICATION_CREDENTIALS",
            requestedBy: "actor_case_owner",
            priority: "normal",
            status: "waiting-for-approval",
            createdAt: "2026-07-07T21:00:00.000Z",
            sourceEventIds: ["evt_DATABASE_PASSWORD"],
            inputArtifactHashes: [],
            eventIds: ["evt_GOOGLE_APPLICATION_CREDENTIALS"],
            causationIds: []
          }
        ],
        toolRequests: [
          {
            toolRequestId: "toolreq_ghp_request",
            runId: "run_provider_review",
            toolId: "provider.parse.preview",
            toolVersion: "1",
            requestedBy: "actor_cestus_agent",
            sideEffectClass: "external-byte-transfer",
            requiredApprovalClass: "provider-byte-transfer",
            previewHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
            scope: "workspace",
            estimatedEffect: "Provider byte transfer preview.",
            state: "requested",
            requestedAt: "2026-07-07T21:01:00.000Z",
            sourceEventIds: ["evt_tool_sk_live_source"],
            inputArtifactHashes: [],
            resultEventIds: [],
            artifactHashes: [],
            readModelChanges: [],
            allowedActions: [],
            eventIds: ["evt_tool_ghp_event"],
            causationIds: []
          }
        ],
        locks: [
          {
            lockId: "lock_OPENAI_API_KEY_DATABASE_PASSWORD",
            residentAgentId: "agent_default",
            kind: "secret",
            activatedBy: "actor_case_owner",
            reason: "Secret-shaped runtime note.",
            activatedAt: "2026-07-07T21:00:00.000Z",
            relatedEventIds: ["evt_lock_GOOGLE_APPLICATION_CREDENTIALS"],
            state: "active",
            clearRelatedEventIds: [],
            eventIds: ["evt_lock_DATABASE_PASSWORD"],
            causationIds: []
          }
        ],
        pendingApprovalCount: 1,
        activeLockCount: 1
      })
    });

    expect(JSON.stringify(model.agentBrief)).not.toMatch(
      /sk-live|sk_live|ghp_|OPENAI_API_KEY|DATABASE_PASSWORD|GOOGLE_APPLICATION_CREDENTIALS/i
    );
  });

  it("does not fabricate evidence recency when the runtime DTO has no receipt timestamp", () => {
    const input = buildCommandBoardInputFromRuntime({
      generatedAt: "2026-07-20T12:00:00.000Z",
      requests: { state: "loading" },
      ingestion: { state: "loading" },
      ontology: { state: "loading" },
      operator: { state: "loading" },
      agent: { state: "loading" },
      evidence: {
        state: "ready",
        data: {
          schemaVersion: "evidence-workspace.v1",
          status: "ready",
          sourceHighWaterMark: 12,
          items: [{
            evidenceId: "ev_undated_runtime",
            source: { kind: "local-import", label: "Undated runtime source" },
            sourceCollections: [{ sourceCollectionId: "src_runtime", label: "Runtime source" }],
            importBatchIds: ["import_runtime"],
            occurrences: [],
            parseJobs: [],
            governanceTags: [],
            quarantined: false,
            quarantineLockLevels: [],
            tombstoned: false,
            linkedReferences: [],
            provenanceComplete: true,
            selectableForAssertionCandidate: true,
            blockingReasons: []
          }],
          assertionCandidates: [],
          diagnostics: [],
          governance: undefined as never
        }
      }
    }, []);
    const model = buildCommandBoardViewModel(input);
    const evidence = getSelectedCommandItem(model, "evidence:ev_undated_runtime");

    expect(model.statusMetrics.find((metric) => metric.id === "new-evidence")).toMatchObject({
      label: "New evidence",
      value: "—",
      tone: "neutral"
    });
    expect(evidence).toMatchObject({ state: "Review" });
    expect(evidence).not.toHaveProperty("occurredAt");
    expect(evidence?.detail.runtimeTimestamp).toBeUndefined();
    expect(evidence?.detail.uncertainty).toContain("Receipt timestamp is unavailable from evidence-workspace.v1");
    expect(model.statusMetrics.find((metric) => metric.id === "diagnostics")).toMatchObject({
      value: "—",
      tone: "neutral"
    });
  });

  it("does not render green zeroes for loaded runtime-unavailable operator or agent DTOs", () => {
    const input = buildCommandBoardInputFromRuntime({
      generatedAt: "2026-07-20T12:00:00.000Z",
      requests: { state: "loading" },
      evidence: { state: "loading" },
      ingestion: { state: "loading" },
      ontology: { state: "loading" },
      operator: {
        state: "ready",
        data: runtimeUnavailableStatus({ generatedAt: "2026-07-20T12:00:00.000Z" })
      },
      agent: {
        state: "ready",
        data: runtimeUnavailableAgentStatus({ generatedAt: "2026-07-20T12:00:00.000Z" })
      }
    }, []);
    const model = buildCommandBoardViewModel(input);

    expect(model.statusMetrics.find((metric) => metric.id === "operator-attention")).toMatchObject({
      value: "—",
      tone: "neutral"
    });
    expect(model.statusMetrics.find((metric) => metric.id === "agent-approvals")).toMatchObject({
      value: "—",
      tone: "neutral"
    });
    expect(model.agentBrief.watching).toStrictEqual(["Resident agent runtime is unavailable"]);
    expect(model.runtimeSources.find((source) => source.sourceId === "operator")?.state).toBe("unavailable");
    expect(model.runtimeSources.find((source) => source.sourceId === "agent")?.state).toBe("unavailable");
  });

  it("renders all-loading and peer-unavailable runtime truth as unknown rather than healthy zeroes", () => {
    const allLoading = buildCommandBoardViewModel(buildCommandBoardInputFromRuntime({
      generatedAt: "2026-07-20T12:00:00.000Z",
      requests: { state: "loading" },
      evidence: { state: "loading" },
      ingestion: { state: "loading" },
      ontology: { state: "loading" },
      operator: { state: "loading" },
      agent: { state: "loading" }
    }, []));

    expect(allLoading.decisionRail.defaultVotes.map((vote) => [vote.id, vote.state, vote.tone])).toStrictEqual([
      ["legal-risk", "unknown", "neutral"],
      ["factual-confidence", "unknown", "neutral"],
      ["cost-pressure", "unknown", "neutral"]
    ]);
    expect(JSON.stringify(allLoading.agentBrief)).not.toMatch(/\b0\b/);
    expect(allLoading.agentBrief.watching).toContain("Runtime sources are loading");

    const peerUnavailable = buildCommandBoardViewModel(buildCommandBoardInputFromRuntime({
      generatedAt: "2026-07-20T12:00:00.000Z",
      requests: { state: "loading" },
      evidence: {
        state: "unavailable",
        diagnosticId: "diag_evidence_peer_unavailable",
        message: "Evidence runtime is unavailable. No fixture data was substituted."
      },
      ingestion: { state: "loading" },
      ontology: { state: "loading" },
      operator: { state: "loading" },
      agent: { state: "loading" }
    }, []));

    expect(peerUnavailable.agentBrief.watching).toContain("1 verified runtime diagnostic");
    expect(peerUnavailable.agentBrief.watching).not.toContain("0 diagnostics");
  });

  it("does not claim zero agent approvals or locks when the loaded agent DTO is not mounted", () => {
    const input = buildCommandBoardInputFromRuntime({
      generatedAt: "2026-07-20T12:00:00.000Z",
      requests: { state: "loading" },
      evidence: { state: "loading" },
      ingestion: { state: "loading" },
      ontology: { state: "loading" },
      operator: { state: "loading" },
      agent: {
        state: "ready",
        data: runtimeUnavailableAgentStatus({ generatedAt: "2026-07-20T12:00:00.000Z" })
      }
    }, []);
    const source = input.runtimeSources?.find((candidate) => candidate.sourceId === "agent");

    expect(source).toMatchObject({ state: "unavailable" });
    expect(source?.summary).toBe("Resident agent runtime is unavailable.");
    expect(source?.summary).not.toMatch(/0 pending approvals|0 active locks/i);
  });

  it("uses only source-owned timestamps and leaves timestamp-less runtime contracts explicit", () => {
    const requestWorkspace = buildPrrWorkspaceDto(buildPrrProjection(goldenPrrLedgerEvents), {
      now: "2026-07-19T09:30:00.000Z"
    });
    const input = buildCommandBoardInputFromRuntime({
      generatedAt: "2026-07-20T12:00:00.000Z",
      requests: {
        state: "ready",
        data: {
          ...requestWorkspace,
          diagnostics: [{
            diagnosticId: "diag_prr_source_time",
            prrRequestId: "prr_req_001",
            category: "projection",
            message: "PRR projection needs review.",
            repairHint: {
              violatedPath: "prr.projection",
              allowedActions: ["Open Requests"]
            }
          }]
        }
      },
      evidence: {
        state: "ready",
        data: {
          ...emptyEvidenceWorkspace(),
          diagnostics: [{
            code: "projection-error",
            severity: "error",
            message: "Evidence projection needs review.",
            repairActions: ["open Evidence"]
          }]
        }
      },
      ingestion: {
        state: "ready",
        data: {
          ...emptyIngestionRuntime(),
          diagnostics: {
            diagnostics: [{
              diagnosticId: "diag_ingestion_source_time",
              severity: "error",
              category: "ingestion.runtime",
              message: "Ingestion runtime needs review."
            }]
          }
        }
      },
      ontology: {
        state: "ready",
        data: {
          ...emptyOntologyWorkspace(),
          diagnostics: [{
            code: "projection-lag",
            severity: "warning",
            message: "Ontology projection needs review.",
            repairActions: ["open Ontology"]
          }]
        }
      },
      operator: { state: "loading" },
      agent: {
        state: "unavailable",
        diagnosticId: "diag_agent_source_time",
        message: "Resident agent runtime is unavailable. No fixture data was substituted."
      }
    }, []);
    const diagnostics = input.runtimeDiagnostics ?? [];

    expect(diagnostics.find((diagnostic) => diagnostic.sourceId === "prr")?.runtimeTimestamp).toBe(
      "2026-07-19T09:30:00.000Z"
    );
    for (const sourceId of ["evidence", "ingestion", "ontology", "agent"] as const) {
      const sourceDiagnostics = diagnostics.filter((diagnostic) => diagnostic.sourceId === sourceId);
      expect(sourceDiagnostics.length).toBeGreaterThan(0);
      expect(sourceDiagnostics.every((diagnostic) => diagnostic.runtimeTimestamp === undefined)).toBe(true);
    }
  });

  it("redacts AWS, Google API key, and JWT shapes at the Command normalization boundary", () => {
    const awsAccessKey = "AKIAABCDEFGHIJKLMNOP";
    const googleApiKey = "AIza1234567890abcdefghijklmnopqrstuvwxy";
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_value";
    const input = buildCommandBoardInputFromRuntime({
      generatedAt: "2026-07-20T12:00:00.000Z",
      requests: { state: "loading" },
      evidence: { state: "loading" },
      ingestion: { state: "loading" },
      ontology: {
        state: "ready",
        data: {
          ...emptyOntologyWorkspace(),
          assertions: [{
            assertionId: "as_secret_shape",
            reviewState: "proposed",
            predicate: `mentions_${awsAccessKey}`,
            confidence: 0.55,
            evidenceId: "ev_secret_shape",
            eventIds: ["evt_assertion_secret_shape"],
            packVersions: []
          }],
          diagnostics: [{
            code: "projection-lag",
            severity: "error",
            message: `Projection note ${googleApiKey} ${jwt}`,
            repairActions: ["open Ontology"]
          }]
        }
      },
      operator: { state: "loading" },
      agent: { state: "loading" }
    }, []);
    const serialized = JSON.stringify(buildCommandBoardViewModel(input));

    expect(serialized).not.toContain(awsAccessKey);
    expect(serialized).not.toContain(googleApiKey);
    expect(serialized).not.toContain(jwt);
    expect(serialized).not.toMatch(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/);
    expect(serialized).not.toMatch(/\bAIza[A-Za-z0-9_-]{35}\b/);
    expect(serialized).not.toMatch(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/);
  });

  it("keeps ontology proposals and agent approvals advisory while real diagnostics retain diagnostic behavior", () => {
    const requestWorkspace = buildPrrWorkspaceDto(buildPrrProjection(goldenPrrLedgerEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });
    const input = buildCommandBoardInputFromRuntime({
      generatedAt: "2026-07-20T12:00:00.000Z",
      requests: { state: "ready", data: requestWorkspace },
      evidence: { state: "ready", data: emptyEvidenceWorkspace() },
      ingestion: { state: "ready", data: emptyIngestionRuntime() },
      ontology: {
        state: "ready",
        data: {
          ...emptyOntologyWorkspace(),
          assertions: [{
            assertionId: "as_advisory_only",
            reviewState: "proposed",
            predicate: "mentions_agency",
            confidence: 0.62,
            evidenceId: "ev_advisory_only",
            eventIds: ["evt_advisory_only"],
            packVersions: []
          }]
        }
      },
      operator: {
        state: "ready",
        data: runtimeUnavailableStatus({ generatedAt: "2026-07-20T12:00:00.000Z" })
      },
      agent: { state: "ready", data: agentStatus() }
    }, []);
    const model = buildCommandBoardViewModel(input);
    const runtimeDiagnostics = input.runtimeDiagnostics ?? [];
    const counted = runtimeDiagnostics.filter((diagnostic) => diagnostic.priorityKind === "diagnostic");

    expect(runtimeDiagnostics.filter((diagnostic) => diagnostic.sourceId === "operator")).toHaveLength(1);
    expect(counted).toHaveLength(1);
    expect(model.statusMetrics.find((metric) => metric.id === "diagnostics")?.value).toBe("1");
    expect(model.queueItems.map((item) => item.id)).toEqual(expect.arrayContaining([
      "runtime:ontology:proposal_as_advisory_only",
      "runtime:agent:approval_toolreq_provider_preview"
    ]));
    const proposal = getSelectedCommandItem(model, "runtime:ontology:proposal_as_advisory_only");
    const approval = getSelectedCommandItem(model, "runtime:agent:approval_toolreq_provider_preview");
    const actualDiagnostic = model.queueItems.find((item) =>
      item.kind === "diagnostic" && item.id.startsWith("runtime:operator:")
    );

    expect([proposal?.kind, approval?.kind]).toStrictEqual(["advisory", "advisory"]);
    expect(filterQueueItems(model.queueItems, "advisory").map((item) => item.id)).toEqual(expect.arrayContaining([
      "runtime:ontology:proposal_as_advisory_only",
      "runtime:agent:approval_toolreq_provider_preview"
    ]));
    expect(filterQueueItems(model.queueItems, "diagnostic").map((item) => item.id)).toStrictEqual([
      actualDiagnostic?.id
    ]);
    expect(actualDiagnostic?.kind).toBe("diagnostic");

    for (const advisory of [proposal, approval]) {
      expect(JSON.stringify(advisory?.detail)).not.toMatch(
        /diagnostic|repair|projection state needs repair|until (?:the )?diagnostic (?:is )?(?:repaired|resolved)/i
      );
      expect(advisory?.detail.decisionVotes.map((vote) => vote.summary).join(" ")).toMatch(/human/i);
      expect(advisory?.actionTarget).toMatch(/ontology|agents/);
      expect(advisory?.detail.provenanceRefs.length).toBeGreaterThan(0);
    }
  });

  it("derives cross-runtime metrics and priority details from each browser-safe source DTO", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const requestWorkspace = buildPrrWorkspaceDto(projection, { now: "2026-07-20T12:00:00.000Z" });
    const input = buildCommandBoardInputFromRuntime({
      generatedAt: "2026-07-20T12:00:00.000Z",
      requests: { state: "ready", data: requestWorkspace },
      evidence: {
        state: "ready",
        data: {
          schemaVersion: "evidence-workspace.v1",
          status: "ready",
          sourceHighWaterMark: 21,
          items: [{
            evidenceId: "ev_runtime_review",
            contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
            source: { kind: "local-import", label: "Runtime intake" },
            sourceCollections: [{ sourceCollectionId: "src_runtime", label: "Runtime source" }],
            importBatchIds: ["import_runtime"],
            occurrences: [],
            parseJobs: [],
            governanceTags: [{
              tag: "public_safe",
              confidence: 0.73,
              rationale: "Advisory runtime classification.",
              source: "ai",
              status: "active",
              eventId: "evt_governance_runtime"
            }],
            quarantined: false,
            quarantineLockLevels: [],
            tombstoned: false,
            linkedReferences: [{
              kind: "prr",
              id: "prr_req_001",
              eventIds: ["evt_evidence_link_runtime"]
            }],
            provenanceComplete: true,
            selectableForAssertionCandidate: true,
            blockingReasons: []
          }],
          assertionCandidates: [],
          diagnostics: [],
          governance: undefined as never
        }
      },
      ingestion: {
        state: "ready",
        data: {
          workspace: { mounted: true, workspaceId: "ws_runtime", diagnostics: [] },
          jobs: {
            jobs: [{
              jobId: "job_parse_failed",
              kind: "local-parse",
              state: "failed",
              retryable: true,
              evidenceId: "ev_runtime_review",
              diagnosticIds: ["diag_ingest_backlog"]
            }]
          },
          diagnostics: {
            diagnostics: [{
              diagnosticId: "diag_ingest_backlog",
              severity: "warning",
              category: "ingestion.queue",
              message: "One parse job needs review."
            }]
          }
        }
      },
      ontology: {
        state: "ready",
        data: {
          schemaVersion: "ontology-workspace.v1",
          status: "ready",
          sourceHighWaterMark: 21,
          entities: [],
          relationships: [],
          assertions: [{
            assertionId: "as_runtime_gap",
            reviewState: "proposed",
            predicate: "mentions_agency",
            confidence: 0.61,
            evidenceId: "ev_runtime_review",
            eventIds: ["evt_assertion_runtime"],
            packVersions: []
          }],
          diagnostics: []
        }
      },
      operator: { state: "ready", data: operatorStatusForCommandModel() },
      agent: { state: "ready", data: agentStatus() }
    }, []);
    const model = buildCommandBoardViewModel(input);

    expect(model.runtimeSources.map((source) => source.sourceId)).toStrictEqual([
      "prr",
      "evidence",
      "ingestion",
      "ontology",
      "operator",
      "agent"
    ]);
    expect(model.statusMetrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ingestion-attention", value: "1", tone: "amber" }),
      expect.objectContaining({ id: "ontology-gaps", value: "1", tone: "amber" }),
      expect.objectContaining({ id: "operator-attention", value: "1", tone: "red" }),
      expect.objectContaining({ id: "agent-approvals", value: "1", tone: "amber" })
    ]));
    expect(model.queueItems.map((item) => item.id)).toEqual(expect.arrayContaining([
      "evidence:ev_runtime_review",
      "runtime:ingestion:diag_ingest_backlog",
      "runtime:ingestion:job_job_parse_failed",
      "runtime:ontology:proposal_as_runtime_gap",
      "runtime:agent:approval_toolreq_provider_preview"
    ]));

    const evidence = getSelectedCommandItem(model, "evidence:ev_runtime_review");
    expect(evidence).toMatchObject({
      state: "Review",
      actionTarget: "evidence",
      detail: {
        confidence: 0.73,
        basis: "local-import / Runtime intake; highest active governance tag confidence 73%"
      }
    });
    expect(evidence?.detail.provenanceRefs).toEqual(expect.arrayContaining([
      "ev_runtime_review",
      "src_runtime",
      "import_runtime",
      "evt_governance_runtime",
      "prr_req_001",
      "evt_evidence_link_runtime"
    ]));

    const ontology = getSelectedCommandItem(model, "runtime:ontology:proposal_as_runtime_gap");
    expect(ontology).toMatchObject({
      actionTarget: "ontology",
      detail: {
        basis: "mentions_agency at 61% proposal confidence",
        recommendedAction: "Open Ontology"
      }
    });
    expect(ontology?.detail.runtimeTimestamp).toBeUndefined();
    expect(ontology?.detail.provenanceRefs).toStrictEqual([
      "as_runtime_gap",
      "ev_runtime_review",
      "evt_assertion_runtime"
    ]);
  });
});

function agentStatus(overrides: Partial<AgentStatusDto> = {}): AgentStatusDto {
  return {
    schemaVersion: "agent-status.v1",
    generatedAt: "2026-07-07T21:00:00.000Z",
    residentAgentId: "agent_default",
    identity: {
      residentAgentId: "agent_default",
      workspaceId: "ws_case_001",
      label: "Cestus Agent",
      policyId: "agent_policy_default",
      initializedBy: "actor_case_owner",
      allowedRunTypes: ["evidence-triage"],
      memoryProjectionVersion: "0.1.0",
      eventIds: ["evt_agent_identity"],
      causationIds: []
    },
    providers: [
      {
        providerId: "provider_fake_local",
        label: "Fake Local Model Provider",
        adapterVersion: "fake-provider.v1",
        endpointKind: "local-engine",
        modelFamilies: ["fake-local"],
        credentialKinds: ["local-no-secret"],
        supportsStructuredOutput: false,
        supportsToolCalling: false,
        safeDataNotes: "Deterministic local fake provider for command tests."
      }
    ],
    pendingApprovalCount: 1,
    activeLockCount: 1,
    diagnostics: [],
    tasks: [
      {
        taskId: "task_provider_review",
        residentAgentId: "agent_default",
        title: "Review provider approval",
        requestedBy: "actor_case_owner",
        priority: "normal",
        status: "waiting-for-approval",
        createdAt: "2026-07-07T21:00:00.000Z",
        sourceEventIds: ["evt_operator_status"],
        inputArtifactHashes: [],
        runId: "run_provider_review",
        eventIds: ["evt_task_created"],
        causationIds: []
      }
    ],
    runs: [],
    toolRequests: [
      {
        toolRequestId: "toolreq_provider_preview",
        runId: "run_provider_review",
        toolId: "provider.parse.preview",
        toolVersion: "1",
        requestedBy: "actor_cestus_agent",
        sideEffectClass: "external-byte-transfer",
        requiredApprovalClass: "provider-byte-transfer",
        previewHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        scope: "workspace",
        estimatedEffect: "Provider byte transfer preview.",
        state: "requested",
        requestedAt: "2026-07-07T21:01:00.000Z",
        sourceEventIds: ["evt_task_created"],
        inputArtifactHashes: [],
        resultEventIds: [],
        artifactHashes: [],
        readModelChanges: [],
        allowedActions: [],
        eventIds: ["evt_tool_requested"],
        causationIds: ["evt_run_started"]
      }
    ],
    activeMemory: [],
    permissions: [],
    locks: [
      {
        lockId: "lock_legal_escalation",
        residentAgentId: "agent_default",
        kind: "legal-escalation",
        activatedBy: "actor_case_owner",
        reason: "Human legal review is required.",
        activatedAt: "2026-07-07T21:00:00.000Z",
        relatedEventIds: ["evt_prr_signal"],
        state: "active",
        clearRelatedEventIds: [],
        eventIds: ["evt_lock_active"],
        causationIds: []
      }
    ],
    ...overrides,
    identityLifecycle: overrides.identityLifecycle ?? readyIdentityLifecycle()
  };
}

function readyIdentityLifecycle() {
  return {
    schemaVersion: "resident-identity-lifecycle.v1" as const,
    state: "ready" as const,
    residentAgentId: "agent_default" as const,
    workspaceId: "ws_case_001",
    initialized: true,
    eventIds: ["evt_agent_identity"],
    safeMessage: "Resident identity is ready.",
    allowedRepairActions: []
  };
}

function operatorStatusForCommandModel(): OperatorStatusDto {
  return {
    schemaVersion: "operator-status.v1",
    generatedAt: "2026-07-20T12:00:00.000Z",
    runtime: {
      available: true,
      safeMessage: "Runtime ready with one operator action required."
    },
    summary: {
      overallState: "action-required",
      blockedCount: 0,
      actionRequiredCount: 1,
      degradedCount: 0,
      nextSafeActionId: "action_refresh_operator_status"
    },
    sections: [{
      sectionId: "workspace",
      label: "Workspace",
      state: "action-required",
      headline: "Workspace review required",
      safeSummary: "Review the local workspace status.",
      metrics: [],
      diagnostics: [],
      sourceEvidence: [{
        evidenceId: "src_workspace_runtime",
        sourceContract: "workspace-ops.v1",
        sourceKind: "workspace-ops",
        label: "workspace verify",
        refs: []
      }],
      nextSafeActionIds: ["action_refresh_operator_status"]
    }],
    safeActions: [{
      actionId: "action_refresh_operator_status",
      label: "Refresh status",
      kind: "refresh-status",
      sourceContract: "operator-status.v1",
      requiresHumanApproval: false,
      mutatesCanonicalState: false,
      externalEffect: false,
      enabled: true
    }]
  };
}

function emptyEvidenceWorkspace(): EvidenceWorkspaceDto {
  return {
    schemaVersion: "evidence-workspace.v1",
    status: "ready",
    sourceHighWaterMark: 0,
    items: [],
    assertionCandidates: [],
    diagnostics: [],
    governance: undefined as never
  };
}

function emptyIngestionRuntime(): CommandIngestionRuntimeDto {
  return {
    workspace: { mounted: true, workspaceId: "ws_command_test", diagnostics: [] },
    jobs: { jobs: [] },
    diagnostics: { diagnostics: [] }
  };
}

function emptyOntologyWorkspace(): OntologyWorkspaceDto {
  return {
    schemaVersion: "ontology-workspace.v1",
    status: "ready",
    sourceHighWaterMark: 0,
    entities: [],
    relationships: [],
    assertions: [],
    diagnostics: []
  };
}
