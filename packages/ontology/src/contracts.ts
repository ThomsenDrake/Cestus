import { z } from "zod";

export const actorRefSchema = z.object({
  id: z.string().min(3),
  kind: z.enum(["human", "extractor", "system"]),
  label: z.string().min(1)
});

export const eventContextSchema = z.object({
  actor: actorRefSchema,
  occurredAt: z.string().datetime(),
  causationId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/).optional(),
  correlationId: z.string().min(3),
  coreVersion: z.string().min(1),
  packVersions: z.record(z.string(), z.string())
});

export const sourceRefSchema = z.object({
  kind: z.enum(["file", "url", "dataset", "message", "annotation", "manual"]),
  label: z.string().min(1),
  uri: z.string().optional()
});

const evidenceIngestedPayloadSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  source: sourceRefSchema,
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  mediaType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative()
});

const assertionProposedPayloadSchema = z.object({
  assertionId: z.string().regex(/^as_[a-zA-Z0-9_-]+$/),
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  subjectRef: z.string().optional(),
  predicate: z.string().min(1),
  object: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  reviewState: z.literal("proposed")
});

const assertionAcceptedPayloadSchema = z.object({
  assertionId: z.string().regex(/^as_[a-zA-Z0-9_-]+$/),
  acceptedBy: z.string().min(3),
  rationale: z.string().min(1)
});

const entityResolvedPayloadSchema = z.object({
  entityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  assertionIds: z.array(z.string().regex(/^as_[a-zA-Z0-9_-]+$/)).min(1),
  canonicalLabel: z.string().min(1),
  entityType: z.string().min(1)
});

const relationshipAcceptedPayloadSchema = z.object({
  relationshipId: z.string().regex(/^rel_[a-zA-Z0-9_-]+$/),
  fromEntityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  toEntityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  relationshipType: z.string().min(1),
  assertionIds: z.array(z.string().regex(/^as_[a-zA-Z0-9_-]+$/)).min(1)
});

const claimCreatedPayloadSchema = z.object({
  claimId: z.string().regex(/^cl_[a-zA-Z0-9_-]+$/),
  investigationId: z.string().regex(/^inv_[a-zA-Z0-9_-]+$/),
  statement: z.string().min(1)
});

const diagnosticRecordedPayloadSchema = z.object({
  diagnosticId: z.string().regex(/^diag_[a-zA-Z0-9_-]+$/),
  severity: z.enum(["info", "warning", "error"]),
  category: z.enum(["ingestion", "validation", "projection", "migration", "deduplication"]),
  message: z.string().min(1),
  repairHint: z.object({
    contract: z.string().min(1),
    violatedPath: z.string().min(1),
    allowedActions: z.array(z.string().min(1)).min(1)
  })
});

const ontologyPackInstalledPayloadSchema = z.object({
  packName: z.string().min(1),
  packVersion: z.string().min(1),
  scope: z.enum(["core", "org", "investigation"])
});

const projectionCheckpointedPayloadSchema = z.object({
  projectionName: z.string().min(1),
  highWaterMark: z.number().int().nonnegative(),
  status: z.enum(["ready", "rebuilding", "failed"])
});

export const payloadSchemas = {
  "evidence.ingested": evidenceIngestedPayloadSchema,
  "assertion.proposed": assertionProposedPayloadSchema,
  "assertion.accepted": assertionAcceptedPayloadSchema,
  "entity.resolved": entityResolvedPayloadSchema,
  "relationship.accepted": relationshipAcceptedPayloadSchema,
  "claim.created": claimCreatedPayloadSchema,
  "diagnostic.recorded": diagnosticRecordedPayloadSchema,
  "ontology.pack.installed": ontologyPackInstalledPayloadSchema,
  "projection.checkpointed": projectionCheckpointedPayloadSchema
} as const;

export type KnowledgeEventType = keyof typeof payloadSchemas;

type PayloadByEventType = {
  [Type in KnowledgeEventType]: z.infer<(typeof payloadSchemas)[Type]>;
};

export interface EventContract {
  type: KnowledgeEventType;
  version: 1;
  description: string;
  agentGuidance: string;
  invariants: string[];
}

