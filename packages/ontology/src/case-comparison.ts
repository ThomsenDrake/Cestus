import type { DateNormalization } from "./knowledge-dates.js";
import { createHash } from "node:crypto";
import type {
  KnowledgeCitation,
  KnowledgeProposal,
  KnowledgeValue,
} from "./knowledge-contracts.js";
import type {
  KnowledgeWorkspaceDto,
  ReviewedKnowledgeProposal,
} from "./knowledge-projection.js";

export interface ComparisonAssertion {
  assertionId: string;
  kind: KnowledgeProposal["kind"];
  predicate: string;
  value: KnowledgeValue;
  schemaId: string;
  caseIds: string[];
  entityId?: string;
  subjectEntityId?: string;
  objectEntityId?: string;
  occurrenceId?: string;
  participants: { role: string; entityId: string }[];
  attributes?: KnowledgeProposal["attributes"];
  occurredTime?: KnowledgeProposal["occurredTime"];
  publicationTime?: KnowledgeProposal["publicationTime"];
  citationIndices: number[];
}
export interface ComparisonCandidate {
  kind:
    | "shared_identity"
    | "relationship_structure"
    | "event_structure"
    | "event_sequence";
  signature: string;
  caseIds: string[];
  assertionIds: string[];
  entityIds: string[];
  citationIndices: number[];
  independentSourceCount: number;
  sourceIndependence: "known" | "uncertain";
  limitations: string[];
}
export interface CaseComparisonContext {
  version: "case-comparison.v1";
  fingerprint: string;
  scope: {
    selection: "all" | "explicit";
    comparedCaseIds: string[];
    unexaminedEligibleCaseIds: string[];
    uniquePassageCount: number;
    limits: {
      cases: number;
      assertions: number;
      uniquePassages: number;
      passageTextBytes: number;
      candidates: number;
    };
    coverageLimits: string[];
  };
  cases: {
    caseId: string;
    title: string;
    assertionIds: string[];
    entityIds: string[];
    relationshipAssertionIds: string[];
    occurrenceAssertionIds: string[];
  }[];
  assertions: ComparisonAssertion[];
  entities: { entityId: string; canonicalLabel: string; entityType: string }[];
  passages: {
    index: number;
    citation: KnowledgeCitation;
    lineage: {
      originId: string;
      independence: "independent" | "derived" | "unknown";
    } | null;
    duplicateGroup: string;
  }[];
  candidates: ComparisonCandidate[];
}
const LIMITS = {
  cases: 12,
  assertions: 100,
  uniquePassages: 24,
  passageTextBytes: 32 * 1024,
  candidates: 100,
};
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
const hash = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
const idsFor = (a: ComparisonAssertion) =>
  sorted(
    [
      a.entityId,
      a.subjectEntityId,
      a.objectEntityId,
      ...a.participants.map((p) => p.entityId),
    ].filter((id): id is string => Boolean(id)),
  );

