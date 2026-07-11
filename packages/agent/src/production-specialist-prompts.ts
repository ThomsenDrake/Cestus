import { createHash } from "node:crypto";
import type { AgentSpecialistRunType } from "./specialists.js";
export { validateProductionSpecialistProviderOutput, type ProductionSpecialistProviderOutput } from "./production-specialist-output-contracts.js";

type ProductionRunType = Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
export type ProductionContextRequirementMode = "always" | "when-scope-associated-prr";
export type ProductionPromptOmissionCategory = "context-budget" | "policy-redaction" | "raw-content-local-only" | "quarantine-or-lock" | "optional-pack-unavailable" | "no-associated-prr";

export interface ProductionContextRequirement { readonly contextPackId: string; readonly order: number; readonly requirementMode: ProductionContextRequirementMode; readonly omissionWhenNotApplicable?: "no-associated-prr"; }
export interface ProductionSpecialistPromptRegistration {
  readonly runType: ProductionRunType; readonly promptTemplateId: string; readonly promptTemplateVersion: 1; readonly rendererId: string; readonly rendererVersion: 1; readonly rendererHash: `sha256:${string}`;
  readonly providerOutputSchemaId: string; readonly providerOutputSchemaVersion: 1; readonly handoffSchemaId: string; readonly handoffSchemaVersion: 1; readonly contextRequirements: readonly ProductionContextRequirement[]; readonly allowedOmissions: readonly ProductionPromptOmissionCategory[];
  readonly safetyClass: "provider-approved"; readonly transferApprovalClass: "provider-byte-transfer";
}

const allowedOmissions = Object.freeze(["context-budget", "policy-redaction", "raw-content-local-only", "quarantine-or-lock", "optional-pack-unavailable", "no-associated-prr"] as const);
const conditionalPrr = (order: number): ProductionContextRequirement => Object.freeze({ contextPackId: "prr-read-model.v1", order, requirementMode: "when-scope-associated-prr", omissionWhenNotApplicable: "no-associated-prr" });
const always = (contextPackIds: readonly string[]): readonly ProductionContextRequirement[] => Object.freeze(contextPackIds.map((contextPackId, order) => Object.freeze({ contextPackId, order, requirementMode: "always" as const })));

const definitions: readonly Omit<ProductionSpecialistPromptRegistration, "rendererHash">[] = Object.freeze([
  definition("prr-negotiation", "prr-negotiation.review.v1", "prr-negotiation.review-output.v1", always(["prr-read-model.v1", "jurisdiction-pack-summary.v1", "governance-locks.v1", "evidence-summary.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"])),
  definition("evidence-triage", "evidence-triage.classify.v1", "evidence-triage.classify-output.v1", withConditionalPrr(["evidence-summary.v1", "governance-locks.v1", "accepted-graph-projection.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"])),
  definition("timeline-builder", "timeline-builder.sourced-timeline.v1", "timeline-builder.sourced-timeline-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"])),
  definition("contradiction-finder", "contradiction-finder.candidates.v1", "contradiction-finder.candidates-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "timeline-draft-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"])),
  definition("investigation-planner", "investigation-planner.next-steps.v1", "investigation-planner.next-steps-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "timeline-draft-summary.v1", "contradiction-candidate-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"])),
  definition("report-builder", "report-builder.packet-draft.v1", "report-builder.packet-draft-output.v1", withConditionalPrr(["accepted-graph-projection.v1", "evidence-summary.v1", "timeline-draft-summary.v1", "contradiction-candidate-summary.v1", "governance-locks.v1", "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"]))
]);

export const productionSpecialistPromptRegistrations: readonly ProductionSpecialistPromptRegistration[] = Object.freeze(definitions.map((definition) => Object.freeze({ ...definition, rendererHash: hashCanonicalRendererMaterial(definition) })));
const registrationByRunType = new Map<ProductionRunType, ProductionSpecialistPromptRegistration>(productionSpecialistPromptRegistrations.map((registration) => [registration.runType, registration]));

export function productionSpecialistPromptRegistrationFor(runType: ProductionRunType): ProductionSpecialistPromptRegistration {
  const registration = registrationByRunType.get(runType);
  if (registration === undefined) throw new Error(`No production specialist prompt registration for ${runType}`);
  return registration;
}

function definition(runType: ProductionRunType, promptTemplateId: string, providerOutputSchemaId: string, contextRequirements: readonly ProductionContextRequirement[]): Omit<ProductionSpecialistPromptRegistration, "rendererHash"> {
  return Object.freeze({ runType, promptTemplateId, promptTemplateVersion: 1, rendererId: `${runType}.renderer.v1`, rendererVersion: 1, providerOutputSchemaId, providerOutputSchemaVersion: 1, handoffSchemaId: `${runType}-handoff.v1`, handoffSchemaVersion: 1, contextRequirements, allowedOmissions, safetyClass: "provider-approved", transferApprovalClass: "provider-byte-transfer" });
}

function withConditionalPrr(alwaysPacks: readonly string[]): readonly ProductionContextRequirement[] {
  const requirements = always(alwaysPacks).map((requirement) => ({ ...requirement }));
  requirements.push(conditionalPrr(requirements.length));
  return Object.freeze(requirements.map((requirement) => Object.freeze(requirement)));
}

function hashCanonicalRendererMaterial(registration: Omit<ProductionSpecialistPromptRegistration, "rendererHash">): `sha256:${string}` {
  const material = { rendererPolicyVersion: 1, payloadRenderingPolicy: "registered-provider-safe-payload-fields-v1", contextOrderingPolicy: "registration-order-v1", omissionPolicy: "registered-bounded-omissions-v1", staticTemplateSections: ["return-registered-json-only", "output-is-advisory-not-authority", "report-uncertainty-and-required-review"], registration };
  return `sha256:${createHash("sha256").update(stableJson(material)).digest("hex")}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
