import { useMemo, useState } from "react";
import { governanceTags, type GovernanceTag } from "../../../ontology/src/governance-policy.js";
import type {
  AppendGovernanceReviewInput,
  GovernanceReviewDto
} from "./governance-types.js";

export interface GovernanceReviewProps {
  readonly review: GovernanceReviewDto;
  readonly onAppendReview: (input: AppendGovernanceReviewInput) => Promise<void> | void;
}

export function GovernanceReview({ review, onAppendReview }: GovernanceReviewProps) {
  const [tag, setTag] = useState<GovernanceTag>(review.proposedTags[0]?.tag ?? "public_safe");
  const [action, setAction] = useState<AppendGovernanceReviewInput["action"]>("affirm");
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [appended, setAppended] = useState(false);
  const [appendDiagnostic, setAppendDiagnostic] = useState<string | undefined>();
  const supersedesEventRef = useMemo(
    () => review.humanDecisions.findLast((decision) => decision.tag === tag)?.eventRef
      ?? review.proposedTags.findLast((proposal) => proposal.tag === tag)?.eventRef,
    [review.humanDecisions, review.proposedTags, tag]
  );
  const supersedeMissingEventRef = action === "supersede" && supersedesEventRef === undefined;
  const reviewLocked = review.classificationStatus !== "succeeded" ||
    review.diagnostics.some((diagnostic) => diagnostic.code === "projection-failed");

  async function appendReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewLocked) {
      return;
    }

    setSubmitting(true);
    setAppended(false);
    setAppendDiagnostic(undefined);
    try {
      await onAppendReview({
        evidenceRef: review.evidenceRef,
        tag,
        action,
        rationale: rationale.trim(),
        ...(supersedesEventRef === undefined ? {} : { supersedesEventRef })
      });
      setAppended(true);
    } catch {
      setAppendDiagnostic(
        "Governance review could not be appended safely. Reload the evidence workspace and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-label="Governance review" className="space-y-4 border border-[var(--console-line)] bg-[var(--console-void)]/72 p-4">
      <header className="border-b border-[var(--console-line-strong)] pb-4">
        <p className="font-mono text-base uppercase tracking-[0.14em] text-[var(--signal-red)] sm:text-sm">Append-only governance review</p>
        <h2 className="mt-2 break-all text-xl font-semibold text-[var(--paper-light)]">{review.evidenceRef}</h2>
        <p className="mt-2 text-base text-[var(--muted-amber)] sm:text-sm">
          Human decisions append to the ledger; original classifier proposals remain visible.
        </p>
      </header>

      {reviewLocked ? (
        <section aria-label="Locked governance diagnostic" className="border border-[var(--signal-red)] p-3">
          <h3 className="font-mono text-base text-[var(--signal-red)] sm:text-sm">Classification locked</h3>
          <ul role="list" className="mt-2 space-y-2">
            {review.diagnostics.map((diagnostic) => (
              <li key={`${diagnostic.code}:${diagnostic.evidenceRef}`} className="font-mono text-base sm:text-sm">
                <p className="text-[var(--signal-red)]">{diagnostic.code}</p>
                <p className="mt-1 break-all text-[var(--signal-amber)]">{diagnostic.repairHint}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Proposed governance tags">
        <h3 className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Independent classifier proposals</h3>
        <ul role="list" className="mt-3 space-y-3">
          {review.proposedTags.map((proposal, index) => (
            <li key={`${proposal.eventRef}:${proposal.tag}:${index}`} className="border-l border-[var(--console-line)] pl-3">
              <p className="font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{proposal.tag}</p>
              <p className="mt-1 text-base text-[var(--paper-light)] sm:text-sm">{Math.round(proposal.confidence * 100)}% confidence</p>
              <p className="mt-1 text-base text-[var(--muted-amber)] sm:text-sm">{proposal.rationale}</p>
              <p className="mt-1 break-all font-mono text-base text-[var(--muted-amber)] sm:text-sm">{proposal.workflowAccess}</p>
              {proposal.repairHint === undefined ? null : (
                <p className="mt-1 break-all font-mono text-base text-[var(--signal-amber)] sm:text-sm">{proposal.repairHint}</p>
              )}
              <p className="mt-1 break-all font-mono text-base text-[var(--muted-amber)] sm:text-sm">{proposal.eventRef}</p>
            </li>
          ))}
        </ul>
      </section>

      {review.humanDecisions.length === 0 ? null : (
        <section aria-label="Human governance history" className="border-t border-[var(--console-line)] pt-3">
          <h3 className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Human decisions</h3>
          <ul role="list" className="mt-2 space-y-2">
            {review.humanDecisions.map((decision) => (
              <li key={decision.eventRef} className="text-base text-[var(--paper-light)] sm:text-sm">
                <span className="font-mono">{decision.action} · {decision.tag}</span>
                <span className="block text-[var(--muted-amber)]">{decision.rationale}</span>
                <span className="mt-1 block break-all font-mono text-[var(--muted-amber)]">{decision.eventRef}</span>
                {decision.supersedesEventRef === undefined ? null : (
                  <span className="mt-1 block break-all font-mono text-[var(--muted-amber)]">{decision.supersedesEventRef}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <form aria-label="Append governance review" onSubmit={(event) => void appendReview(event)} className="grid gap-3 border-t border-[var(--console-line)] pt-4">
        <label className={labelClass}>
          Review tag
          <select aria-label="Review tag" value={tag} onChange={(event) => setTag(event.target.value as GovernanceTag)} className={inputClass}>
            {governanceTags.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className={labelClass}>
          Review action
          <select aria-label="Review action" value={action} onChange={(event) => setAction(event.target.value as AppendGovernanceReviewInput["action"])} className={inputClass}>
            {(["affirm", "add", "remove", "supersede"] as const).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Review rationale
          <textarea aria-label="Review rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} className={inputClass} />
        </label>
        {supersedeMissingEventRef ? (
          <p role="alert" className="text-base text-[var(--signal-red)] sm:text-sm">Supersede requires a prior governance event for this tag.</p>
        ) : null}
        <button
          type="submit"
          disabled={reviewLocked || submitting || rationale.trim().length === 0 || supersedeMissingEventRef}
          className={actionButtonClass}
        >
          {submitting ? "Appending governance review" : "Append governance review"}
        </button>
        {appendDiagnostic === undefined ? null : (
          <p role="alert" className="text-base text-[var(--signal-red)] sm:text-sm">{appendDiagnostic}</p>
        )}
        {appended ? <p role="status" className="text-base text-[var(--signal-cyan)] sm:text-sm">Governance review appended without replacing the original event.</p> : null}
      </form>
    </section>
  );
}

const labelClass = "grid gap-1 text-base text-[var(--muted-amber)] sm:text-sm";
const inputClass = "min-h-10 min-w-0 border border-[var(--console-line)] bg-[var(--console-panel)] px-3 py-2 text-base text-[var(--paper-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:text-sm";
const actionButtonClass = "min-h-10 justify-self-start border border-[var(--signal-amber)] px-3 py-2 text-base text-[var(--signal-amber)] hover:bg-[var(--console-panel)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] disabled:cursor-not-allowed disabled:border-[var(--console-line)] disabled:text-[var(--muted-amber)] sm:text-sm";
