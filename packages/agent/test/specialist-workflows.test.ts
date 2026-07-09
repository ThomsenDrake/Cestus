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
      expect(descriptor.promptTemplate.promptTemplateId).toBe(`${descriptor.runType}.context-pack.v1`);
      expect(descriptor.handoffSchemaId).toBe(`${descriptor.runType}-handoff.v1`);
      expect(descriptor.allowedTools.length).toBeGreaterThan(0);
      expect(descriptor.approvalRequirements.length).toBeGreaterThan(0);
      expect(descriptor.outputArtifacts.length).toBeGreaterThan(0);
      expect(descriptor.failureModes).toContain("secret-detected");
      expect(descriptor.prerequisiteContractIds).toEqual(
        expect.arrayContaining(["agent.scheduler-resumer.v1", "agent.domain-adapter.v1"])
      );
    }
  });

  it("exposes a frozen registry snapshot for browser-safe inspection", () => {
    const snapshot = specialistWorkflowRegistrySnapshot();

    expect(snapshot.schemaVersion).toBe("agent-specialist-workflow-registry.v1");
    expect(snapshot.descriptors).toHaveLength(6);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.descriptors)).toBe(true);
    expect(() => specialistWorkflowDescriptorFor("ontology-bootstrap")).toThrow(/not part of MVP workflow registry/i);
    expect(JSON.stringify(snapshot)).not.toMatch(/api key|authorization|bearer|password|secret|rawProviderError/i);
  });
});
