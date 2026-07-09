import type { AgentToolApprovalClass, AgentToolSideEffectClass } from "./projection-types.js";
import type { AgentSpecialistRunType } from "./specialists.js";

type MvpSpecialistRunType = Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
type SpecialistPromptSafetyClass = "workspace-safe" | "public-safe" | "sensitive-local-only" | "provider-approved";
type SpecialistPromptTransferApprovalClass = "none" | "provider-byte-transfer";
type SpecialistDomainOwner = "agent" | "prr" | "ingestion" | "ontology" | "governance" | "reporting";

export interface SpecialistContextPackRequirement {
  readonly contextPackId: string;
  readonly required: boolean;
  readonly purpose: string;
}

export interface SpecialistPromptTemplateDescriptor {
  readonly promptTemplateId: string;
  readonly promptTemplateVersion: number;
  readonly outputSchemaId: string;
  readonly safetyClass: SpecialistPromptSafetyClass;
  readonly transferApprovalClass: SpecialistPromptTransferApprovalClass;
}

export interface SpecialistToolDescriptor {
  readonly toolId: string;
  readonly domainOwner: SpecialistDomainOwner;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly requiredApprovalClass: AgentToolApprovalClass;
  readonly purpose: string;
}

export interface SpecialistApprovalDescriptor {
  readonly approvalClass: AgentToolApprovalClass;
  readonly requiredWhen: string;
}

export interface SpecialistOutputDescriptor {
  readonly artifactKind: string;
  readonly schemaId: string;
  readonly purpose: string;
}

export interface SpecialistWorkflowDescriptor {
  readonly runType: MvpSpecialistRunType;
  readonly residentIdentity: "agent_default";
  readonly label: string;
  readonly purpose: string;
  readonly executionEnabled: false;
  readonly prerequisiteContractIds: readonly string[];
  readonly contextPacks: readonly SpecialistContextPackRequirement[];
  readonly promptTemplate: SpecialistPromptTemplateDescriptor;
  readonly allowedTools: readonly SpecialistToolDescriptor[];
  readonly approvalRequirements: readonly SpecialistApprovalDescriptor[];
  readonly outputArtifacts: readonly SpecialistOutputDescriptor[];
  readonly handoffSchemaId: string;
  readonly failureModes: readonly string[];
}

export interface SpecialistWorkflowRegistrySnapshot {
  readonly schemaVersion: "agent-specialist-workflow-registry.v1";
  readonly descriptors: readonly SpecialistWorkflowDescriptor[];
}

const sharedPrerequisites = Object.freeze([
  "agent.scheduler-resumer.v1",
  "agent.domain-adapter.v1"
] as const);

const specialistWorkflowDescriptorMap = new Map<MvpSpecialistRunType, SpecialistWorkflowDescriptor>(
  buildDescriptors().map((descriptor) => [descriptor.runType, descriptor])
);

export const specialistWorkflowDescriptors = Object.freeze(
  [...specialistWorkflowDescriptorMap.values()]
) as readonly SpecialistWorkflowDescriptor[];

export function specialistWorkflowDescriptorFor(runType: AgentSpecialistRunType): SpecialistWorkflowDescriptor {
  if (runType === "ontology-bootstrap") {
    throw new Error("ontology-bootstrap is not part of MVP workflow registry");
  }

  const descriptor = specialistWorkflowDescriptorMap.get(runType);
  if (descriptor === undefined) {
    throw new Error(`Unknown specialist workflow run type: ${runType}`);
  }

  return descriptor;
}

export function specialistWorkflowRegistrySnapshot(): SpecialistWorkflowRegistrySnapshot {
  return Object.freeze({
    schemaVersion: "agent-specialist-workflow-registry.v1",
    descriptors: specialistWorkflowDescriptors
  });
}

