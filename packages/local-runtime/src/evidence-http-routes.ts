import { z } from "zod";
import {
  buildEvidenceWorkspaceDto,
  type EvidenceWorkspaceDto
} from "../../ingestion/src/read-api.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import { EvidenceReviewService } from "../../ontology/src/evidence-service.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { LocalRuntimeRequest, LocalRuntimeResponse } from "./http-handler.js";

const proposalTextSchema = z.string().min(1).refine(
  (value) => !/api[_ -]?key|authorization|bearer|password|secret|oauth|credential|cookie\s*:|session\s*=/i.test(value),
  { message: "proposal text must not contain credential-shaped material" }
);
const assertionCandidateInputSchema = z.object({
  assertionId: z.string().regex(/^as_[a-zA-Z0-9_-]+$/),
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  subjectRef: proposalTextSchema.optional(),
  predicate: proposalTextSchema,
  object: z.union([proposalTextSchema, z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1)
}).strict();

const knownBlockingReasons = new Set([
  "Evidence ingestion provenance is missing.",
  "Evidence occurrence lineage is missing.",
  "Evidence content hash does not match ingestion lineage.",
  "Evidence source collection provenance is missing.",
  "Human import approval provenance is missing.",
  "Evidence import completion provenance is missing.",
  "A linked source occurrence is missing.",
  "A linked source occurrence does not match its import provenance.",
  "Quarantined evidence is excluded from ordinary assertion preparation.",
  "Tombstoned evidence is excluded from ordinary assertion preparation.",
  "Assertion candidate has already completed human review.",
  "Assertion candidate ID already exists with different proposal content."
]);

export interface HandleEvidenceHttpRouteInput {
  readonly request: LocalRuntimeRequest;
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now?: () => string;
}

export async function handleEvidenceHttpRoute(
  input: HandleEvidenceHttpRouteInput
): Promise<LocalRuntimeResponse | undefined> {
  const path = new URL(input.request.url, "http://localhost").pathname;

  if (input.request.method === "GET" && path === "/api/evidence/workspace") {
    try {
      return json(200, buildEvidenceWorkspaceDto(await input.ledger.readAll()));
    } catch {
      return json(503, unavailableEvidenceWorkspaceDto());
    }
  }

  if (input.request.method !== "POST" || path !== "/api/evidence/assertion-candidates") {
    return undefined;
  }

  const body = parseJsonBody(input.request.body);
  if (!body.ok) {
    return json(400, diagnostic(
      "EVIDENCE_ASSERTION_INPUT_INVALID",
      "Assertion candidate input is invalid.",
      ["provide a valid evidence ID, assertion ID, predicate, object, and confidence"]
    ));
  }
  const parsed = assertionCandidateInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return json(400, diagnostic(
      "EVIDENCE_ASSERTION_INPUT_INVALID",
      "Assertion candidate input is invalid.",
      ["provide a valid evidence ID, assertion ID, predicate, object, and confidence"]
    ));
  }

  let prepared: Awaited<ReturnType<EvidenceReviewService["prepareAssertionCandidate"]>>;
  try {
    const { subjectRef, ...requiredInput } = parsed.data;
    prepared = await new EvidenceReviewService({
      ledger: input.ledger,
      ...(input.now === undefined ? {} : { now: input.now })
    }).prepareAssertionCandidate({
      ...requiredInput,
      ...(subjectRef === undefined ? {} : { subjectRef }),
      actor: input.actor
    });
  } catch (error: unknown) {
    const message = error instanceof Error && knownBlockingReasons.has(error.message)
      ? error.message
      : "Evidence changed or could not be prepared safely.";
    return json(409, diagnostic(
      "EVIDENCE_ASSERTION_PREPARATION_BLOCKED",
      message,
      ["reload the evidence workspace", "review provenance and governance state"]
    ));
  }

  let workspace: EvidenceWorkspaceDto;
  try {
    workspace = buildEvidenceWorkspaceDto(await input.ledger.readAll());
  } catch {
    workspace = unavailableEvidenceWorkspaceDto();
  }
  return json(201, {
    ok: true,
    candidate: {
      assertionId: prepared.assertionId,
      evidenceReferences: prepared.evidenceReferences,
      predicate: prepared.event.payload.predicate,
      confidence: prepared.event.payload.confidence,
      reviewState: prepared.reviewState,
      reviewRequired: prepared.reviewRequired,
      eventId: prepared.event.id
    },
    workspace
  });
}

function unavailableEvidenceWorkspaceDto(): EvidenceWorkspaceDto {
  return {
    schemaVersion: "evidence-workspace.v1",
    status: "degraded",
    sourceHighWaterMark: 0,
    items: [],
    assertionCandidates: [],
    diagnostics: [{
      code: "projection-error",
      severity: "error",
      message: "The local evidence ledger could not be replayed safely.",
      repairActions: ["retry evidence replay", "inspect the local evidence ledger"]
    }]
  };
}

function parseJsonBody(body: string | undefined):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false } {
  try {
    return {
      ok: true,
      value: body === undefined || body.trim() === "" ? {} : JSON.parse(body)
    };
  } catch {
    return { ok: false };
  }
}

function diagnostic(
  code: "EVIDENCE_ASSERTION_INPUT_INVALID" | "EVIDENCE_ASSERTION_PREPARATION_BLOCKED",
  message: string,
  repairActions: readonly string[]
) {
  return {
    ok: false,
    diagnostic: { code, message, repairActions: [...repairActions] }
  };
}

function json(status: number, body: unknown): LocalRuntimeResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(body)
  });
}
