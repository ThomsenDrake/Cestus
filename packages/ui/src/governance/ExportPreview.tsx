import type { GovernanceExportApprovalId } from "../../../ontology/src/governance-export-preview.js";
import type { GovernanceExportPreviewDto } from "./governance-types.js";

export function ExportPreview({ preview }: { readonly preview: GovernanceExportPreviewDto }) {
  return (
    <section aria-label="Governance export preview" className="space-y-4 border border-[var(--console-line)] bg-[var(--console-void)]/72 p-4">
      <header className="border-b border-[var(--console-line-strong)] pb-4">
        <p className="font-mono text-base uppercase tracking-[0.14em] text-[var(--signal-red)] sm:text-sm">Public-safe export preview</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--paper-light)]">Preview only</h2>
        <p className="mt-2 text-base text-[var(--signal-amber)] sm:text-sm">Preview only — no export or publication occurs.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Included by default" className="border border-[var(--console-line)] p-3">
          <h3 className="font-mono text-base text-[var(--signal-cyan)] sm:text-sm">Included by default</h3>
          {preview.includedEvidence.length === 0 ? (
            <p className="mt-3 text-base text-[var(--muted-amber)] sm:text-sm">No evidence is currently public-safe.</p>
          ) : (
            <ul role="list" className="mt-3 space-y-2">
              {preview.includedEvidence.map((item) => (
                <li key={item.evidenceRef} className="break-all font-mono text-base text-[var(--paper-light)] sm:text-sm">{item.evidenceRef}</li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Excluded by default" className="border border-[var(--signal-red)] p-3">
          <h3 className="font-mono text-base text-[var(--signal-red)] sm:text-sm">Excluded by default</h3>
          <ul role="list" className="mt-3 space-y-3">
            {preview.excludedEvidence.map((item) => (
              <li key={item.evidenceRef} className="border-l border-[var(--signal-red)] pl-3">
                <p className="break-all font-mono text-base text-[var(--paper-light)] sm:text-sm">{item.evidenceRef}</p>
                <ul role="list" className="mt-2 space-y-1 text-base text-[var(--muted-amber)] sm:text-sm">
                  {item.requiredApprovals.map((approval) => (
                    <li key={approval.approvalId}>
                      <span>{approvalLabels[approval.approvalId]}</span>
                      <span className="block font-mono text-[var(--muted-amber)]">
                        {approval.optInAvailableInPreview ? "opt-in approval required" : "unavailable in preview"}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {preview.diagnostics.length === 0 ? null : (
        <section aria-label="Export preview diagnostics" className="border border-[var(--signal-red)] p-3">
          <h3 className="font-mono text-base text-[var(--signal-red)] sm:text-sm">Safe-reference diagnostics</h3>
          <ul role="list" className="mt-2 space-y-2">
            {preview.diagnostics.map((diagnostic) => (
              <li key={diagnostic.evidenceRef} className="break-all text-base text-[var(--paper-light)] sm:text-sm">
                {diagnostic.code} · {diagnostic.evidenceRef} · {diagnostic.repairHint}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

const approvalLabels: Readonly<Record<GovernanceExportApprovalId, string>> = {
  "human-approve-private-evidence-inclusion": "Human approval: include private evidence",
  "human-approve-source-identity-inclusion": "Human approval: include source-identity evidence",
  "human-approve-credential-risk-inclusion": "Human approval: include credential-risk evidence",
  "human-approve-export-restricted-inclusion": "Human approval: include export-restricted evidence",
  "human-approve-other-unsafe-evidence-inclusion": "Human approval: include other unsafe evidence",
  "human-affirm-public-safe-eligibility": "Human review: affirm public-safe eligibility",
  "governance-classification-required-before-preview": "Governance classification required before preview eligibility",
  "quarantine-release-unavailable-in-preview": "Quarantine release requires its separate human-gated workflow",
  "tombstone-reversal-unavailable-in-preview": "Tombstone reversal requires its separate human-gated workflow"
};
