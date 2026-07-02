import type { PrrProjection } from "./projection.js";
import type { PrrStatus } from "./types.js";

export interface RequestQueueRow {
  prrRequestId: string;
  agencyName: string;
  status: PrrStatus;
  deadlineDate?: string;
  deadlineSource?: "estimated" | "confirmed";
  possibleStalling: boolean;
  confirmedStalling: boolean;
  productionCount: number;
}

export function buildRequestQueueRows(projection: PrrProjection): RequestQueueRow[] {
  return [...projection.requests.values()]
    .map((request) => ({
      prrRequestId: request.prrRequestId,
      agencyName: request.agencyName,
      status: request.status,
      ...(request.activeDeadline === undefined
        ? {}
        : {
            deadlineDate: request.activeDeadline.deadlineDate,
            deadlineSource: request.activeDeadline.source
          }),
      possibleStalling: request.possibleStalling,
      confirmedStalling: request.confirmedStalling,
      productionCount: request.productionEvidenceIds.length
    }))
    .sort((left, right) => left.prrRequestId.localeCompare(right.prrRequestId));
}
