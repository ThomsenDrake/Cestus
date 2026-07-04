import { useEffect, useRef, type KeyboardEvent } from "react";
import { RequestDetailSections } from "./RequestDetailSections.js";
import type { PrrDetailModel } from "./request-types.js";

interface RequestDetailModalProps {
  readonly selectedRequest: PrrDetailModel | undefined;
  readonly onClose: () => void;
}

export function RequestDetailModal({ selectedRequest, onClose }: RequestDetailModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const title = selectedRequest?.title ?? "Request detail unavailable";

  useEffect(() => {
    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const focusTarget = closeButtonRef.current ?? getFocusableDialogControls(dialogRef.current)[0];
    focusTarget?.focus();

    return () => {
      const previousActiveElement = previousActiveElementRef.current;
      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus();
      }
    };
  }, []);

  function handleClose() {
    onClose();
    const previousActiveElement = previousActiveElementRef.current;
    if (previousActiveElement?.isConnected) {
      previousActiveElement.focus();
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableControls = getFocusableDialogControls(dialogRef.current);
    const firstControl = focusableControls[0];
    const lastControl = focusableControls.at(-1);

    if (firstControl === undefined || lastControl === undefined) {
      event.preventDefault();
      return;
    }

    if (event.shiftKey && (document.activeElement === firstControl || !dialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      lastControl.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastControl) {
      event.preventDefault();
      firstControl.focus();
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Request investigation detail: ${title}`}
      onKeyDown={handleDialogKeyDown}
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--command-black)]/92 p-4"
    >
      <div className="mx-auto min-h-[calc(100dvh-2rem)] max-w-7xl border border-[var(--console-line)] bg-[var(--console-void)]/96 p-4 lg:p-5">
        <header className="flex min-w-0 flex-col gap-3 border-b border-[var(--console-line)] pb-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">
              {selectedRequest === undefined ? (
                "No request selected"
              ) : (
                <>
                  <span>{selectedRequest.prrRequestId}</span>
                  <span aria-hidden="true"> / </span>
                  <span>{selectedRequest.agencyName}</span>
                </>
              )}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-balance text-[var(--paper-light)]">{title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            className="relative min-h-10 w-fit shrink-0 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--paper-light)] hover:border-[var(--signal-amber)] hover:text-[var(--signal-amber)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:text-sm"
          >
            <span
              aria-hidden="true"
              className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
            />
            Close request detail
          </button>
        </header>
        <div className="mt-5">
          {selectedRequest === undefined ? (
            <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
              The selected request detail is unavailable. Close this modal and select another request.
            </p>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <RequestDetailSections selectedRequest={selectedRequest} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getFocusableDialogControls(dialog: HTMLElement | null): HTMLElement[] {
  if (dialog === null) {
    return [];
  }

  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}
