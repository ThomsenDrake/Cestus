import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { createPrrDiagnostic, type PrrDiagnostic } from "./diagnostics.js";
import type { PrrStatus } from "./types.js";

export interface PrrDeadlineReadModel {
  readonly deadlineDate: string;
  readonly source: "estimated" | "confirmed";
}

export interface PrrRequestReadModel {
  readonly prrRequestId: string;
  readonly status: PrrStatus;
  readonly agencyName: string;
  readonly activeDeadline?: PrrDeadlineReadModel;
  readonly possibleStalling: boolean;
  readonly confirmedStalling: boolean;
  readonly productionEvidenceIds: readonly string[];
}

export interface PrrTimelineEntry {
  readonly eventId: string;
  readonly type: KnowledgeEvent["type"];
  readonly occurredAt: string;
}

export interface PrrProjection {
  requests: ReadonlyMap<string, PrrRequestReadModel>;
  diagnostics: readonly PrrDiagnostic[];
  timelineForRequest(prrRequestId: string): PrrTimelineEntry[];
}

interface MutablePrrRequestReadModel {
  prrRequestId: string;
  status: PrrStatus;
  agencyName: string;
  activeDeadline?: PrrDeadlineReadModel;
  possibleStalling: boolean;
  confirmedStalling: boolean;
  productionEvidenceIds: string[];
}

export function buildPrrProjection(events: readonly KnowledgeEvent[]): PrrProjection {
  const requests = new Map<string, MutablePrrRequestReadModel>();
  const timelines = new Map<string, PrrTimelineEntry[]>();
  const diagnostics: PrrDiagnostic[] = [];

  for (const event of events) {
    const prrRequestId = requestIdFromPrrEvent(event);
    if (!prrRequestId) {
      continue;
    }

    if (event.type === "prr.request.created") {
      requests.set(prrRequestId, {
        prrRequestId,
        status: "draft",
        agencyName: event.payload.agency.name,
        possibleStalling: false,
        confirmedStalling: false,
        productionEvidenceIds: []
      });
      appendTimelineEntry(timelines, prrRequestId, event);
      continue;
    }

    const request = requests.get(prrRequestId);
    if (!request) {
      diagnostics.push(createUncreatedRequestDiagnostic(event, prrRequestId));
      continue;
    }

    appendTimelineEntry(timelines, prrRequestId, event);
    applyPrrEvent(request, event);
  }

  return {
    requests: cloneRequests(requests),
    diagnostics: cloneDiagnostics(diagnostics),
    timelineForRequest(prrRequestId) {
      return (timelines.get(prrRequestId) ?? []).map(cloneTimelineEntry);
    }
  };
}

function createUncreatedRequestDiagnostic(event: KnowledgeEvent, prrRequestId: string): PrrDiagnostic {
  return createPrrDiagnostic({
    diagnosticId: `diag_prr_projection_${event.id}`,
    prrRequestId,
    eventId: event.id,
    category: "projection",
    message: `Cannot project ${event.type} before prr.request.created`,
    violatedPath: "prr.request.created",
    allowedActions: ["replay a ledger containing prr.request.created before dependent PRR events"]
  });
}

function applyPrrEvent(request: MutablePrrRequestReadModel, event: KnowledgeEvent): void {
  switch (event.type) {
    case "prr.request.sent":
      request.status = "sent";
      break;

    case "prr.correspondence.received":
      request.status = "acknowledged";
      break;

    case "prr.deadline.estimated":
      if (request.activeDeadline?.source !== "confirmed") {
        request.activeDeadline = {
          deadlineDate: event.payload.deadlineDate,
          source: "estimated"
        };
      }
      break;

    case "prr.deadline.confirmed":
      request.activeDeadline = {
        deadlineDate: event.payload.deadlineDate,
        source: "confirmed"
      };
      break;

    case "prr.production.received":
      request.status = "awaitingProduction";
      request.productionEvidenceIds.push(...event.payload.evidenceIds);
      break;

    case "prr.denial.recorded":
      request.status = "denied";
      break;

    case "prr.appeal.created":
      request.status = "appealed";
      break;

    case "prr.request.closed":
      request.status = "closed";
      break;

    case "prr.stalling.detected":
      request.possibleStalling = true;
      break;

    case "prr.stalling.confirmed":
      request.confirmedStalling = true;
      break;

    default:
      break;
  }
}

