import type { AgentSpecialistRunType } from "./specialists.js";

export type ProductionRunType = Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
export type ProductionContextRequirementMode = "always" | "when-scope-associated-prr";
export type ProductionPromptOmissionCategory =
  | "context-budget"
  | "policy-redaction"
  | "raw-content-local-only"
  | "quarantine-or-lock"
  | "optional-pack-unavailable"
  | "no-associated-prr";

export interface ProductionContextRequirement {
  readonly contextPackId: string;
  readonly order: number;
  readonly requirementMode: ProductionContextRequirementMode;
  readonly omissionWhenNotApplicable?: "no-associated-prr";
}

export interface ProductionRunScope {
  readonly kind: string;
  readonly refs: readonly string[];
  readonly associatedPrrRequestId?: string;
}

export interface ProductionSpecialistPromptRegistration {
  readonly runType: ProductionRunType;
  readonly promptTemplateId: string;
  readonly promptTemplateVersion: 1;
  readonly rendererId: string;
  readonly rendererVersion: 1;
  readonly rendererHash: `sha256:${string}`;
  readonly providerOutputSchemaId: string;
  readonly providerOutputSchemaVersion: 1;
  readonly handoffSchemaId: string;
  readonly handoffSchemaVersion: 1;
  readonly contextRequirements: readonly ProductionContextRequirement[];
  readonly allowedOmissions: readonly ProductionPromptOmissionCategory[];
  readonly safetyClass: "provider-approved";
  readonly transferApprovalClass: "provider-byte-transfer";
}

const standardAllowedOmissions = Object.freeze([
  "context-budget",
  "policy-redaction",
  "raw-content-local-only",
  "quarantine-or-lock",
  "optional-pack-unavailable"
] as const);
const conditionalPrrAllowedOmissions = Object.freeze([...standardAllowedOmissions, "no-associated-prr"] as const);

const always = (contextPackIds: readonly string[]): readonly ProductionContextRequirement[] => Object.freeze(
  contextPackIds.map((contextPackId, order) => Object.freeze({ contextPackId, order, requirementMode: "always" as const }))
);

const withConditionalPrr = (contextPackIds: readonly string[]): readonly ProductionContextRequirement[] => Object.freeze([
  ...always(contextPackIds),
  Object.freeze({
    contextPackId: "prr-read-model.v1",
    order: contextPackIds.length,
    requirementMode: "when-scope-associated-prr" as const,
    omissionWhenNotApplicable: "no-associated-prr" as const
  })
]);

const registration = (
  runType: ProductionRunType,
  promptTemplateId: string,
  providerOutputSchemaId: string,
  contextRequirements: readonly ProductionContextRequirement[],
  allowedOmissions: readonly ProductionPromptOmissionCategory[],
  rendererHash: `sha256:${string}`
): ProductionSpecialistPromptRegistration => Object.freeze({
  runType,
  promptTemplateId,
  promptTemplateVersion: 1,
  rendererId: `${runType}.renderer.v1`,
  rendererVersion: 1,
  rendererHash,
  providerOutputSchemaId,
  providerOutputSchemaVersion: 1,
  handoffSchemaId: `${runType}-handoff.v1`,
  handoffSchemaVersion: 1,
  contextRequirements,
  allowedOmissions,
  safetyClass: "provider-approved",
  transferApprovalClass: "provider-byte-transfer"
});

export const productionSpecialistPromptRegistrations: readonly ProductionSpecialistPromptRegistration[] = Object.freeze([
  registration("prr-negotiation", "prr-negotiation.review.v1", "prr-negotiation.review-output.v1", always(["prr-read-model.v1", "jurisdiction-pack-summary.v1", "governance-locks.v1", "evidence-summary.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), standardAllowedOmissions, "sha256:1fc04f394fc681527d7827e006b41e48a9792e54dc30411b20cba07022c93368"),
  registration("evidence-triage", "evidence-triage.classify.v1", "evidence-triage.classify-output.v1", withConditionalPrr(["evidence-summary.v1", "governance-locks.v1", "accepted-graph-projection.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:25f33a46d3b5230885b7d7606f65789879b8f1c97b98b40e8077c5127eba8ef1"),
  registration("timeline-builder", "timeline-builder.sourced-timeline.v1", "timeline-builder.sourced-timeline-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:8eaf54c9cbaa021a70a974eca24cbb19cb395c2b5271d1d1ed6be976c9429a03"),
  registration("contradiction-finder", "contradiction-finder.candidates.v1", "contradiction-finder.candidates-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "timeline-draft-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:a160b0e735c3482a7bd91f3fc9a9c8f93590c83e630b6c4c3c5b9adcc4c0a13b"),
  registration("investigation-planner", "investigation-planner.next-steps.v1", "investigation-planner.next-steps-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "timeline-draft-summary.v1", "contradiction-candidate-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:14fc751b27f79295cd484a392fd051dc23ab7d802c288ecf1c62afdf190333bb"),
  registration("report-builder", "report-builder.packet-draft.v1", "report-builder.packet-draft-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "timeline-draft-summary.v1", "contradiction-candidate-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:71d22bd7cc2697956438e1555e772a1c6e6ed52fcbc0eb1693a14bb9d4349512")
]);

const registrationByRunType = new Map(productionSpecialistPromptRegistrations.map((value) => [value.runType, value]));

export function productionSpecialistPromptRegistrationFor(runType: ProductionRunType): ProductionSpecialistPromptRegistration {
  const value = registrationByRunType.get(runType);
  if (value === undefined) throw new Error(`No production specialist prompt registration for ${runType}`);
  return value;
}
