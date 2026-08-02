import { z } from "zod";
import {
  buildEvidenceWorkspaceDto,
  type EvidenceWorkspaceDto
} from "../../ingestion/src/read-api.js";
import type { ActorRef, KnowledgeEvent } from "../../ontology/src/contracts.js";
import {
  containsCredentialShapedEvidenceText,
  EvidenceReviewService
} from "../../ontology/src/evidence-service.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import {
  activeGovernancePolicyRef,
  buildEvidenceGovernanceWorkspaceDto,
  type EvidenceGovernanceWorkspaceDto
} from "../../ontology/src/governance-read-model.js";
import { assertSecretSafeText, governanceTags } from "../../ontology/src/governance-policy.js";
import { GovernanceService } from "../../ontology/src/governance-service.js";
import type { LocalRuntimeRequest, LocalRuntimeResponse } from "./http-handler.js";

const proposalTextSchema = z.string().min(1).refine(
  (value) => !containsCredentialShapedEvidenceText(value),
  { message: "proposal text must not contain credential-shaped material" }
);
const assertionCandidateInputSchema = z.object({
  assertionId: z.string().regex(/^as_[a-zA-Z0-9_-]+$/).refine(
    (value) => !containsCredentialShapedEvidenceText(value)
  ),
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/).refine(
    (value) => !containsCredentialShapedEvidenceText(value)
  ),
  subjectRef: proposalTextSchema.optional(),
  predicate: proposalTextSchema,
  object: z.union([proposalTextSchema, z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1)
}).strict();
const safeGovernanceTextSchema = z.string().min(1).refine(
  isSecretSafeGovernanceText,
  { message: "governance text must not contain credential-shaped material" }
);
const safeGovernanceEventRefSchema = z.string().regex(/^evt_[a-zA-Z0-9_-]+$/).refine(
  isSecretSafeGovernanceText,
  { message: "governance event reference must not contain credential-shaped material" }
);
const governanceReviewInputSchema = z.object({
  evidenceRef: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/).refine(
    isSecretSafeGovernanceText,
    { message: "evidence reference must not contain credential-shaped material" }
  ),
  tag: z.enum(governanceTags),
  action: z.enum(["affirm", "add", "remove", "supersede"]),
  rationale: safeGovernanceTextSchema,
  supersedesEventRef: safeGovernanceEventRefSchema.optional()
}).strict().superRefine((value, context) => {
  if (value.action === "supersede" && value.supersedesEventRef === undefined) {
    context.addIssue({
      code: "custom",
      path: ["supersedesEventRef"],
      message: "supersede requires an earlier governance event reference"
    });
  }
});

const knownBlockingReasons = new Set([
  "Evidence ingestion provenance is missing.",
  "Evidence occurrence lineage is missing.",
  "Evidence content hash does not match ingestion lineage.",
  "Evidence source collection provenance is missing.",
  "Human import approval provenance is missing.",
  "Evidence import completion provenance is missing.",
  "Import completion totals do not match observed occurrence lineage.",
  "A linked source occurrence is missing.",
  "A linked source occurrence does not match its import provenance.",
  "Quarantined evidence is excluded from ordinary assertion preparation.",
  "Tombstoned evidence is excluded from ordinary assertion preparation.",
  "Assertion candidate contains credential-shaped material.",
  "Assertion candidate ID already exists with different proposal content."
]);

export interface HandleEvidenceHttpRouteInput {
  readonly request: LocalRuntimeRequest;
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now?: () => string;
}

type RuntimeEvidenceWorkspaceDto = EvidenceWorkspaceDto & {
  readonly governance: EvidenceGovernanceWorkspaceDto;
};