function appendTimelineEntry(
  timelines: Map<string, PrrTimelineEntry[]>,
  prrRequestId: string,
  event: KnowledgeEvent
): void {
  const timeline = timelines.get(prrRequestId) ?? [];
  timeline.push({
    eventId: event.id,
    type: event.type,
    occurredAt: event.context.occurredAt
  });
  timelines.set(prrRequestId, timeline);
}

function cloneRequests(
  requests: Map<string, MutablePrrRequestReadModel>
): ReadonlyMap<string, PrrRequestReadModel> {
  return new RuntimeReadonlyMap(
    [...requests.entries()].map(([prrRequestId, request]) => [
      prrRequestId,
      cloneRequest(request)
    ])
  );
}

class RuntimeReadonlyMap<Key, Value> implements ReadonlyMap<Key, Value> {
  private readonly valuesByKey: Map<Key, Value>;

  constructor(entries: Iterable<readonly [Key, Value]>) {
    this.valuesByKey = new Map(entries);
  }

  get size(): number {
    return this.valuesByKey.size;
  }

  get [Symbol.toStringTag](): string {
    return "Map";
  }

  get(key: Key): Value | undefined {
    return this.valuesByKey.get(key);
  }

  has(key: Key): boolean {
    return this.valuesByKey.has(key);
  }

  keys(): MapIterator<Key> {
    return this.valuesByKey.keys();
  }

  values(): MapIterator<Value> {
    return this.valuesByKey.values();
  }

  entries(): MapIterator<[Key, Value]> {
    return this.valuesByKey.entries();
  }

  forEach(
    callbackfn: (value: Value, key: Key, map: ReadonlyMap<Key, Value>) => void,
    thisArg?: unknown
  ): void {
    for (const [key, value] of this.valuesByKey) {
      callbackfn.call(thisArg, value, key, this);
    }
  }

  [Symbol.iterator](): MapIterator<[Key, Value]> {
    return this.entries();
  }

  set(): never {
    throw new TypeError("PrrProjection.requests is read-only; rebuild the projection from ledger events instead.");
  }

  delete(): never {
    throw new TypeError("PrrProjection.requests is read-only; rebuild the projection from ledger events instead.");
  }

  clear(): never {
    throw new TypeError("PrrProjection.requests is read-only; rebuild the projection from ledger events instead.");
  }
}

function cloneRequest(request: MutablePrrRequestReadModel): PrrRequestReadModel {
  return Object.freeze({
    prrRequestId: request.prrRequestId,
    status: request.status,
    agencyName: request.agencyName,
    ...(request.activeDeadline === undefined
      ? {}
      : {
          activeDeadline: cloneDeadline(request.activeDeadline)
        }),
    possibleStalling: request.possibleStalling,
    confirmedStalling: request.confirmedStalling,
    productionEvidenceIds: Object.freeze([...request.productionEvidenceIds])
  });
}

function cloneDeadline(deadline: PrrDeadlineReadModel): PrrDeadlineReadModel {
  return Object.freeze({
    deadlineDate: deadline.deadlineDate,
    source: deadline.source
  });
}

function cloneDiagnostics(diagnostics: readonly PrrDiagnostic[]): readonly PrrDiagnostic[] {
  return Object.freeze(diagnostics.map(cloneDiagnostic));
}

function cloneDiagnostic(diagnostic: PrrDiagnostic): PrrDiagnostic {
  return Object.freeze({
    diagnosticId: diagnostic.diagnosticId,
    prrRequestId: diagnostic.prrRequestId,
    ...(diagnostic.eventId === undefined ? {} : { eventId: diagnostic.eventId }),
    category: diagnostic.category,
    message: diagnostic.message,
    repairHint: Object.freeze({
      violatedPath: diagnostic.repairHint.violatedPath,
      allowedActions: Object.freeze([...diagnostic.repairHint.allowedActions])
    })
  });
}

function cloneTimelineEntry(entry: PrrTimelineEntry): PrrTimelineEntry {
  return Object.freeze({
    eventId: entry.eventId,
    type: entry.type,
    occurredAt: entry.occurredAt
  });
}

function requestIdFromPrrEvent(event: KnowledgeEvent): string | undefined {
  if (!event.type.startsWith("prr.")) {
    return undefined;
  }

  const payload = event.payload as { prrRequestId?: unknown };
  return typeof payload.prrRequestId === "string" ? payload.prrRequestId : undefined;
}
