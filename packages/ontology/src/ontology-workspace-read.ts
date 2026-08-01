import {
  validateKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "./contracts.js";
import { buildGraphProjection } from "./graph-projection.js";

export interface OntologyPackVersionDto {
  readonly name: string;
  readonly version: string;
}

export interface OntologyAssertionReadDto {
  readonly assertionId: string;
  readonly reviewState: "proposed" | "accepted";
  readonly subjectRef?: string;
  readonly predicate: string;
  readonly confidence: number;
  readonly evidenceId: string;
  readonly eventIds: readonly string[];
  readonly packVersions: readonly OntologyPackVersionDto[];
}

export interface OntologyEntityReadDto {
  readonly entityId: string;
  readonly canonicalLabel: string;
  readonly entityType: string;
  readonly reviewState: "accepted";
  readonly supportingAssertionIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly packVersions: readonly OntologyPackVersionDto[];
}

export interface OntologyRelationshipReadDto {
  readonly relationshipId: string;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly relationshipType: string;
  readonly reviewState: "accepted";
  readonly supportingAssertionIds: readonly string[];
  readonly contradictingAssertionIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly packVersions: readonly OntologyPackVersionDto[];
}

export interface OntologyReadDiagnosticDto {
  readonly code: "projection-lag" | "unknown-event" | "missing-provenance" | "ledger-unavailable";
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly repairActions: readonly string[];
}

export interface OntologyWorkspaceReadDto {
  readonly schemaVersion: "ontology-workspace.v1";
  readonly status: "ready" | "degraded";
  readonly sourceHighWaterMark: number;
  readonly entities: readonly OntologyEntityReadDto[];
  readonly relationships: readonly OntologyRelationshipReadDto[];
  readonly assertions: readonly OntologyAssertionReadDto[];
  readonly diagnostics: readonly OntologyReadDiagnosticDto[];
}

const ontologySourceEventTypes = new Set<KnowledgeEvent["type"]>([
  "evidence.ingested",
  "assertion.proposed",
  "assertion.accepted",
  "entity.resolved",
  "relationship.accepted",
  "ontology.pack.installed"
]);

export function buildOntologyWorkspaceReadDto(input: readonly unknown[]): OntologyWorkspaceReadDto {
  const events: KnowledgeEvent[] = [];

  for (const candidate of input) {
    const parsed = validateKnowledgeEvent(candidate);
    if (!parsed.success) {
      return degradedReadDto(input.length, [unknownEventDiagnostic()]);
    }
    events.push(parsed.data);
  }

  if (hasProjectionLag(events)) {
    return degradedReadDto(events.length, [projectionLagDiagnostic()]);
  }

  const diagnostics: OntologyReadDiagnosticDto[] = [];
  const graph = buildGraphProjection(events);
  const evidenceEvents = new Map<string, KnowledgeEventOf<"evidence.ingested">>();
  const proposals = new Map<string, KnowledgeEventOf<"assertion.proposed">>();
  const acceptances = new Map<string, KnowledgeEventOf<"assertion.accepted">>();

  for (const event of events) {
    if (event.type === "evidence.ingested") {
      evidenceEvents.set(event.payload.evidenceId, event);
    } else if (event.type === "assertion.proposed") {
      proposals.set(event.payload.assertionId, event);
    } else if (event.type === "assertion.accepted") {
      const proposal = proposals.get(event.payload.assertionId);
      if (proposal !== undefined && event.context.causationId === proposal.id) {
        acceptances.set(event.payload.assertionId, event);
      } else {
        diagnostics.push(missingProvenanceDiagnostic("An assertion acceptance was omitted because its proposal provenance is incomplete."));
      }
    }
  }

  const assertions = [...proposals.values()]
    .sort((left, right) => left.payload.assertionId.localeCompare(right.payload.assertionId))
    .map((proposal): OntologyAssertionReadDto => {
      const evidence = evidenceEvents.get(proposal.payload.evidenceId);
      const accepted = acceptances.get(proposal.payload.assertionId);
      const evidenceIsBound = evidence !== undefined && proposal.context.causationId === evidence.id;

      if (!evidenceIsBound) {
        diagnostics.push(missingProvenanceDiagnostic("An assertion was omitted from accepted truth because its evidence event provenance is incomplete."));
      }

      const reviewState = accepted !== undefined && evidenceIsBound ? "accepted" : "proposed";
      const relatedEvents = [evidence, proposal, reviewState === "accepted" ? accepted : undefined]
        .filter((event): event is
          | KnowledgeEventOf<"evidence.ingested">
          | KnowledgeEventOf<"assertion.proposed">
          | KnowledgeEventOf<"assertion.accepted"> => event !== undefined);

      return {
        assertionId: proposal.payload.assertionId,
        reviewState,
        ...(proposal.payload.subjectRef === undefined ? {} : { subjectRef: proposal.payload.subjectRef }),
        predicate: proposal.payload.predicate,
        confidence: proposal.payload.confidence,
        evidenceId: proposal.payload.evidenceId,
        eventIds: sortedUnique(relatedEvents.map((event) => event.id)),
        packVersions: packVersionsFor(relatedEvents)
      };
    });
  const assertionById = new Map(assertions.map((assertion) => [assertion.assertionId, assertion]));
  const acceptedAssertionIds = new Set(
    assertions.filter((assertion) => assertion.reviewState === "accepted").map((assertion) => assertion.assertionId)
  );

  const entityEvents = events.filter(
    (event): event is KnowledgeEventOf<"entity.resolved"> => event.type === "entity.resolved"
  );
  const entities: OntologyEntityReadDto[] = [];
  for (const event of entityEvents) {
    const projected = graph.entities.get(event.payload.entityId);
    if (
      projected === undefined ||
      !event.payload.assertionIds.every((assertionId) => acceptedAssertionIds.has(assertionId))
    ) {
      diagnostics.push(missingProvenanceDiagnostic("A resolved entity was omitted because accepted assertion provenance is incomplete."));
      continue;
    }

    const supportingAssertions = projected.assertionIds
      .map((assertionId) => assertionById.get(assertionId))
      .filter((assertion): assertion is OntologyAssertionReadDto => assertion !== undefined);
    entities.push({
      entityId: projected.entityId,
      canonicalLabel: projected.canonicalLabel,
      entityType: projected.entityType,
      reviewState: "accepted",
      supportingAssertionIds: sortedUnique(projected.assertionIds),
      evidenceIds: sortedUnique(supportingAssertions.map((assertion) => assertion.evidenceId)),
      eventIds: sortedUnique([
        event.id,
        ...supportingAssertions.flatMap((assertion) => assertion.eventIds)
      ]),
      packVersions: mergePackVersions([
        packVersionsFor([event]),
        ...supportingAssertions.map((assertion) => assertion.packVersions)
      ])
    });
  }
  entities.sort((left, right) => left.entityId.localeCompare(right.entityId));
  const acceptedEntityIds = new Set(entities.map((entity) => entity.entityId));

  const relationshipEvents = events.filter(
    (event): event is KnowledgeEventOf<"relationship.accepted"> => event.type === "relationship.accepted"
  );
  const relationships: OntologyRelationshipReadDto[] = [];
  for (const event of relationshipEvents) {
    const projected = graph.relationships.get(event.payload.relationshipId);
    if (
      projected === undefined ||
      !acceptedEntityIds.has(event.payload.fromEntityId) ||
      !acceptedEntityIds.has(event.payload.toEntityId) ||
      !event.payload.assertionIds.every((assertionId) => acceptedAssertionIds.has(assertionId))
    ) {
      diagnostics.push(missingProvenanceDiagnostic("An accepted relationship was omitted because endpoint or assertion provenance is incomplete."));
      continue;
    }

    const referencedAssertions = projected.assertionIds
      .map((assertionId) => assertionById.get(assertionId))
      .filter((assertion): assertion is OntologyAssertionReadDto => assertion !== undefined);
    const contradictionAssertions = assertions.filter(
      (assertion) =>
        assertion.subjectRef === projected.relationshipId && isContradictionPredicate(assertion.predicate)
    );
    const supportingAssertions = referencedAssertions.filter(
      (assertion) => !isContradictionPredicate(assertion.predicate)
    );
    const allRelevantAssertions = uniqueAssertions([...referencedAssertions, ...contradictionAssertions]);

    relationships.push({
      relationshipId: projected.relationshipId,
      fromEntityId: projected.fromEntityId,
      toEntityId: projected.toEntityId,
      relationshipType: projected.relationshipType,
      reviewState: "accepted",
      supportingAssertionIds: sortedUnique(supportingAssertions.map((assertion) => assertion.assertionId)),
      contradictingAssertionIds: sortedUnique([
        ...referencedAssertions
          .filter((assertion) => isContradictionPredicate(assertion.predicate))
          .map((assertion) => assertion.assertionId),
        ...contradictionAssertions.map((assertion) => assertion.assertionId)
      ]),
      evidenceIds: sortedUnique(allRelevantAssertions.map((assertion) => assertion.evidenceId)),
      eventIds: sortedUnique([
        event.id,
        ...allRelevantAssertions.flatMap((assertion) => assertion.eventIds)
      ]),
      packVersions: packVersionsFor([event])
    });
  }
  relationships.sort((left, right) => left.relationshipId.localeCompare(right.relationshipId));

  return {
    schemaVersion: "ontology-workspace.v1",
    status: diagnostics.length === 0 ? "ready" : "degraded",
    sourceHighWaterMark: events.length,
    entities,
    relationships,
    assertions,
    diagnostics: uniqueDiagnostics(diagnostics)
  };
}

export function unavailableOntologyWorkspaceReadDto(): OntologyWorkspaceReadDto {
  return degradedReadDto(0, [{
    code: "ledger-unavailable",
    severity: "error",
    message: "The ontology ledger could not be replayed safely.",
    repairActions: ["inspect local ledger diagnostics", "retry the ontology replay"]
  }]);
}

export function invalidOntologyWorkspaceReadDto(): OntologyWorkspaceReadDto {
  return degradedReadDto(0, [unknownEventDiagnostic()]);
}

function hasProjectionLag(events: readonly KnowledgeEvent[]): boolean {
  const latestCheckpoint = [...events]
    .reverse()
    .find(
      (event): event is KnowledgeEventOf<"projection.checkpointed"> =>
        event.type === "projection.checkpointed" && event.payload.projectionName === "ontology-graph"
    );
  if (latestCheckpoint === undefined) {
    return false;
  }

  const latestOntologySourceOrdinal = events.reduce(
    (ordinal, event, index) => ontologySourceEventTypes.has(event.type) ? index + 1 : ordinal,
    0
  );
  return latestCheckpoint.payload.status !== "ready" ||
    latestCheckpoint.payload.highWaterMark < latestOntologySourceOrdinal;
}

function packVersionsFor(events: readonly KnowledgeEvent[]): OntologyPackVersionDto[] {
  const versions: OntologyPackVersionDto[][] = events.map((event) => {
    const entries = Object.entries(event.context.packVersions)
      .map(([name, version]) => ({ name, version }));
    if (!Object.hasOwn(event.context.packVersions, "core")) {
      entries.push({ name: "core", version: event.context.coreVersion });
    }
    return entries;
  });
  return mergePackVersions(versions);
}

function mergePackVersions(versionGroups: readonly (readonly OntologyPackVersionDto[])[]): OntologyPackVersionDto[] {
  const versions = new Map<string, OntologyPackVersionDto>();
  for (const version of versionGroups.flat()) {
    versions.set(`${version.name}\u0000${version.version}`, version);
  }
  return [...versions.values()].sort((left, right) =>
    left.name.localeCompare(right.name) || left.version.localeCompare(right.version)
  );
}

function uniqueAssertions(assertions: readonly OntologyAssertionReadDto[]): OntologyAssertionReadDto[] {
  return [...new Map(assertions.map((assertion) => [assertion.assertionId, assertion])).values()];
}

function isContradictionPredicate(predicate: string): boolean {
  const finalToken = predicate.toLowerCase().split(/[.:/_-]/).at(-1);
  return finalToken === "contradicts" || finalToken === "contradiction";
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function uniqueDiagnostics(diagnostics: readonly OntologyReadDiagnosticDto[]): OntologyReadDiagnosticDto[] {
  return [...new Map(diagnostics.map((diagnostic) => [
    `${diagnostic.code}\u0000${diagnostic.message}`,
    diagnostic
  ])).values()];
}

function projectionLagDiagnostic(): OntologyReadDiagnosticDto {
  return {
    code: "projection-lag",
    severity: "error",
    message: "The ontology projection is not caught up to its source ledger.",
    repairActions: ["rebuild the ontology projection from the ledger", "retry after the projection is ready"]
  };
}

function unknownEventDiagnostic(): OntologyReadDiagnosticDto {
  return {
    code: "unknown-event",
    severity: "error",
    message: "The ontology replay encountered an unknown or invalid ledger event.",
    repairActions: ["inspect the event contract version", "repair the ledger reader before replaying"]
  };
}

function missingProvenanceDiagnostic(message: string): OntologyReadDiagnosticDto {
  return {
    code: "missing-provenance",
    severity: "warning",
    message,
    repairActions: ["inspect the referenced ledger events", "rebuild after provenance is restored"]
  };
}

function degradedReadDto(
  sourceHighWaterMark: number,
  diagnostics: readonly OntologyReadDiagnosticDto[]
): OntologyWorkspaceReadDto {
  return {
    schemaVersion: "ontology-workspace.v1",
    status: "degraded",
    sourceHighWaterMark,
    entities: [],
    relationships: [],
    assertions: [],
    diagnostics: [...diagnostics]
  };
}
