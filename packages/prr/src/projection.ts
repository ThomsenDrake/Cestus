import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import type { PrrStatus } from "./types.js";

export interface PrrDeadlineReadModel {
  deadlineDate: string;
  source: "estimated" | "confirmed";
}

export interface PrrRequestReadModel {
  prrRequestId: string;
  status: PrrStatus;
  agencyName: string;
  activeDeadline?: PrrDeadlineReadModel;
  possibleStalling: boolean;
  confirmedStalling: boolean;
  productionEvidenceIds: string[];
}

export interface PrrTimelineEntry {
  eventId: string;
  type: KnowledgeEvent["type"];
  occurredAt: string;
}

export interface PrrProjection {
  requests: Map<string, PrrRequestReadModel>;
  timelineForRequest(prrRequestId: string): PrrTimelineEntry[];
}

export function buildPrrProjection(events: readonly KnowledgeEvent[]): PrrProjection {
  const requests = new Map<string, PrrRequestReadModel>();
  const timelines = new Map<string, PrrTimelineEntry[]>();

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
      continue;
    }

    appendTimelineEntry(timelines, prrRequestId, event);
    applyPrrEvent(request, event);
  }

  return {
    requests: cloneRequests(requests),
    timelineForRequest(prrRequestId) {
      return [...(timelines.get(prrRequestId) ?? [])];
    }
  };
}

function applyPrrEvent(request: PrrRequestReadModel, event: KnowledgeEvent): void {
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

function cloneRequests(requests: Map<string, PrrRequestReadModel>): Map<string, PrrRequestReadModel> {
  return new Map(
    [...requests.entries()].map(([prrRequestId, request]) => [
      prrRequestId,
      cloneRequest(request)
    ])
  );
}

function cloneRequest(request: PrrRequestReadModel): PrrRequestReadModel {
  return {
    prrRequestId: request.prrRequestId,
    status: request.status,
    agencyName: request.agencyName,
    ...(request.activeDeadline === undefined
      ? {}
      : {
          activeDeadline: {
            deadlineDate: request.activeDeadline.deadlineDate,
            source: request.activeDeadline.source
          }
        }),
    possibleStalling: request.possibleStalling,
    confirmedStalling: request.confirmedStalling,
    productionEvidenceIds: [...request.productionEvidenceIds]
  };
}

function requestIdFromPrrEvent(event: KnowledgeEvent): string | undefined {
  if (!event.type.startsWith("prr.")) {
    return undefined;
  }

  const payload = event.payload as { prrRequestId?: unknown };
  return typeof payload.prrRequestId === "string" ? payload.prrRequestId : undefined;
}