function buildDescriptors(): readonly SpecialistWorkflowDescriptor[] {
  return Object.freeze([
    createDescriptor({
      runType: "prr-negotiation",
      label: "PRR Negotiation",
      purpose: "Draft follow-ups, deadline reviews, fee challenges, and escalation posture notes without sending anything.",
      contextPacks: [
        contextPack("prr-read-model.v1", "Summarize request status, correspondence posture, deadlines, and diagnostics."),
        contextPack("jurisdiction-pack-summary.v1", "Provide cited jurisdiction rules for deadlines, fees, exemptions, and appeals."),
        contextPack("governance-locks.v1", "Surface active legal, export, quarantine, and provider-transfer locks."),
        contextPack("evidence-summary.v1", "Reference request-linked evidence metadata and safe summaries."),
        contextPack("agent-memory-summary.v1", "Carry forward source-linked workspace caveats and prior notes."),
        contextPack("task-run-history.v1", "Bind prior run outcomes, denials, and pending approvals."),
        contextPack("workspace-runtime-status.v1", "Confirm runtime readiness and projection freshness.")
      ],
      promptTemplate: promptTemplate("prr-negotiation"),
      allowedTools: [
        tool("prr.request.read", "prr", "read-only", "none", "Read the current PRR request state."),
        tool("prr.deadline.review", "prr", "read-only", "none", "Review deadline calculations and cited rule refs."),
        tool("prr.stalling-signals.read", "prr", "read-only", "none", "Inspect fee and stalling indicators."),
        tool("prr.correspondence.draft-local", "prr", "local-derivative", "none", "Write a local draft correspondence artifact."),
        tool("prr.followup-send.request", "prr", "external-message-send", "external-message-send", "Request human approval for a follow-up send preview."),
        tool("prr.appeal-draft.request", "prr", "ledger-review", "legal-escalation", "Request legal-review posture for appeal drafting."),
        tool("prr.legal-escalation-review.request", "prr", "legal-escalation", "legal-escalation", "Request legal escalation review without escalating."),
        tool("agent.memory.record-caveat", "agent", "ledger-proposal", "human-review", "Record a source-linked caveat for future runs.")
      ],
      approvalRequirements: [
        approval("external-message-send", "Any follow-up or send preview that could leave draft state."),
        approval("legal-escalation", "Any appeal posture, threat language, or escalation review."),
        approval("provider-byte-transfer", "Any transfer of raw correspondence text or private attachments.")
      ],
      outputArtifacts: [
        outputArtifact("correspondence-draft", "prr-negotiation-handoff.v1", "Capture drafted follow-up or narrowing responses."),
        outputArtifact("deadline-review", "prr-negotiation-handoff.v1", "Preserve deadline and fee review findings."),
        outputArtifact("legal-risk-note", "prr-negotiation-handoff.v1", "Track unresolved legal and escalation questions.")
      ],
      failureModes: [
        "prr-request-missing",
        "jurisdiction-pack-missing",
        "deadline-conflict",
        "legal-lock-active",
        "approval-required",
        "approval-stale",
        "provider-byte-transfer-required",
        "projection-lag",
        "missing-provenance",
        "secret-detected"
      ]
    }),
    createDescriptor({
      runType: "evidence-triage",
      label: "Evidence Triage",
      purpose: "Classify productions, flag governance issues, and produce local review bundles without accepting graph truth.",
      contextPacks: [
        contextPack("evidence-summary.v1", "Summarize evidence metadata, hashes, media types, and safe summaries."),
        contextPack("governance-locks.v1", "Surface quarantine, redaction, and provider-transfer locks."),
        contextPack("prr-read-model.v1", "Tie productions back to request state and correspondence context."),
        contextPack("accepted-graph-projection.v1", "Avoid duplicates against accepted assertions and entities."),
        contextPack("agent-memory-summary.v1", "Preserve prior caveats and review notes."),
        contextPack("task-run-history.v1", "Expose earlier triage attempts, approvals, and denials."),
        contextPack("workspace-runtime-status.v1", "Confirm parse and projection readiness.")
      ],
      promptTemplate: promptTemplate("evidence-triage"),
      allowedTools: [
        tool("evidence.summary.read", "ingestion", "read-only", "none", "Read evidence metadata and safe summaries."),
        tool("ingestion.parse-status.read", "ingestion", "read-only", "none", "Inspect parse job status and readiness."),
        tool("ingestion.provider-parse-approval.request", "ingestion", "external-byte-transfer", "provider-byte-transfer", "Request provider parse approval without parsing."),
        tool("evidence.triage-dossier.write-local", "ingestion", "local-derivative", "none", "Write a local triage dossier."),
        tool("governance.classification.propose", "governance", "ledger-proposal", "human-review", "Propose governance classification decisions for review."),
        tool("governance.quarantine-review.request", "governance", "ledger-review", "human-review", "Request quarantine or redaction review."),
        tool("assertion.candidate-bundle.write-local", "ontology", "local-derivative", "none", "Write a local assertion candidate bundle."),
        tool("agent.memory.record-caveat", "agent", "ledger-proposal", "human-review", "Record a source-linked caveat for future runs.")
      ],
      approvalRequirements: [
        approval("provider-byte-transfer", "Any transfer of raw evidence text or extracted content to a remote provider."),
        approval("human-review", "Any sensitive opt-in, quarantine release, redaction, or governance classification decision."),
        approval("ledger-review", "Any ontology proposal that could become a durable assertion review action.")
      ],
      outputArtifacts: [
        outputArtifact("triage-dossier", "evidence-triage-handoff.v1", "Capture safe summaries, gaps, and suggested review queues."),
        outputArtifact("assertion-candidate-bundle", "evidence-triage-handoff.v1", "Package local candidate assertions for later human/domain review."),
        outputArtifact("governance-review-note", "evidence-triage-handoff.v1", "Record quarantine and sensitivity follow-up needs.")
      ],
      failureModes: [
        "evidence-missing",
        "evidence-quarantined",
        "parse-unavailable",
        "provider-byte-transfer-required",
        "governance-lock-active",
        "projection-lag",
        "missing-provenance",
        "model-output-invalid",
        "secret-detected"
      ]
    }),
    createDescriptor({
      runType: "timeline-builder",
      label: "Timeline Builder",
      purpose: "Assemble sourced local timelines with uncertainty notes and citations only.",
      contextPacks: [
        contextPack("accepted-graph-projection.v1", "Reference accepted assertions, entities, relationships, and provenance."),
        contextPack("evidence-summary.v1", "Provide date-bearing evidence metadata and summaries."),
        contextPack("prr-read-model.v1", "Include request timeline entries and correspondence summaries."),
        contextPack("governance-locks.v1", "Expose governance, export, and provider-transfer locks."),
        contextPack("agent-memory-summary.v1", "Carry forward timeline caveats and prior notes."),
        contextPack("task-run-history.v1", "Preserve prior draft attempts and omissions."),
        contextPack("workspace-runtime-status.v1", "Confirm projection freshness for source reconstruction.")
      ],
      promptTemplate: promptTemplate("timeline-builder"),
      allowedTools: [
        tool("timeline.source-events.read", "ontology", "read-only", "none", "Read sourced events for timeline assembly."),
        tool("timeline.draft.write-local", "agent", "local-derivative", "none", "Write a local sourced timeline artifact."),
        tool("timeline.uncertainty-record.write-local", "agent", "local-derivative", "none", "Write date precision and uncertainty notes."),
        tool("agent.memory.record-caveat", "agent", "ledger-proposal", "human-review", "Record a source-linked caveat for future runs.")
      ],
      approvalRequirements: [
        approval("provider-byte-transfer", "Any transfer of private chronology text or raw source material."),
        approval("export-or-publication", "Any packaging of a timeline for external sharing or publication."),
        approval("human-review", "Any durable caveat record appended for future agent memory.")
      ],
      outputArtifacts: [
        outputArtifact("timeline-artifact", "timeline-builder-handoff.v1", "Store the sourced timeline with item citations."),
        outputArtifact("uncertainty-note", "timeline-builder-handoff.v1", "Preserve date precision and uncertainty caveats."),
        outputArtifact("omitted-source-list", "timeline-builder-handoff.v1", "Record omitted sources and unresolved evidence prompts.")
      ],
      failureModes: [
        "timeline-source-missing",
        "date-parse-conflict",
        "citation-missing",
        "projection-lag",
        "context-budget-exceeded",
        "provider-byte-transfer-required",
        "model-output-invalid",
        "secret-detected"
      ]
    }),
    createDescriptor({
      runType: "contradiction-finder",
      label: "Contradiction Finder",
      purpose: "Produce contradiction candidates tied to exact sources without rejecting assertions or accepting truth.",
      contextPacks: [
        contextPack("accepted-graph-projection.v1", "Reference accepted assertions and provenance for comparison."),
        contextPack("evidence-summary.v1", "Provide evidence summaries and content hashes for paired comparisons."),
        contextPack("prr-read-model.v1", "Include agency statements, correspondence, and request-linked context."),
        contextPack("timeline-draft-summary.v1", "Compare against prior sourced timeline artifacts and uncertainty flags."),
        contextPack("governance-locks.v1", "Expose governance, legal, and provider-transfer locks."),
        contextPack("agent-memory-summary.v1", "Preserve prior contradiction caveats and review notes."),
        contextPack("task-run-history.v1", "Track earlier candidate runs, denials, and blocked prerequisites."),
        contextPack("workspace-runtime-status.v1", "Confirm source readiness and projection freshness.")
      ],
      promptTemplate: promptTemplate("contradiction-finder"),
      allowedTools: [
        tool("contradiction.sources.read", "ontology", "read-only", "none", "Read paired sources, assertions, and summaries for comparison."),
        tool("contradiction.candidate-dossier.write-local", "agent", "local-derivative", "none", "Write a local contradiction candidate dossier."),
        tool("diagnostic.investigative-signal.request", "agent", "ledger-review", "human-review", "Request a durable investigative signal review."),
        tool("claim.contradiction-link.request", "ontology", "ledger-review", "ledger-review", "Request a contradiction link review without mutating claims."),
        tool("agent.memory.record-caveat", "agent", "ledger-proposal", "human-review", "Record a source-linked caveat for future runs.")
      ],
      approvalRequirements: [
        approval("human-review", "Any contradiction candidate that requests a durable diagnostic or review queue action."),
        approval("ledger-review", "Any claim link or assertion-adjacent review action."),
        approval("provider-byte-transfer", "Any transfer of raw records or correspondence to a remote provider.")
      ],
      outputArtifacts: [
        outputArtifact("candidate-dossier", "contradiction-finder-handoff.v1", "Capture paired source refs, rationale, and alternatives."),
        outputArtifact("follow-up-evidence-note", "contradiction-finder-handoff.v1", "Track requested follow-up evidence and reviewer actions."),
        outputArtifact("confidence-caveat", "contradiction-finder-handoff.v1", "Preserve uncertainty and alternative explanations.")
      ],
      failureModes: [
        "source-pair-missing",
        "claim-scope-missing",
        "citation-missing",
        "projection-lag",
        "context-budget-exceeded",
        "provider-byte-transfer-required",
        "model-output-invalid",
        "secret-detected"
      ]
    }),
    createDescriptor({
      runType: "investigation-planner",
      label: "Investigation Planner",
      purpose: "Organize evidence gaps, task suggestions, and draft PRR candidates without crawling portals or sending requests.",
      contextPacks: [
        contextPack("accepted-graph-projection.v1", "Reference accepted facts and provenance relevant to the investigation."),
        contextPack("evidence-summary.v1", "Summarize known evidence and unresolved gaps."),
        contextPack("prr-read-model.v1", "Provide current PRR posture, deadlines, and correspondence context."),
        contextPack("timeline-draft-summary.v1", "Use prior timeline uncertainty and omissions to plan next steps."),
        contextPack("contradiction-candidate-summary.v1", "Incorporate open contradiction candidates and reviewer decisions."),
        contextPack("governance-locks.v1", "Expose legal, governance, and provider-transfer locks."),
        contextPack("agent-memory-summary.v1", "Preserve prior planning caveats and task notes."),
        contextPack("task-run-history.v1", "Track earlier planning runs and approval outcomes."),
        contextPack("workspace-runtime-status.v1", "Confirm runtime readiness and projection freshness.")
      ],
      promptTemplate: promptTemplate("investigation-planner"),
      allowedTools: [
        tool("investigation.gaps.read", "ontology", "read-only", "none", "Read current investigative gaps and linked evidence."),
        tool("investigation.plan.write-local", "agent", "local-derivative", "none", "Write a local investigation plan artifact."),
        tool("agent.task-suggestion.write-local", "agent", "local-derivative", "none", "Write local task suggestions without durable task creation."),
        tool("prr.draft-candidate.write-local", "prr", "local-derivative", "none", "Write local PRR candidate drafts for later review."),
        tool("prr.followup-send.request", "prr", "external-message-send", "external-message-send", "Request human approval for any external PRR follow-up preview."),
        tool("agent.memory.record-caveat", "agent", "ledger-proposal", "human-review", "Record a source-linked caveat for future runs.")
      ],
      approvalRequirements: [
        approval("external-message-send", "Any external request, PRR send, follow-up, or portal action preview."),
        approval("human-review", "Any durable task creation if task suggestions graduate beyond local artifacts."),
        approval("provider-byte-transfer", "Any new provider transfer of raw report, timeline, or evidence context.")
      ],
      outputArtifacts: [
        outputArtifact("investigation-plan", "investigation-planner-handoff.v1", "Capture prioritized next steps and dependencies."),
        outputArtifact("task-suggestion-bundle", "investigation-planner-handoff.v1", "Preserve local task candidates and rationale."),
        outputArtifact("prr-candidate-bundle", "investigation-planner-handoff.v1", "Package local PRR draft candidates for review.")
      ],
      failureModes: [
        "investigation-scope-missing",
        "insufficient-context",
        "external-action-approval-required",
        "governance-lock-active",
        "projection-lag",
        "provider-byte-transfer-required",
        "model-output-invalid",
        "secret-detected"
      ]
    }),
    createDescriptor({
      runType: "report-builder",
      label: "Report Builder",
      purpose: "Assemble evidence-backed report packets, drafts, and citation maps without exporting or publishing them.",
      contextPacks: [
        contextPack("accepted-graph-projection.v1", "Reference accepted facts and provenance for reporting."),
        contextPack("evidence-summary.v1", "Summarize evidence metadata, safe excerpts, and exclusions."),
        contextPack("prr-read-model.v1", "Include PRR posture, correspondence summaries, and request context."),
        contextPack("timeline-draft-summary.v1", "Reference prior sourced timelines and uncertainty notes."),
        contextPack("contradiction-candidate-summary.v1", "Capture unresolved contradictions and review decisions."),
        contextPack("governance-locks.v1", "Expose export, legal, and provider-transfer locks."),
        contextPack("agent-memory-summary.v1", "Preserve reporting caveats, style notes, and prior guidance."),
        contextPack("task-run-history.v1", "Track earlier packet drafts and approval outcomes."),
        contextPack("workspace-runtime-status.v1", "Confirm runtime readiness and projection freshness.")
      ],
      promptTemplate: promptTemplate("report-builder"),
      allowedTools: [
        tool("report.outline.write-local", "reporting", "local-derivative", "none", "Write a local report outline."),
        tool("report.section-draft.write-local", "reporting", "local-derivative", "none", "Write local draft report sections."),
        tool("report.citation-map.write-local", "reporting", "local-derivative", "none", "Write a local citation map."),
        tool("governance.export-preview.request", "governance", "ledger-review", "export-or-publication", "Request an export preview without exporting."),
        tool("governance.export-approval.request", "governance", "export-or-publication", "export-or-publication", "Request publication or export approval."),
        tool("agent.memory.record-caveat", "agent", "ledger-proposal", "human-review", "Record a source-linked caveat for future runs.")
      ],
      approvalRequirements: [
        approval("export-or-publication", "Any durable export, report packet, or shareable bundle."),
        approval("human-review", "Any sensitive opt-in, private-source inclusion, or caveat append."),
        approval("legal-escalation", "Any accusatory, escalation, or allegation posture requiring legal review."),
        approval("provider-byte-transfer", "Any transfer of raw report context beyond local-only mode.")
      ],
      outputArtifacts: [
        outputArtifact("report-outline", "report-builder-handoff.v1", "Capture the local report outline."),
        outputArtifact("draft-sections", "report-builder-handoff.v1", "Preserve local section drafts and unresolved risks."),
        outputArtifact("citation-map", "report-builder-handoff.v1", "Bind included claims to evidence and exclusions."),
        outputArtifact("export-preview", "report-builder-handoff.v1", "Record export-preview and approval request refs.")
      ],
      failureModes: [
        "citation-missing",
        "accepted-fact-required",
        "sensitive-opt-in-required",
        "export-lock-active",
        "legal-lock-active",
        "projection-lag",
        "provider-byte-transfer-required",
        "model-output-invalid",
        "secret-detected"
      ]
    })
  ]);
}

