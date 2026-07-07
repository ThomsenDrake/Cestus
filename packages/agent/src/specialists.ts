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

export function specialistExecutionStatusFor(_runType: AgentSpecialistRunType) {
  return Object.freeze({
    enabled: false,
    diagnosticCode: "AGENT_SPECIALIST_WORKFLOW_NOT_ENABLED",
    allowedRepairActions: Object.freeze([
      "review the approved resident-agent foundation",
      "create a focused specialist implementation plan"
    ])
  });
}