/** Caller must supply an authority-filtered DTO. No access decision is inferred from membership. */
export function prepareCaseComparison(
  dto: KnowledgeWorkspaceDto,
  caseIds?: string[],
): CaseComparisonContext {
  if (caseIds && sorted(caseIds).length > LIMITS.cases)
    throw new Error("Compare at most 12 explicitly selected cases.");
  const accepted = new Map(
    dto.proposals
      .filter((p) => p.reviewState === "accepted")
      .map((p) => [p.assertionId, p]),
  );
  const bindings = new Map(
    dto.bindings
      .filter((b) => accepted.has(b.assertionId))
      .map((b) => [b.mentionId, b]),
  );
  const entities = new Map(dto.entities.map((e) => [e.entityId, e]));
  const memberships = dto.memberships.filter((m) => m.included);
  const availableCases = new Map(dto.cases.map((c) => [c.caseId, c]));
  const proposalCases = new Map<string, string[]>();
  for (const p of accepted.values()) {
    const entity = p.mentionId
      ? bindings.get(p.mentionId)?.entityId
      : undefined;
    proposalCases.set(
      p.assertionId,
      sorted(
        memberships
          .filter(
            (m) =>
              availableCases.has(m.caseId) &&
              ((m.targetKind === "knowledge" && m.targetId === p.assertionId) ||
                (m.targetKind === "evidence" &&
                  p.evidence.some((e) => e.evidenceId === m.targetId)) ||
                (m.targetKind === "entity" && m.targetId === entity)),
          )
          .map((m) => m.caseId),
      ),
    );
  }
  const eligible = sorted([...proposalCases.values()].flat());
  const compared = caseIds ? sorted(caseIds) : eligible.slice(0, LIMITS.cases);
  if (!compared.length || compared.some((id) => !eligible.includes(id)))
    throw new Error(
      "Choose eligible cases containing accepted, accessible knowledge.",
    );
  const selected = new Map(
    [...accepted].filter(([id]) =>
      proposalCases.get(id)!.some((c) => compared.includes(c)),
    ),
  );
  const usedBindings = new Map<
    string,
    KnowledgeWorkspaceDto["bindings"][number]
  >();
  function endpoint(mentionId: string): string {
    const binding = bindings.get(mentionId);
    const entity = binding && entities.get(binding.entityId);
    const supporting = binding && accepted.get(binding.assertionId);
    if (
      !binding ||
      !entity ||
      !supporting ||
      supporting.kind !== "entity" ||
      supporting.mentionId !== mentionId
    )
      throw new Error(
        "Comparison refused: an accepted endpoint binding or its cited support is unavailable. Review or narrow the case scope.",
      );
    usedBindings.set(mentionId, binding);
    selected.set(supporting.assertionId, supporting);
    return binding.entityId;
  }
  // Iterate the growing map to include every endpoint's accepted cited identity support.
  for (const p of selected.values()) {
    if (p.kind === "entity") {
      if (!p.mentionId)
        throw new Error("Comparison refused: missing entity mention binding.");
      endpoint(p.mentionId);
    }
    if ((p.kind === "relationship" || p.kind === "fact") && !p.subjectMentionId)
      throw new Error("Comparison refused: missing subject endpoint.");
    if (p.subjectMentionId) endpoint(p.subjectMentionId);
    if (p.value.type === "entity") endpoint(p.value.mentionId);
    for (const participant of p.participants ?? [])
      endpoint(participant.mentionId);
    for (const attribute of p.attributes ?? [])
      if (attribute.value.type === "entity")
        endpoint(attribute.value.mentionId);
    if (selected.size > LIMITS.assertions)
      throw new Error(
        "Comparison exceeds 100 accepted assertions including endpoint support; select fewer cases.",
      );
  }
  const proposals = [...selected.values()].sort((a, b) =>
    a.assertionId.localeCompare(b.assertionId),
  );
  const citations = new Map<string, KnowledgeCitation>();
  const uniquePassages = new Map<string, string>();
  for (const p of proposals) {
    if (!p.evidence.length)
      throw new Error(
        "Comparison refused: accepted assertion has no citation.",
      );
    for (const c of p.evidence) {
      citations.set(canonical(c), c);
      // Keep every exact resolver alias, but copied extraction bytes/spans consume one passage budget.
      uniquePassages.set(
        canonical([
          c.sourceContentHash,
          c.extractionContentHash,
          c.locator,
          c.passageIndex,
          c.quote,
        ]),
        c.quote,
      );
    }
  }
  if (
    uniquePassages.size > LIMITS.uniquePassages ||
    [...citations.values()].reduce(
      (n, citation) => n + Buffer.byteLength(citation.quote, "utf8"),
      0,
    ) > LIMITS.passageTextBytes
  )
    throw new Error(
      "Comparison exceeds 24 unique passages or 32 KiB of passage text; select fewer cases.",
    );
  const lineage = new Map(dto.lineage.map((l) => [l.evidenceId, l]));
  const passages: CaseComparisonContext["passages"] = [...citations]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, citation], index) => {
      const source = lineage.get(citation.evidenceId);
      return {
        index,
        citation,
        lineage: source
          ? { originId: source.originId, independence: source.independence }
          : null,
        duplicateGroup: "",
      };
    });
  // Connected components prevent transitive same-hash/same-origin copies inflating source counts.
  const groups = passages.map((_, i) => i);
  function root(i: number): number {
    while (groups[i] !== i) i = groups[i]!;
    return i;
  }
  for (let i = 0; i < passages.length; i++)
    for (let j = 0; j < i; j++) {
      const a = passages[i]!;
      const b = passages[j]!;
      if (
        a.citation.sourceContentHash === b.citation.sourceContentHash ||
        (a.lineage && b.lineage && a.lineage.originId === b.lineage.originId)
      )
        groups[root(i)] = root(j);
    }
  for (const p of passages) p.duplicateGroup = `source-group-${root(p.index)}`;
  const citationIndex = new Map(
    passages.map((p) => [canonical(p.citation), p.index]),
  );
  const remapNormalization = (
    normalization: DateNormalization,
    p: KnowledgeProposal,
  ): DateNormalization => {
    const citation = p.evidence[normalization.citationIndex];
    const index = citation && citationIndex.get(canonical(citation));
    if (index === undefined)
      throw new Error("Written date has no compared citation.");
    return { ...normalization, citationIndex: index };
  };
  const remapValue = (
    value: KnowledgeProposal["value"],
    p: KnowledgeProposal,
  ) =>
    value.type === "date" && value.normalization
      ? { ...value, normalization: remapNormalization(value.normalization, p) }
      : value;
  const remapTime = (
    time: NonNullable<KnowledgeProposal["occurredTime"]>,
    p: KnowledgeProposal,
  ) => ({
    ...time,
    ...(time.startNormalization
      ? { startNormalization: remapNormalization(time.startNormalization, p) }
      : {}),
    ...(time.endNormalization
      ? { endNormalization: remapNormalization(time.endNormalization, p) }
      : {}),
  });
  const assertions: ComparisonAssertion[] = proposals.map((p) => ({
    assertionId: p.assertionId,
    kind: p.kind,
    predicate: p.predicate,
    value: remapValue(p.value, p),
    schemaId: p.schemaId,
    caseIds: proposalCases
      .get(p.assertionId)!
      .filter((c) => compared.includes(c)),
    ...(p.mentionId ? { entityId: endpoint(p.mentionId) } : {}),
    ...(p.subjectMentionId
      ? { subjectEntityId: endpoint(p.subjectMentionId) }
      : {}),
    ...(p.value.type === "entity"
      ? { objectEntityId: endpoint(p.value.mentionId) }
      : {}),
    ...(p.occurrenceId ? { occurrenceId: p.occurrenceId } : {}),
    participants: (p.participants ?? [])
      .map((v) => ({ role: v.role, entityId: endpoint(v.mentionId) }))
      .sort((a, b) => canonical(a).localeCompare(canonical(b))),
    ...(p.attributes
      ? {
          attributes: p.attributes.map((attribute) => ({
            ...attribute,
            value: remapValue(attribute.value, p),
          })),
        }
      : {}),
    ...(p.occurredTime ? { occurredTime: remapTime(p.occurredTime, p) } : {}),
    ...(p.publicationTime
      ? { publicationTime: remapTime(p.publicationTime, p) }
      : {}),
    citationIndices: [
      ...new Set(p.evidence.map((c) => citationIndex.get(canonical(c))!)),
    ].sort((a, b) => a - b),
  }));
  const usedEntityIds = sorted(
    [...usedBindings.values()].map((b) => b.entityId),
  );
  const context: CaseComparisonContext = {
    version: "case-comparison.v1",
    fingerprint: "",
    scope: {
      selection: caseIds ? "explicit" : "all",
      comparedCaseIds: compared,
      unexaminedEligibleCaseIds: eligible.filter((c) => !compared.includes(c)),
      uniquePassageCount: uniquePassages.size,
      limits: { ...LIMITS },
      coverageLimits: [
        "Only accepted, accessible knowledge in the disclosed cases and its cited identity support was examined; the complete underlying record corpus was not searched.",
        "Candidates are retrieval aids for provider interpretation, not findings or accepted connections. Recurrence does not establish coordination or causation.",
        "Source-group counts describe reviewed source lineage, not independent real-world occurrences. Unknown or derived lineage cannot establish independent corroboration.",
        "Unknown, uncertain, or overlapping event times are not ordered. Written event time remains distinct from publication time.",
        "Role and predicate signatures compare the recorded vocabulary; differently named predicates and missing facts can conceal similarities. Counterexamples require review of all compared cases.",
      ],
    },
    cases: compared.map((caseId) => {
      const items = assertions.filter((a) => a.caseIds.includes(caseId));
      return {
        caseId,
        title: availableCases.get(caseId)!.title,
        assertionIds: items.map((a) => a.assertionId),
        entityIds: sorted(items.flatMap(idsFor)),
        relationshipAssertionIds: items
          .filter((a) => a.kind === "relationship")
          .map((a) => a.assertionId),
        occurrenceAssertionIds: items
          .filter((a) => a.kind === "occurrence")
          .map((a) => a.assertionId),
      };
    }),
    assertions,
    entities: usedEntityIds.map((id) => {
      const e = entities.get(id)!;
      return {
        entityId: id,
        canonicalLabel: e.canonicalLabel,
        entityType: e.entityType,
      };
    }),
    passages,
    candidates: [],
  };
  const typeOf = (id: string) => entities.get(id)!.entityType;
  function candidate(
    kind: ComparisonCandidate["kind"],
    signature: string,
    items: ComparisonAssertion[],
  ) {
    const caseIds = sorted(items.flatMap((a) => a.caseIds));
    if (caseIds.length < 2) return;
    const indices = [...new Set(items.flatMap((a) => a.citationIndices))].sort(
      (a, b) => a - b,
    );
    const sources = indices.map((i) => passages[i]!);
    context.candidates.push({
      kind,
      signature,
      caseIds,
      assertionIds: sorted(items.map((a) => a.assertionId)),
      entityIds: sorted(items.flatMap(idsFor)),
      citationIndices: indices,
      independentSourceCount: new Set(
        sources
          .filter((p) => p.lineage?.independence === "independent")
          .map((p) => p.duplicateGroup),
      ).size,
      sourceIndependence: sources.some(
        (p) => !p.lineage || p.lineage.independence === "unknown",
      )
        ? "uncertain"
        : "known",
      limitations: [
        "Review exact passages, differences, counterexamples, and ordinary explanations before saving a tentative hypothesis.",
        "Duplicate documents, shared addresses, and matching labels do not establish identity or independent corroboration.",
      ],
    });
  }
  for (const id of usedEntityIds.filter(
    (id) => !["address", "contract"].includes(typeOf(id)),
  )) {
    const items = assertions.filter((a) => idsFor(a).includes(id));
    candidate("shared_identity", id, items);
    const created = context.candidates.at(-1);
    if (created?.kind === "shared_identity" && created.signature === id)
      created.entityIds = [id];
  }
  function structure(a: ComparisonAssertion): string {
    if (a.kind === "relationship")
      return canonical([
        a.predicate,
        typeOf(a.subjectEntityId!),
        typeOf(a.objectEntityId!),
      ]);
    return canonical([
      a.predicate,
      a.participants.map((p) => [p.role, typeOf(p.entityId)]).sort(),
    ]);
  }
  for (const kind of ["relationship", "occurrence"] as const) {
    const grouped = new Map<string, ComparisonAssertion[]>();
    for (const a of assertions.filter(
      (a) =>
        a.kind === kind &&
        a.caseIds.length &&
        (kind === "relationship"
          ? a.subjectEntityId && a.objectEntityId
          : a.participants.length),
    )) {
      const signature = structure(a);
      grouped.set(signature, [...(grouped.get(signature) ?? []), a]);
    }
    for (const [signature, items] of grouped) {
      const differentActors = items.some((a) =>
        items.some(
          (b) =>
            a.caseIds.some((c) => !b.caseIds.includes(c)) &&
            canonical(idsFor(a)) !== canonical(idsFor(b)),
        ),
      );
      if (differentActors)
        candidate(
          kind === "relationship"
            ? "relationship_structure"
            : "event_structure",
          signature,
          items,
        );
    }
  }
  const sequences = new Map<
    string,
    { caseId: string; items: ComparisonAssertion[] }[]
  >();
  for (const caseId of compared) {
    const events = assertions.filter(
      (a) =>
        a.kind === "occurrence" &&
        a.caseIds.includes(caseId) &&
        a.participants.length &&
        a.occurredTime &&
        !a.occurredTime.uncertain,
    );
    for (const first of events)
      for (const second of events) {
        if (
          first === second ||
          upperBound(first.occurredTime!.end ?? first.occurredTime!.start) >=
            lowerBound(second.occurredTime!.start)
        )
          continue;
        const sharedRoles = first.participants
          .flatMap((a) =>
            second.participants
              .filter((b) => a.entityId === b.entityId)
              .map((b) => [a.role, b.role]),
          )
          .sort();
        if (!sharedRoles.length) continue;
        const signature = canonical([
          structure(first),
          structure(second),
          sharedRoles,
        ]);
        sequences.set(signature, [
          ...(sequences.get(signature) ?? []),
          { caseId, items: [first, second] },
        ]);
      }
  }
  for (const [signature, instances] of sequences)
    if (
      instances.some((a) =>
        instances.some(
          (b) =>
            a.caseId !== b.caseId &&
            canonical(sorted(a.items.flatMap(idsFor))) !==
              canonical(sorted(b.items.flatMap(idsFor))),
        ),
      )
    )
      candidate(
        "event_sequence",
        signature,
        instances.flatMap((i) => i.items),
      );
  context.candidates.sort((a, b) =>
    canonical([a.kind, a.signature]).localeCompare(
      canonical([b.kind, b.signature]),
    ),
  );
  if (context.candidates.length > LIMITS.candidates) {
    context.candidates = context.candidates.slice(0, LIMITS.candidates);
    context.scope.coverageLimits.push(
      "Candidate retrieval was capped at 100 deterministically ordered structures; additional structures in the examined scope were not supplied for interpretation.",
    );
  }
  context.fingerprint = hash({
    version: context.version,
    cases: context.cases,
    assertions,
    entities: context.entities,
    passages,
    bindings: [...usedBindings.values()]
      .sort((a, b) => a.mentionId.localeCompare(b.mentionId))
      .map((b) => ({
        mentionId: b.mentionId,
        entityId: b.entityId,
        entityType: b.entityType,
        label: b.label,
        assertionId: b.assertionId,
      })),
    schemas: proposals.map((p) => ({
      assertionId: p.assertionId,
      schema: p.schemaSnapshot ?? null,
    })),
    memberships: memberships
      .filter(
        (m) =>
          compared.includes(m.caseId) &&
          ((m.targetKind === "knowledge" && selected.has(m.targetId)) ||
            (m.targetKind === "entity" && usedEntityIds.includes(m.targetId)) ||
            (m.targetKind === "evidence" &&
              passages.some((p) => p.citation.evidenceId === m.targetId))),
      )
      .sort((a, b) => canonical(a).localeCompare(canonical(b))),
  });
  return context;
}
export function fingerprintCaseComparison(
  dto: KnowledgeWorkspaceDto,
  caseIds?: string[],
): string {
  return prepareCaseComparison(dto, caseIds).fingerprint;
}
function lowerBound(value: string): string {
  return value.length === 4
    ? `${value}-01-01`
    : value.length === 7
      ? `${value}-01`
      : value;
}
function upperBound(value: string): string {
  if (value.length === 4) return `${value}-12-31`;
  if (value.length !== 7) return value;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5));
  const days =
    month === 2
      ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
        ? 29
        : 28
      : [4, 6, 9, 11].includes(month)
        ? 30
        : 31;
  return `${value}-${days}`;
}