function contextPack(contextPackId: string, purpose: string): SpecialistContextPackRequirement {
  return Object.freeze({
    contextPackId,
    required: true,
    purpose
  });
}

function promptTemplate(runType: MvpSpecialistRunType): SpecialistPromptTemplateDescriptor {
  return Object.freeze({
    promptTemplateId: `${runType}.context-pack.v1`,
    promptTemplateVersion: 1,
    outputSchemaId: `${runType}-handoff.v1`,
    safetyClass: "provider-approved",
    transferApprovalClass: "provider-byte-transfer"
  });
}

function tool(
  toolId: string,
  domainOwner: SpecialistDomainOwner,
  sideEffectClass: AgentToolSideEffectClass,
  requiredApprovalClass: AgentToolApprovalClass,
  purpose: string
): SpecialistToolDescriptor {
  return Object.freeze({
    toolId,
    domainOwner,
    sideEffectClass,
    requiredApprovalClass,
    purpose
  });
}

function approval(
  approvalClass: AgentToolApprovalClass,
  requiredWhen: string
): SpecialistApprovalDescriptor {
  return Object.freeze({
    approvalClass,
    requiredWhen
  });
}

function outputArtifact(
  artifactKind: string,
  schemaId: string,
  purpose: string
): SpecialistOutputDescriptor {
  return Object.freeze({
    artifactKind,
    schemaId,
    purpose
  });
}

