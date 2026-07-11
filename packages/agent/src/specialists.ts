import { specialistWorkflowDescriptorFor } from "./specialist-workflows.js";

export const approvedAgentSpecialistRunTypes = Object.freeze([
  "ontology-bootstrap",
  "prr-negotiation",
  "evidence-triage",
  "timeline-builder",
  "contradiction-finder",
  "investigation-planner",
  "report-builder"
] as const);

export type AgentSpecialistRunType = typeof approvedAgentSpecialistRunTypes[number];

export interface SpecialistExecutionStatus {
  readonly enabled: false;
  readonly diagnosticCode: "AGENT_SPECIALIST_WORKFLOW_NOT_ENABLED";
  readonly registeredWorkflowMode: boolean;
  readonly residentAgentId: "agent_default";
  readonly executionReady: false;
  readonly prerequisiteContractIds: readonly string[];
  readonly requiredContextPackIds: readonly string[];
  readonly alwaysContextPackIds: readonly string[];
  readonly conditionalContextPackIds: readonly string[];
  readonly missingExecutionCapabilities: readonly string[];
  readonly allowedRepairActions: readonly string[];
}

const baseRepairActions = Object.freeze([
  "review the approved resident-agent foundation",
  "create a focused specialist implementation plan"
] as const);

export function specialistExecutionStatusFor(runType: string): SpecialistExecutionStatus {
  try {
    const descriptor = specialistWorkflowDescriptorFor(runType as AgentSpecialistRunType);
    const prerequisiteContractIds = Object.freeze([...descriptor.prerequisiteContractIds]);
    const requiredContextPackIds = Object.freeze(descriptor.contextPacks.map((pack) => pack.contextPackId));
    const alwaysContextPackIds = Object.freeze(descriptor.contextPacks
      .filter((pack) => pack.requirementMode === "always")
      .map((pack) => pack.contextPackId));
    const conditionalContextPackIds = Object.freeze(descriptor.contextPacks
      .filter((pack) => pack.requirementMode === "when-scope-associated-prr")
      .map((pack) => pack.contextPackId));

    return Object.freeze({
      enabled: false,
      diagnosticCode: "AGENT_SPECIALIST_WORKFLOW_NOT_ENABLED",
      registeredWorkflowMode: true,
      residentAgentId: "agent_default",
      executionReady: false,
      prerequisiteContractIds,
      requiredContextPackIds,
      alwaysContextPackIds,
      conditionalContextPackIds,
      missingExecutionCapabilities: Object.freeze([
        "specialist workflow runner",
        "model provider readiness",
        "domain adapter readiness"
      ]),
      allowedRepairActions: Object.freeze([
        ...baseRepairActions,
        `wire specialist workflow readiness for ${prerequisiteContractIds.join(", ")}`,
        `construct required context packs: ${requiredContextPackIds.join(", ")}`,
        "keep specialist execution disabled until a scheduler/resumer invokes an approved workflow runner"
      ])
    });
  } catch {
    return unregisteredSpecialistStatus();
  }
}

function unregisteredSpecialistStatus(): SpecialistExecutionStatus {
  return Object.freeze({
    enabled: false,
    diagnosticCode: "AGENT_SPECIALIST_WORKFLOW_NOT_ENABLED",
    registeredWorkflowMode: false,
    residentAgentId: "agent_default",
    executionReady: false,
    prerequisiteContractIds: Object.freeze([]),
    requiredContextPackIds: Object.freeze([]),
    alwaysContextPackIds: Object.freeze([]),
    conditionalContextPackIds: Object.freeze([]),
    missingExecutionCapabilities: Object.freeze([
      "specialist workflow descriptor",
      "specialist workflow runner",
      "model provider readiness",
      "domain adapter readiness"
    ]),
    allowedRepairActions: Object.freeze([
      ...baseRepairActions,
      "select one of the registered MVP specialist workflow modes before wiring workflow execution"
    ])
  });
}
