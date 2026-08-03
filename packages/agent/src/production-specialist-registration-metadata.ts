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
  registration("prr-negotiation", "prr-negotiation.review.v1", "prr-negotiation.review-output.v1", always(["prr-read-model.v1", "jurisdiction-pack-summary.v1", "governance-locks.v1", "evidence-summary.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), standardAllowedOmissions, "sha256:675fb1eb7c558ce0c413d9b2ceba7ef958c1a6f8a7fb1be4b9caa55a9f9e5f52"),
  registration("evidence-triage", "evidence-triage.classify.v1", "evidence-triage.classify-output.v1", withConditionalPrr(["evidence-summary.v1", "governance-locks.v1", "accepted-graph-projection.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:a84c9d7ec6a05ece6e1bcb92a8fdf5213eba1dc87386fcbba4ad23f17433b507"),
  registration("timeline-builder", "timeline-builder.sourced-timeline.v1", "timeline-builder.sourced-timeline-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:6eb9b8afc645e23df527fcf8f0bf409b79d35c8b9ddd6ea1b9c9e95deae2353d"),
  registration("contradiction-finder", "contradiction-finder.candidates.v1", "contradiction-finder.candidates-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "timeline-draft-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:7c1a19d88555da99a654526729874c53747f3fec589932a776572ce2ddd12b9b"),
  registration("investigation-planner", "investigation-planner.next-steps.v1", "investigation-planner.next-steps-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "timeline-draft-summary.v1", "contradiction-candidate-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:075ad1deb2181d86d72d24d89ef048269832867bf9f448b07e86515e3f231ad3"),
  registration("report-builder", "report-builder.packet-draft.v1", "report-builder.packet-draft-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "timeline-draft-summary.v1", "contradiction-candidate-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:b8e3235737e4971842d58821688399415c29570e40bd0b4a03e976227519f509")
]);

const registrationByRunType = new Map(productionSpecialistPromptRegistrations.map((value) => [value.runType, value]));

export function productionSpecialistPromptRegistrationFor(runType: ProductionRunType): ProductionSpecialistPromptRegistration {
  const value = registrationByRunType.get(runType);
  if (value === undefined) throw new Error(`No production specialist prompt registration for ${runType}`);
  return value;
}