function createDescriptor(input: {
  readonly runType: MvpSpecialistRunType;
  readonly label: string;
  readonly purpose: string;
  readonly contextPacks: readonly SpecialistContextPackRequirement[];
  readonly promptTemplate: SpecialistPromptTemplateDescriptor;
  readonly allowedTools: readonly SpecialistToolDescriptor[];
  readonly approvalRequirements: readonly SpecialistApprovalDescriptor[];
  readonly outputArtifacts: readonly SpecialistOutputDescriptor[];
  readonly failureModes: readonly string[];
}): SpecialistWorkflowDescriptor {
  const descriptor: Omit<SpecialistWorkflowDescriptor, "failureModes"> = Object.freeze({
    runType: input.runType,
    residentIdentity: "agent_default",
    label: input.label,
    purpose: input.purpose,
    executionEnabled: false,
    prerequisiteContractIds: sharedPrerequisites,
    contextPacks: Object.freeze([...input.contextPacks]),
    promptTemplate: input.promptTemplate,
    allowedTools: Object.freeze([...input.allowedTools]),
    approvalRequirements: Object.freeze([...input.approvalRequirements]),
    outputArtifacts: Object.freeze([...input.outputArtifacts]),
    handoffSchemaId: `${input.runType}-handoff.v1`
  });

  return Object.freeze(
    Object.defineProperty(
      {
        ...descriptor,
        failureModes: Object.freeze([...input.failureModes])
      },
      "failureModes",
      {
        enumerable: false,
        configurable: false,
        writable: false
      }
    )
  ) as SpecialistWorkflowDescriptor;
}