export async function handleEvidenceHttpRoute(
  input: HandleEvidenceHttpRouteInput
): Promise<LocalRuntimeResponse | undefined> {
  const path = new URL(input.request.url, "http://localhost").pathname;

  if (input.request.method === "GET" && path === "/api/evidence/workspace") {
    try {
      return json(200, buildRuntimeEvidenceWorkspaceDto(await input.ledger.readAll()));
    } catch {
      return json(503, unavailableEvidenceWorkspaceDto());
    }
  }

  if (input.request.method === "POST" && path === "/api/evidence/governance-reviews") {
    return appendGovernanceReview(input);
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

  let workspace: RuntimeEvidenceWorkspaceDto;
  try {
    workspace = buildRuntimeEvidenceWorkspaceDto(await input.ledger.readAll());
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

async function appendGovernanceReview(
  input: HandleEvidenceHttpRouteInput
): Promise<LocalRuntimeResponse> {
  const body = parseJsonBody(input.request.body);
  if (!body.ok) {
    return invalidGovernanceReviewInput();
  }
  const parsed = governanceReviewInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return invalidGovernanceReviewInput();
  }

  try {
    const events = await input.ledger.readAll();
    const { supersedesEventRef, evidenceRef, ...decision } = parsed.data;
    await new GovernanceService({ ledger: input.ledger, actor: input.actor }).reviewEvidenceGovernance({
      evidenceId: evidenceRef,
      reviewedBy: input.actor.id,
      policy: activeGovernancePolicyRef(events),
      decisions: [{
        ...decision,
        ...(supersedesEventRef === undefined ? {} : { supersedesEventId: supersedesEventRef })
      }]
    });
  } catch {
    return json(409, diagnostic(
      "EVIDENCE_GOVERNANCE_REVIEW_BLOCKED",
      "Governance review could not be appended safely.",
      ["reload the evidence workspace", "review classification and append-only governance provenance"]
    ));
  }

  let workspace: RuntimeEvidenceWorkspaceDto;
  try {
    workspace = buildRuntimeEvidenceWorkspaceDto(await input.ledger.readAll());
  } catch {
    workspace = unavailableEvidenceWorkspaceDto();
  }
  return json(201, { ok: true, workspace });
}

function invalidGovernanceReviewInput(): LocalRuntimeResponse {
  return json(400, diagnostic(
    "EVIDENCE_GOVERNANCE_REVIEW_INPUT_INVALID",
    "Governance review input is invalid.",
    ["provide a valid evidence reference, governance tag, action, and safe rationale"]
  ));
}

function buildRuntimeEvidenceWorkspaceDto(
  events: readonly KnowledgeEvent[]
): RuntimeEvidenceWorkspaceDto {
  const workspace = buildEvidenceWorkspaceDto(events);
  return Object.freeze({
    ...workspace,
    governance: buildEvidenceGovernanceWorkspaceDto(
      events,
      workspace.items.map((item) => item.evidenceId)
    )
  });
}

function unavailableEvidenceWorkspaceDto(): RuntimeEvidenceWorkspaceDto {
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
    }],
    governance: buildEvidenceGovernanceWorkspaceDto([], [])
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
  code:
    | "EVIDENCE_ASSERTION_INPUT_INVALID"
    | "EVIDENCE_ASSERTION_PREPARATION_BLOCKED"
    | "EVIDENCE_GOVERNANCE_REVIEW_INPUT_INVALID"
    | "EVIDENCE_GOVERNANCE_REVIEW_BLOCKED",
  message: string,
  repairActions: readonly string[]
) {
  return {
    ok: false,
    diagnostic: { code, message, repairActions: [...repairActions] }
  };
}

const commonSecretValuePattern = /(?:^|[^a-z0-9])(?:sk[_-](?:live|test|proj)[_-]?|gh[pousr]_|github[_-]?pat[_-]|glpat[_-]|xox[baprs]?[_-]|AKIA|ASIA|AIza|ya29|eyJ|hf[_-]|rk[_-]live|pk[_-]live|sg[._-])[a-z0-9._-]{3,}/i;

function isSecretSafeGovernanceText(value: string): boolean {
  try {
    assertSecretSafeText(value);
  } catch {
    return false;
  }
  return !commonSecretValuePattern.test(value);
}

function json(status: number, body: unknown): LocalRuntimeResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(body)
  });
}
