import { useEffect, useMemo, useState } from "react";
import type {
  OntologyAssertionDto,
  OntologyRelationshipDto,
  OntologyWorkspaceDto
} from "./ontology-types.js";

interface OntologyWorkspaceProps {
  readonly workspace: OntologyWorkspaceDto | undefined;
  readonly loadState: "idle" | "loading" | "loaded" | "error";
  readonly loadError: string | undefined;
  readonly onRetry: () => void;
}

export function OntologyWorkspace({
  workspace,
  loadState,
  loadError,
  onRetry
}: OntologyWorkspaceProps) {
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | undefined>();
  const selectedRelationship = useMemo(
    () => workspace?.relationships.find((item) => item.relationshipId === selectedRelationshipId)
      ?? workspace?.relationships[0],
    [selectedRelationshipId, workspace]
  );

  useEffect(() => {
    if (
      selectedRelationshipId !== undefined &&
      workspace?.relationships.some((item) => item.relationshipId === selectedRelationshipId) !== true
    ) {
      setSelectedRelationshipId(undefined);
    }
  }, [selectedRelationshipId, workspace]);

  if (loadState === "error") {
    return (
      <section aria-label="Ontology load error" className="border border-[var(--signal-red)] bg-[var(--console-panel)]/72 p-4">
        <p className="font-mono text-base text-[var(--signal-red)] sm:text-sm">Ontology unavailable</p>
        <p className="mt-3 text-base text-pretty text-[var(--paper-light)] sm:text-sm">
          {loadError ?? "The ledger-backed ontology DTO could not be loaded safely."}
        </p>
        <RepairButton onClick={onRetry}>Retry ontology replay</RepairButton>
      </section>
    );
  }

  if (workspace === undefined || loadState !== "loaded") {
    return (
      <section aria-label="Ontology loading state" className="border border-[var(--console-line)] bg-[var(--console-panel)]/72 p-4">
        <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Loading Ontology workspace</p>
        <p className="mt-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
          Replaying the append-only ledger into the accepted graph and provenance view.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Ontology provenance workspace" className="space-y-4">
      <header className="border-y border-[var(--console-line-strong)] py-4">
        <p className="font-mono text-base uppercase tracking-[0.16em] text-[var(--signal-red)] sm:text-sm">
          Rebuildable graph · high-water {workspace.sourceHighWaterMark}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-balance text-[var(--paper-light)]">Ontology</h1>
        <p className="mt-2 max-w-3xl text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
          Accepted entities and relationships are replayed from human-reviewed ledger events. Proposed material remains review context, never an accepted edge.
        </p>
      </header>

      {workspace.diagnostics.length > 0 ? (
        <section aria-label="Ontology diagnostics" className="border border-[var(--signal-red)] bg-[var(--console-panel)]/72 p-4">
          <h2 className="font-mono text-base text-[var(--signal-red)] sm:text-sm">Safe replay diagnostics</h2>
          <ul role="list" className="mt-3 space-y-3">
            {workspace.diagnostics.map((diagnostic) => (
              <li key={`${diagnostic.code}:${diagnostic.message}`} className="border-l border-[var(--signal-red)] pl-3">
                <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">{diagnostic.code}</p>
                <p className="mt-1 text-base text-pretty text-[var(--paper-light)] sm:text-sm">{diagnostic.message}</p>
                <p className="mt-2 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
                  Repair: {diagnostic.repairActions.join(" · ")}
                </p>
              </li>
            ))}
          </ul>
          <RepairButton onClick={onRetry}>Retry ontology replay</RepairButton>
        </section>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(15rem,0.8fr)_minmax(18rem,1fr)]">
        <div className="min-w-0 space-y-4">
          <section aria-label="Accepted ontology graph" className="border border-[var(--console-line)] bg-[var(--console-void)]/72">
            <SectionHeader title="Accepted graph" meta={`${workspace.entities.length} entities · ${workspace.relationships.length} relationships`} />
            {workspace.relationships.length === 0 ? (
              <p className="p-4 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
                No accepted relationship can be rendered from the current replay. Review diagnostics and provenance before repair.
              </p>
            ) : (
              <ul role="list" className="divide-y divide-[var(--console-line)]">
                {workspace.relationships.map((relationship) => (
                  <li key={relationship.relationshipId}>
                    <button
                      type="button"
                      aria-label={`Inspect relationship ${relationship.relationshipId}`}
                      aria-pressed={selectedRelationship?.relationshipId === relationship.relationshipId}
                      onClick={() => setSelectedRelationshipId(relationship.relationshipId)}
                      className="relative w-full min-w-0 px-4 py-3 text-left hover:bg-[var(--console-panel)] focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--signal-cyan)]"
                    >
                      <span className="block break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">
                        {relationship.relationshipId}
                      </span>
                      <span className="mt-1 block text-base text-[var(--paper-light)] sm:text-sm">
                        {relationship.fromEntityId} → {relationship.relationshipType} → {relationship.toEntityId}
                      </span>
                      <span className="mt-1 block font-mono text-base uppercase text-[var(--signal-amber)] sm:text-sm">
                        {relationship.reviewState}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Ontology review material" className="border border-[var(--console-line)] bg-[var(--console-void)]/72">
            <SectionHeader title="Review material — not graph edges" meta={`${workspace.assertions.length} assertions`} />
            <ul role="list" className="divide-y divide-[var(--console-line)]">
              {workspace.assertions.map((assertion) => (
                <AssertionRow key={assertion.assertionId} assertion={assertion} />
              ))}
            </ul>
          </section>
        </div>

        <RelationshipDetail relationship={selectedRelationship} assertions={workspace.assertions} />
      </div>
    </section>
  );
}

function RelationshipDetail({
  relationship,
  assertions
}: {
  readonly relationship: OntologyRelationshipDto | undefined;
  readonly assertions: readonly OntologyAssertionDto[];
}) {
  if (relationship === undefined) {
    return (
      <section aria-label="Relationship provenance" className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)]/72 p-4">
        <h2 className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Relationship provenance</h2>
        <p className="mt-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
          Select an accepted relationship after the projection is repaired.
        </p>
      </section>
    );
  }

  const reviewStateByAssertionId = new Map(
    assertions.map((assertion) => [assertion.assertionId, assertion.reviewState])
  );

  return (
    <section aria-label="Relationship provenance" className="min-w-0 self-start border border-[var(--console-line)] bg-[var(--console-void)]/72 p-4 xl:sticky xl:top-4">
      <p className="font-mono text-base uppercase tracking-[0.12em] text-[var(--signal-red)] sm:text-sm">Why this edge exists</p>
      <h2 className="mt-2 break-all text-xl font-semibold text-[var(--paper-light)]">{relationship.relationshipId}</h2>
      <dl className="mt-4 grid min-w-0 gap-3 text-base sm:text-sm">
        <Detail label="Type" values={[relationship.relationshipType]} />
        <Detail label="Review state" values={[relationship.reviewState]} tone="accepted" />
        <Detail
          label="Supporting assertions"
          values={relationship.supportingAssertionIds.map((id) => `${id} · ${reviewStateByAssertionId.get(id) ?? "unknown"}`)}
        />
        <Detail
          label="Contradicting assertions"
          values={relationship.contradictingAssertionIds.map((id) => `${id} · ${reviewStateByAssertionId.get(id) ?? "unknown"}`)}
          tone="contested"
        />
        <Detail label="Evidence IDs" values={relationship.evidenceIds} />
        <Detail label="Event references" values={relationship.eventIds} />
        <Detail
          label="Active pack versions"
          values={relationship.packVersions.map((pack) => `${pack.name}@${pack.version}`)}
        />
      </dl>
    </section>
  );
}

function AssertionRow({ assertion }: { readonly assertion: OntologyAssertionDto }) {
  const proposed = assertion.reviewState === "proposed";
  return (
    <li className="min-w-0 px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="break-all font-mono text-base text-[var(--paper-light)] sm:text-sm">{assertion.assertionId}</span>
        <span className={`font-mono text-base uppercase sm:text-sm ${proposed ? "text-[var(--signal-amber)]" : "text-[var(--signal-cyan)]"}`}>
          {assertion.reviewState}
        </span>
      </div>
      <p className="mt-1 break-words text-base text-[var(--muted-amber)] sm:text-sm">
        {assertion.predicate} · evidence {assertion.evidenceId}
      </p>
    </li>
  );
}

function Detail({
  label,
  values,
  tone = "neutral"
}: {
  readonly label: string;
  readonly values: readonly string[];
  readonly tone?: "neutral" | "accepted" | "contested";
}) {
  const toneClass = tone === "accepted"
    ? "text-[var(--signal-cyan)]"
    : tone === "contested"
      ? "text-[var(--signal-amber)]"
      : "text-[var(--paper-light)]";
  return (
    <div className="min-w-0 border-t border-[var(--console-line)] pt-3 first:border-t-0 first:pt-0">
      <dt className="font-mono uppercase text-[var(--muted-amber)]">{label}</dt>
      <dd className={`mt-1 min-w-0 break-all ${toneClass}`}>
        {values.length === 0 ? "None recorded" : values.join(" · ")}
      </dd>
    </div>
  );
}

function SectionHeader({ title, meta }: { readonly title: string; readonly meta: string }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--console-line)] px-4 py-3">
      <h2 className="text-base font-semibold text-[var(--paper-light)]">{title}</h2>
      <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">{meta}</span>
    </header>
  );
}

function RepairButton({ onClick, children }: { readonly onClick: () => void; readonly children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative mt-4 min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-amber)] hover:border-[var(--signal-amber)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:text-sm"
    >
      <span aria-hidden="true" className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2" />
      {children}
    </button>
  );
}
