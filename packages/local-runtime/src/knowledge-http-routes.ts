import { z } from "zod";
import { KnowledgeService, KnowledgeCommandError } from "../../ontology/src/knowledge-service.js";
import { knowledgeProposalSchema } from "../../ontology/src/knowledge-contracts.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import type { MountedWorkspace } from "../../ingestion/src/mount-contract.js";
import { buildGovernanceProjection } from "../../ontology/src/governance-projection.js";
import { resolveKnowledgeCitation } from "./evidence-content.js";
import type { DocumentProcessingService } from "./document-processing.js";
import type { LocalRuntimeRequest, LocalRuntimeResponse } from "./http-handler.js";

export function createWorkspaceKnowledgeService(workspace: MountedWorkspace) {
  return new KnowledgeService({ ledger: workspace.ledger, workspaceId: workspace.workspaceId,
    resolveCitation: (ref, actor) => resolveKnowledgeCitation(workspace, actor, ref),
    // Legacy whole-document provenance needs current policy authority, not a fabricated passage or derivative.
    authorizeEvidence: async (id, actor) => {
      const events = await workspace.ledger.readAll();
      const state = buildGovernanceProjection(events).evidenceGovernance.get(id);
      if (actor.kind !== "human" || !state || !events.some(event => event.type === "evidence.ingested" && event.payload.evidenceId === id && event.streamId === `evidence_${id}`)
        || state?.quarantined || state?.tombstoned || state?.currentTags.get("credential_risk")?.status === "active"
        || events.some(event => event.type === "evidence.redaction.applied" && event.payload.evidenceId === id)) throw new Error("Evidence history is unavailable under current governance.");
    }
  });
}

export async function handleKnowledgeHttpRoute(input: { request: LocalRuntimeRequest; workspace: MountedWorkspace | undefined; actor: ActorRef; processing: DocumentProcessingService | undefined }): Promise<LocalRuntimeResponse | undefined> {
  const path = new URL(input.request.url, "http://localhost").pathname;
  if (!["/api/ontology/knowledge", "/api/ontology/commands", "/api/ontology/import-provider"].includes(path)) return undefined;
  if (!input.workspace?.capabilities.canReadLedger || !input.workspace.capabilities.canAppendLedger || input.actor.kind !== "human") return json(503, { ok: false, message: "Mount a writable portable workspace and sign in as its investigator." });
  const workspace = input.workspace;
  const service = createWorkspaceKnowledgeService(workspace);
  try {
    if (input.request.method === "GET" && path === "/api/ontology/knowledge") return json(200, await service.read(input.actor));
    if (input.request.method !== "POST") return json(405, { ok: false, message: "Use the displayed review controls." });
    const body: unknown = JSON.parse(input.request.body ?? "{}");
    if (path === "/api/ontology/import-provider") {
      const parsed = z.object({ invocationId: z.string().regex(/^inv_[A-Za-z0-9_-]+$/), decisionId: z.string().min(1).max(200), expectedRevision: z.number().int().nonnegative() }).strict().parse(body);
      if (!input.processing) throw new Error("Provider processing output unavailable.");
      const output = z.object({ schemaVersion: z.literal("knowledge-extraction.v1"), output: z.object({ proposals: z.array(knowledgeProposalSchema).min(1).max(40) }) }).passthrough().parse(await input.processing.output(parsed.invocationId, input.actor));
      return json(200, await service.execute({ action: "propose", decisionId: parsed.decisionId, expectedRevision: parsed.expectedRevision, proposals: output.output.proposals }, input.actor));
    }
    if (typeof body === "object" && body !== null && "action" in body && body.action === "propose") {
      const manual = z.object({ proposals: z.array(knowledgeProposalSchema).min(1).max(40) }).passthrough().parse(body);
      if (manual.proposals.some(proposal => proposal.provenance.kind !== "manual" || Object.keys(proposal.provenance).length !== 1 || proposal.modelScore !== undefined)) throw new Error("Manual proposals cannot claim provider provenance.");
    }
    return json(200, await service.execute(body, input.actor));
  } catch (error) {
    if (error instanceof KnowledgeCommandError) return json(409, { ok: false, message: error.message });
    return json(409, { ok: false, message: "Decision blocked. Refresh the ontology, check the selected source passage, vocabulary, identity endpoints and current review state, then submit a fresh decision. Nothing from this decision was partially accepted." });
  }
}
function json(status: number, body: unknown): LocalRuntimeResponse { return { status, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) }; }
