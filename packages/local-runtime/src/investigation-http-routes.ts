import { z } from "zod";
import { KnowledgeService } from "../../ontology/src/knowledge-service.js";
import { prepareCaseComparison } from "../../ontology/src/case-comparison.js";
import {
  InvestigationRecordsService,
  InvestigationRecordError,
} from "../../ontology/src/investigation-records.js";
import { investigationRecordSchema } from "../../ontology/src/knowledge-contracts.js";
import {
  resolveKnowledgeCitation,
  resolveExternalDocumentSelection,
} from "./evidence-content.js";
import type { MountedWorkspace } from "../../ingestion/src/mount-contract.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import type { DocumentProcessingService } from "./document-processing.js";
import type {
  LocalRuntimeRequest,
  LocalRuntimeResponse,
} from "./http-handler.js";

/** The comparison projection can contain only currently reviewed transferable sources. */
export function comparisonKnowledgeService(workspace: MountedWorkspace) {
  return new KnowledgeService({
    ledger: workspace.ledger,
    workspaceId: workspace.workspaceId,
    resolveCitation: async (citation, actor) => {
      await resolveKnowledgeCitation(workspace, actor, citation);
      await resolveExternalDocumentSelection(workspace, actor, {
        evidenceId: citation.evidenceId,
        extractionId: citation.extractionId!,
        passageIndexes: [citation.passageIndex],
      });
    },
    // Memberships of records without knowledge are not eligible and never enter comparisons.
    authorizeEvidence: async () => {},
  });
}
export async function resolveCaseComparison(
  workspace: MountedWorkspace,
  actor: ActorRef,
  caseIds?: string[],
) {
  return prepareCaseComparison(
    await comparisonKnowledgeService(workspace).read(actor),
    caseIds,
  );
}
export async function handleInvestigationHttpRoute(input: {
  request: LocalRuntimeRequest;
  workspace?: MountedWorkspace | undefined;
  actor: ActorRef;
  processing?: DocumentProcessingService | undefined;
}): Promise<LocalRuntimeResponse> {
  const { workspace, actor, request, processing } = input;
  if (
    !workspace?.capabilities.canReadLedger ||
    !workspace.capabilities.canAppendLedger ||
    actor.kind !== "human" ||
    !processing
  )
    return json(503, {
      message:
        "Mount a writable portable workspace and sign in as its investigator.",
    });
  const url = new URL(request.url, "http://localhost");
  const records = new InvestigationRecordsService({
    ledger: workspace.ledger,
    workspaceId: workspace.workspaceId,
    resolveCitation: (ref, who) =>
      resolveKnowledgeCitation(workspace, who, ref),
  });
  try {
    if (request.method === "GET" && url.pathname === "/api/investigation") {
      const revision = (await workspace.ledger.readAll()).length;
      const selected = url.searchParams.get("caseIds");
      const caseIds =
        selected === null
          ? undefined
          : z
              .array(z.string().min(1).max(200))
              .max(12)
              .parse(selected ? selected.split(",") : []);
      const dto = await comparisonKnowledgeService(workspace).read(actor);
      const eligible = dto.cases.filter((c) =>
        dto.proposals.some(
          (p) =>
            p.reviewState === "accepted" &&
            dto.memberships.some(
              (m) =>
                m.included &&
                m.caseId === c.caseId &&
                (m.targetKind === "evidence"
                  ? p.evidence.some((e) => e.evidenceId === m.targetId)
                  : m.targetKind === "knowledge"
                    ? p.assertionId === m.targetId
                    : dto.entities.some(
                        (e) =>
                          e.entityId === m.targetId &&
                          e.assertionIds.includes(p.assertionId),
                      )),
            ),
        ),
      );
      let context = null,
        limitation: string | undefined;
      try {
        context = prepareCaseComparison(dto, caseIds);
      } catch {
        limitation =
          "Insufficient eligible knowledge or this selection exceeds comparison limits. Select up to 12 cases with at most 100 assertions and 24 source passages; unresolved endpoints require review.";
      }
      const saved = context
        ? await records.read(actor, { caseIds: context.scope.comparedCaseIds })
        : { records: [] };
      const visible = [];
      for (const record of saved.records) {
        let stale = Boolean(record.staleAssertionIds.length);
        if (record.scopeFingerprint) {
          try {
            stale ||=
              prepareCaseComparison(dto, record.caseIds).fingerprint !==
              record.scopeFingerprint;
          } catch {
            stale = true;
          }
        }
        visible.push({ ...record, stale });
      }
      const jobs = [];
      for (const job of (caseIds?.length === 0
        ? []
        : await processing.list(actor)
      ).slice(-100)) {
        const { manifest } = await processing.previewDetails(
          job.invocationId,
          actor,
        );
        if (
          manifest.comparison &&
          (!caseIds ||
            manifest.comparison.context.scope.comparedCaseIds.every((id) =>
              caseIds.includes(id),
            ))
        )
          jobs.push(job);
      }
      if ((await workspace.ledger.readAll()).length !== revision)
        throw new Error("Investigation authority changed during read.");
      return json(200, {
        revision,
        eligibleCases: eligible
          .slice(0, 100)
          .map(({ caseId, title }) => ({ caseId, title })),
        context,
        ...(limitation ? { limitation } : {}),
        records: visible,
        jobs,
      });
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/investigation/preview"
    )
      return json(
        200,
        await processing.previewComparison(
          JSON.parse(request.body ?? "{}"),
          actor,
        ),
      );
    if (
      request.method === "POST" &&
      url.pathname === "/api/investigation/records"
    ) {
      const command = z
        .object({
          decisionId: z.string(),
          expectedRevision: z.number(),
          record: investigationRecordSchema,
        })
        .strict()
        .parse(JSON.parse(request.body ?? "{}"));
      const prior = (await workspace.ledger.readAll()).some(
        (event) =>
          event.type === "investigation.record.saved" &&
          event.payload.workspaceId === workspace.workspaceId &&
          event.payload.recordId === command.record.recordId,
      );
      if (!prior && !command.record.invocationId) {
        const authoring = await resolveCaseComparison(
          workspace,
          actor,
          command.record.caseIds,
        );
        if (
          command.record.scopeFingerprint &&
          command.record.scopeFingerprint !== authoring.fingerprint
        )
          throw new Error("Authoring scope changed; refresh before saving.");
        command.record.scopeFingerprint = authoring.fingerprint;
        command.record.citations = [
          ...new Map(
            [
              ...command.record.citations,
              ...authoring.passages.map((p) => p.citation),
            ].map((c) => [JSON.stringify(c), c]),
          ).values(),
        ];
      }
      if (command.record.invocationId) {
        const output = (await processing.output(
          command.record.invocationId,
          actor,
        )) as {
          schemaVersion?: string;
          comparison?: {
            fingerprint: string;
            scope: { comparedCaseIds: string[] };
            passages: { citation: unknown }[];
          };
        };
        if (
          output.schemaVersion !== "case-comparison.v1" ||
          !output.comparison ||
          command.record.scopeFingerprint !== output.comparison.fingerprint ||
          output.comparison.scope.comparedCaseIds.some(
            (id) => !command.record.caseIds.includes(id),
          )
        )
          throw new Error("Pattern source run and retained scope must match.");
        // Retain every examined source, including counterexamples, when preserving provider prose.
        for (const { citation } of output.comparison.passages)
          if (
            !command.record.citations.some(
              (ref) => JSON.stringify(ref) === JSON.stringify(citation),
            )
          )
            throw new Error(
              "Saving requires every examined citation dependency.",
            );
      }
      await records.execute(command, actor);
      return json(200, { ok: true });
    }
    return json(404, { message: "Investigation operation unavailable." });
  } catch (error) {
    return json(409, {
      message:
        error instanceof InvestigationRecordError
          ? error.message
          : "Action blocked. Refresh the examined scope, current source authority and exact approval before trying again.",
    });
  }
}
function json(status: number, value: unknown): LocalRuntimeResponse {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(value),
  };
}
