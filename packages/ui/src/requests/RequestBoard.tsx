import type { PrrLaneModel } from "./request-types.js";
import { RequestLane } from "./RequestLane.js";

interface RequestBoardProps {
  readonly lanes: readonly PrrLaneModel[];
  readonly selectedRequestId: string | undefined;
  readonly onSelectRequest: (prrRequestId: string) => void;
}

export function RequestBoard({ lanes, selectedRequestId, onSelectRequest }: RequestBoardProps) {
  return (
    <section aria-label="Signal operations board" className="@container">
      <div className="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3 @7xl:grid-cols-4">
        {lanes.map((lane) => (
          <RequestLane
            key={lane.id}
            lane={lane}
            selectedRequestId={selectedRequestId}
            onSelectRequest={onSelectRequest}
          />
        ))}
      </div>
    </section>
  );
}
