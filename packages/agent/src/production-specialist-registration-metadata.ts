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
  registration("prr-negotiation", "prr-negotiation.review.v1", "prr-negotiation.review-output.v1", always(["prr-read-model.v1", "jurisdiction-pack-summary.v1", "governance-locks.v1", "evidence-summary.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), standardAllowedOmissions, "sha256:bbb713ee2d6c6c3637da3014a80b3d53bf04d02653d7f392794655cf2d06d1d7"),
  registration("evidence-triage", "evidence-triage.classify.v1", "evidence-triage.classify-output.v1", withConditionalPrr(["evidence-summary.v1", "governance-locks.v1", "accepted-graph-projection.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:08283aa3243a1371052d20742759bb1ca12acaf9dcc79f65acc104d2e19c531c"),
  registration("timeline-builder", "timeline-builder.sourced-timeline.v1", "timeline-builder.sourced-timeline-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:7b63da45c8f05eaacadac237ea0c06d543c028716413a97e2aaf994e81b7e2aa"),
  registration("contradiction-finder", "contradiction-finder.candidates.v1", "contradiction-finder.candidates-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "timeline-draft-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:3752664f3a5280b00529fceb687d49bcee85d59052dd9ee1ca414d2534b51fbe"),
  registration("investigation-planner", "investigation-planner.next-steps.v1", "investigation-planner.next-steps-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "timeline-draft-summary.v1", "contradiction-candidate-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:9bbba0fdb4d44c9bcbcb9a1931050a1071e7a4ad02fb1f05b0d797a014afc138"),
  registration("report-builder", "report-builder.packet-draft.v1", "report-builder.packet-draft-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "timeline-draft-summary.v1", "contradiction-candidate-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]), conditionalPrrAllowedOmissions, "sha256:626bbcbc3b8524908316e8312c213a06ff479ab20166722a20e967cb29fe7d9b")
]);

const registrationByRunType = new Map(productionSpecialistPromptRegistrations.map((value) => [value.runType, value]));

export function productionSpecialistPromptRegistrationFor(runType: ProductionRunType): ProductionSpecialistPromptRegistration {
  const value = registrationByRunType.get(runType);
  if (value === undefined) throw new Error(`No production specialist prompt registration for ${runType}`);
  return value;
}
