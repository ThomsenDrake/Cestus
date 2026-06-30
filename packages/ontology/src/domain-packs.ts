import { z } from "zod";

function textSchema(minLength: number): z.ZodString {
  return z.string().trim().min(minLength);
}

const entityTypeSchema = z.object({
  name: textSchema(1),
  description: textSchema(10)
}).strict();

const relationshipTypeSchema = z.object({
  name: textSchema(1),
  from: textSchema(1),
  to: textSchema(1),
  description: textSchema(10)
}).strict();

export const domainPackSchema = z.object({
  name: textSchema(1),
  version: textSchema(1),
  scope: z.enum(["core", "org", "investigation"]),
  description: textSchema(20),
  agentGuide: textSchema(20),
  entityTypes: z.array(entityTypeSchema),
  relationshipTypes: z.array(relationshipTypeSchema)
}).strict().superRefine((pack, ctx) => {
  const entityTypeNames = new Set<string>();
  pack.entityTypes.forEach((entityType, index) => {
    if (entityTypeNames.has(entityType.name)) {
      ctx.addIssue({
        code: "custom",
        path: ["entityTypes", index, "name"],
        message: `Duplicate entity type name "${entityType.name}".`
      });
    }
    entityTypeNames.add(entityType.name);
  });

  const relationshipTypeNames = new Set<string>();
  pack.relationshipTypes.forEach((relationshipType, index) => {
    if (relationshipTypeNames.has(relationshipType.name)) {
      ctx.addIssue({
        code: "custom",
        path: ["relationshipTypes", index, "name"],
        message: `Duplicate relationship type name "${relationshipType.name}".`
      });
    }
    relationshipTypeNames.add(relationshipType.name);
  });
});

export type DomainPack = z.infer<typeof domainPackSchema>;

export const corePack: DomainPack = domainPackSchema.parse({
  name: "core",
  version: "0.1.0",
  scope: "core",
  description:
    "Core Cestus ontology primitives required for evidence, assertions, entities, relationships, claims, investigations, packs, projections, and diagnostics.",
  agentGuide:
    "Use core primitives for provenance-first knowledge. Do not create domain-specific government concepts here; put those in org or investigation packs.",
  entityTypes: [
    { name: "Evidence", description: "A raw source artifact or extracted record with provenance." },
    { name: "Assertion", description: "A provenance-backed candidate fact or reviewed fact." },
    { name: "Entity", description: "A resolved real-world object built from assertions." },
    { name: "Claim", description: "An investigation-specific hypothesis or statement." },
    { name: "Investigation", description: "A scoped body of accountability work." },
    { name: "OntologyPack", description: "A versioned bundle of ontology contracts and agent guidance." },
    { name: "Projection", description: "A rebuildable read model derived from ledger events." }
  ],
  relationshipTypes: [
    {
      name: "supports",
      from: "Assertion",
      to: "Claim",
      description: "Links evidence-backed assertions that support a claim."
    },
    {
      name: "contradicts",
      from: "Assertion",
      to: "Claim",
      description: "Links evidence-backed assertions that contradict a claim."
    },
    {
      name: "derivedFrom",
      from: "Assertion",
      to: "Evidence",
      description: "Links assertions to source evidence."
    }
  ]
});

function formatDomainPackError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "<pack>"}: ${issue.message}`)
    .join("; ");
}

export class DomainPackRegistry {
  private readonly packs = new Map<string, DomainPack>();

  install(pack: DomainPack): void {
    const result = domainPackSchema.safeParse(pack);
    if (!result.success) {
      throw new Error(`Invalid domain pack: ${formatDomainPackError(result.error)}`);
    }

    const existing = this.packs.get(result.data.name);
    if (existing) {
      throw new Error(
        `Domain pack "${result.data.name}" is already installed at version ${existing.version}; explicit replacement is not implemented.`
      );
    }

    this.packs.set(result.data.name, structuredClone(result.data));
  }

  get(name: string): DomainPack | undefined {
    const pack = this.packs.get(name);
    return pack ? structuredClone(pack) : undefined;
  }

  sharedPacks(): DomainPack[] {
    return [...this.packs.values()]
      .filter((pack) => pack.scope !== "investigation")
      .map((pack) => structuredClone(pack));
  }
}
