import { z } from "zod";
import type { OntologyWorkspaceDto } from "./ontology-types.js";

const diagnosticTextSchema = z.string().min(1).refine(
  (value) => !/api[_ -]?key|authorization|bearer|password|secret|oauth|credential|cookie\s*:|session\s*=/i.test(value),
  { message: "diagnostic text must not contain credential-shaped material" }
);

const packVersionSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1)
}).strict();

const assertionSchema = z.object({
  assertionId: z.string().regex(/^as_[a-zA-Z0-9_-]+$/),
  reviewState: z.enum(["proposed", "accepted"]),
  subjectRef: z.string().min(1).optional(),
  predicate: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  eventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)),
  packVersions: z.array(packVersionSchema)
}).strict();

const entitySchema = z.object({
  entityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  canonicalLabel: z.string().min(1),
  entityType: z.string().min(1),
  reviewState: z.literal("accepted"),
  supportingAssertionIds: z.array(z.string().regex(/^as_[a-zA-Z0-9_-]+$/)),
  evidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)),
  eventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)),
  packVersions: z.array(packVersionSchema)
}).strict();

const relationshipSchema = z.object({
  relationshipId: z.string().regex(/^rel_[a-zA-Z0-9_-]+$/),
  fromEntityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  toEntityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  relationshipType: z.string().min(1),
  reviewState: z.literal("accepted"),
  supportingAssertionIds: z.array(z.string().regex(/^as_[a-zA-Z0-9_-]+$/)),
  contradictingAssertionIds: z.array(z.string().regex(/^as_[a-zA-Z0-9_-]+$/)),
  evidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)),
  eventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)),
  packVersions: z.array(packVersionSchema)
}).strict();

const diagnosticSchema = z.object({
  code: z.enum(["projection-lag", "unknown-event", "missing-provenance", "ledger-unavailable"]),
  severity: z.enum(["warning", "error"]),
  message: diagnosticTextSchema,
  repairActions: z.array(diagnosticTextSchema).min(1)
}).strict();

const ontologyWorkspaceSchema = z.object({
  schemaVersion: z.literal("ontology-workspace.v1"),
  status: z.enum(["ready", "degraded"]),
  sourceHighWaterMark: z.number().int().nonnegative(),
  entities: z.array(entitySchema),
  relationships: z.array(relationshipSchema),
  assertions: z.array(assertionSchema),
  diagnostics: z.array(diagnosticSchema)
}).strict();

export interface OntologyWorkspaceAdapter {
  loadWorkspace(): Promise<OntologyWorkspaceDto>;
}

export function ontologyWorkspaceDtoFromJson(value: unknown): OntologyWorkspaceDto {
  return deepFreeze(ontologyWorkspaceSchema.parse(value) as OntologyWorkspaceDto);
}

export const httpOntologyWorkspaceAdapter: OntologyWorkspaceAdapter = Object.freeze({
  async loadWorkspace() {
    const response = await fetch("/api/ontology/workspace", {
      method: "GET",
      headers: { accept: "application/json" }
    });
    const value: unknown = await response.json();
    if (!response.ok) {
      const parsed = ontologyWorkspaceSchema.safeParse(value);
      const message = parsed.success
        ? parsed.data.diagnostics[0]?.message
        : undefined;
      throw new Error(message ?? "Ontology workspace could not be loaded safely.");
    }
    return ontologyWorkspaceDtoFromJson(value);
  }
});

export function createStaticOntologyWorkspaceAdapter(
  workspace: OntologyWorkspaceDto
): OntologyWorkspaceAdapter {
  const snapshot = ontologyWorkspaceDtoFromJson(structuredClone(workspace));
  return Object.freeze({
    async loadWorkspace() {
      return deepFreeze(structuredClone(snapshot));
    }
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