export const eventContracts: Record<KnowledgeEventType, EventContract> = {
  "evidence.ingested": {
    type: "evidence.ingested",
    version: 1,
    description: "Records that raw evidence entered Cestus with source metadata and a content hash.",
    agentGuidance: "Use this before any assertion is proposed. Store large payloads outside the ledger and reference them by hash.",
    invariants: ["contentHash must be sha256", "evidenceId must be stable"]
  },
  "assertion.proposed": {
    type: "assertion.proposed",
    version: 1,
    description: "Records a candidate fact extracted or written from evidence before human or policy review.",
    agentGuidance: "Never create this without evidenceId. Use reviewState proposed and let review events promote it.",
    invariants: ["evidenceId is required", "confidence is between 0 and 1"]
  },
  "assertion.accepted": {
    type: "assertion.accepted",
    version: 1,
    description: "Records review acceptance of a previously proposed assertion.",
    agentGuidance: "Use this only when a reviewer or trusted policy accepts a specific assertion.",
    invariants: ["assertionId must reference a proposed assertion", "rationale is required"]
  },
  "entity.resolved": {
    type: "entity.resolved",
    version: 1,
    description: "Records that assertions resolve into a durable shared entity.",
    agentGuidance: "Use after evidence-backed assertions justify the entity identity.",
    invariants: ["at least one assertionId is required"]
  },
  "relationship.accepted": {
    type: "relationship.accepted",
    version: 1,
    description: "Records an accepted relationship between two resolved entities.",
    agentGuidance: "Use only when relationship evidence is represented by accepted assertions.",
    invariants: ["fromEntityId and toEntityId are required", "assertionIds cannot be empty"]
  },
  "claim.created": {
    type: "claim.created",
    version: 1,
    description: "Records an investigation-specific claim or hypothesis.",
    agentGuidance: "Use claims for uncertain or investigation-local reasoning instead of polluting shared graph truth.",
    invariants: ["investigationId is required", "statement is required"]
  },
  "diagnostic.recorded": {
    type: "diagnostic.recorded",
    version: 1,
    description: "Records structured operational or investigative diagnostics tied to ontology work.",
    agentGuidance: "Use when validation, ingestion, projection, migration, or deduplication produces inspectable failure state.",
    invariants: ["repairHint must include allowed actions"]
  },
  "ontology.pack.installed": {
    type: "ontology.pack.installed",
    version: 1,
    description: "Records installation of a core, organization, or investigation ontology pack.",
    agentGuidance: "Use for governed ontology changes. Do not mutate pack scope silently.",
    invariants: ["packName and packVersion are required"]
  },
  "projection.checkpointed": {
    type: "projection.checkpointed",
    version: 1,
    description: "Records projection high-water mark and rebuild status.",
    agentGuidance: "Use to make projection state inspectable and rebuildable from the ledger.",
    invariants: ["highWaterMark cannot be negative"]
  }
};

interface KnowledgeEventBase<Type extends KnowledgeEventType> {
  id: string;
  type: Type;
  version: 1;
  streamId: string;
  sequence: number;
  context: z.infer<typeof eventContextSchema>;
  payload: PayloadByEventType[Type];
}

export type KnowledgeEvent = {
  [Type in KnowledgeEventType]: KnowledgeEventBase<Type>;
}[KnowledgeEventType];

const knowledgeEventBaseSchema = z.object({
  id: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/),
  type: z.custom<KnowledgeEventType>((value) => typeof value === "string" && value in payloadSchemas),
  version: z.literal(1),
  streamId: z.string().min(3),
  sequence: z.number().int().positive(),
  context: eventContextSchema,
  payload: z.record(z.string(), z.unknown())
});

export const knowledgeEventSchema = knowledgeEventBaseSchema
  .superRefine((event, ctx) => {
    const payloadSchema = payloadSchemas[event.type] as z.ZodType<unknown>;
    const payload = payloadSchema.safeParse(event.payload);

    if (!payload.success) {
      for (const issue of payload.error.issues) {
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: ["payload", ...issue.path]
        });
      }
    }
  })
  .transform((event): KnowledgeEvent => event as KnowledgeEvent);

export function validateKnowledgeEvent(event: unknown) {
  return knowledgeEventSchema.safeParse(event);
}
