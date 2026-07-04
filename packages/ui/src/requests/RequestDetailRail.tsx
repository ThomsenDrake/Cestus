import { RequestDetailSections } from "./RequestDetailSections.js";
import type { PrrDetailModel } from "./request-types.js";

interface RequestDetailRailProps {
  readonly selectedRequest: PrrDetailModel | undefined;
}

export function RequestDetailRail({ selectedRequest }: RequestDetailRailProps) {
  return (
    <aside aria-label="Request detail rail" className="h-full p-4 lg:p-5">
      {selectedRequest === undefined ? (
        <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
          Select a request to inspect its next action.
        </p>
      ) : (
        <div>
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">
            {selectedRequest.prrRequestId} / {selectedRequest.agencyName}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-balance text-[var(--paper-light)]">{selectedRequest.title}</h2>
          <div className="mt-5">
            <RequestDetailSections selectedRequest={selectedRequest} />
          </div>
        </div>
      )}
    </aside>
  );
}
