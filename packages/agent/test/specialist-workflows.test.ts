import { describe, expect, it } from "vitest";
import { approvedAgentSpecialistRunTypes, specialistExecutionStatusFor } from "../src/specialists.js";
import {
  specialistWorkflowDescriptorFor,
  specialistWorkflowDescriptors,
  specialistWorkflowRegistrySnapshot
} from "../src/specialist-workflows.js";

const mvpRunTypes = [
  "prr-negotiation",
  "evidence-triage",
  "timeline-builder",
  "contradiction-finder",
  "investigation-planner",
  "report-builder"
] as const;

const expectedPromptTemplateIdsByRunType = {
  "prr-negotiation": "prr-negotiation.review.v1",
  "evidence-triage": "evidence-triage.classify.v1",
  "timeline-builder": "timeline-builder.sourced-timeline.v1",
  "contradiction-finder": "contradiction-finder.candidates.v1",
  "investigation-planner": "investigation-planner.next-steps.v1",
  "report-builder": "report-builder.packet-draft.v1"
} satisfies Record<(typeof mvpRunTypes)[number], string>;

const expectedOutputArtifactKindsByRunType = {
  "prr-negotiation": [
    "correspondence-draft-artifact",
    "deadline-review-artifact",
    "fee-stalling-note",
    "narrowing-options",
    "legal-risk-note",
    "pending-send-followup-approval-request",
    "unresolved-question-list"
  ],
  "evidence-triage": [
    "triage-dossier",
    "safe-evidence-summaries",
    "sensitive-quarantine-flags",
    "duplicate-groups",
    "assertion-candidate-bundle",
    "evidence-gap-list",
    "review-queue-suggestions"
  ],
  "timeline-builder": [
    "timeline-artifact",
    "item-level-citation-map",
    "date-precision-notes",
    "uncertainty-flags",
    "omitted-source-list",
    "unresolved-evidence-prompts"
  ],
  "contradiction-finder": [
    "contradiction-candidate-dossier",
    "paired-source-refs",
    "confidence-caveats",
    "alternative-explanations",
    "requested-followup-evidence",
    "review-queue-items"
  ],
  "investigation-planner": [
    "investigation-plan-artifact",
    "prioritized-evidence-gaps",
    "task-suggestion-bundle",
    "draft-prr-candidate-bundle",
    "risk-notes",
    "dependencies",
    "safe-next-action-list"
  ],
  "report-builder": [
    "report-outline",
    "draft-sections",
    "citation-map",
    "unresolved-risk-note",
    "excluded-evidence-list",
    "export-preview",
    "pending-export-publication-approval-request"
  ]
} satisfies Record<(typeof mvpRunTypes)[number], readonly string[]>;

describe("MVP specialist workflow descriptors", () => {
  it("describes exactly the six MVP modes without adding agent identities", () => {
    expect(specialistWorkflowDescriptors.map((descriptor) => descriptor.runType)).toEqual([...mvpRunTypes]);
    for (const descriptor of specialistWorkflowDescriptors) {
      expect(approvedAgentSpecialistRunTypes).toContain(descriptor.runType);
      expect(descriptor.executionEnabled).toBe(false);
      expect(descriptor.residentIdentity).toBe("agent_default");
      expect(JSON.stringify(descriptor)).not.toMatch(/persona|new agent|durable agent identity/i);
    }
  });

  it("keeps runtime execution fail-closed for every MVP mode", () => {
    for (const runType of mvpRunTypes) {
      expect(specialistExecutionStatusFor(runType)).toMatchObject({
        enabled: false,
        diagnosticCode: "AGENT_SPECIALIST_WORKFLOW_NOT_ENABLED"
      });
    }
  });

  it("declares context packs, prompt template, allowed tools, approvals, outputs, and failures for each mode", () => {
    for (const descriptor of specialistWorkflowDescriptors) {
      expect(descriptor.contextPacks.length).toBeGreaterThanOrEqual(5);
      expect(descriptor.contextPacks.map((pack) => pack.contextPackId)).toContain("governance-locks.v1");
      expect(descriptor.promptTemplate.promptTemplateId).toBe(expectedPromptTemplateIdsByRunType[descriptor.runType]);
      expect(descriptor.handoffSchemaId).toBe(`${descriptor.runType}-handoff.v1`);
      expect(descriptor.allowedTools.length).toBeGreaterThan(0);
      expect(descriptor.approvalRequirements.length).toBeGreaterThan(0);
      expect(descriptor.outputArtifacts.length).toBeGreaterThan(0);
      expect(descriptor.outputArtifacts.map((artifact) => artifact.artifactKind)).toEqual(
        expectedOutputArtifactKindsByRunType[descriptor.runType]
      );
      expect(descriptor.failureModes).toContain("secret-detected");
      expect(descriptor.prerequisiteContractIds).toEqual(
        expect.arrayContaining(["agent.scheduler-resumer.v1", "agent.domain-adapter.v1"])
      );
    }
  });

  it("exposes a frozen registry snapshot for browser-safe inspection", () => {
    const snapshot = specialistWorkflowRegistrySnapshot();
    const serializedSnapshot = JSON.stringify(snapshot);

    expect(snapshot.schemaVersion).toBe("agent-specialist-workflow-registry.v1");
    expect(snapshot.descriptors).toHaveLength(6);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.descriptors)).toBe(true);
    expect(serializedSnapshot).toContain("\"failureModes\"");
    expect(serializedSnapshot).toContain("\"secret-detected\"");
    expect(() => specialistWorkflowDescriptorFor("ontology-bootstrap")).toThrow(/not part of MVP workflow registry/i);
    expect(serializedSnapshot).not.toMatch(/api key|authorization|bearer|password|rawProviderError/i);
  });
});
