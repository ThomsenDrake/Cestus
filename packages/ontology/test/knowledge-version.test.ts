import { describe, it, expect } from "vitest";
import { validateKnowledgeEvent } from "../src/contracts.js";
const event = { id: "evt_case", streamId: "case_one", sequence: 1, context: { actor: { id: "human_one", label: "Investigator", kind: "human" }, occurredAt: "2026-09-05T12:00:00.000Z", correlationId: "decision_one", coreVersion: "0.2.0", packVersions: {} }, type: "investigation.created", version: 2, payload: { caseId: "case_one", title: "Synthetic contract inquiry", question: "Who received the award?", scope: "Synthetic records", notes: "" } };
describe("version-aware shared knowledge events", () => {
  it("decodes the new version without loosening old versions", () => {
    expect(validateKnowledgeEvent(event).success).toBe(true);
    expect(validateKnowledgeEvent({ ...event, version: 1 }).success).toBe(false);
    expect(validateKnowledgeEvent({ ...event, version: 3 }).success).toBe(false);
    const old = { ...event, type: "assertion.proposed", version: 1, payload: { assertionId: "as_old", evidenceId: "ev_old", predicate: "amount", object: 1200, confidence: 0.5, reviewState: "proposed" } };
    expect(validateKnowledgeEvent(old).data).toEqual(old);
    expect(validateKnowledgeEvent({ ...old, version: 2 }).success).toBe(false);
  });
  it("requires human authority for case decisions", () => {
    expect(validateKnowledgeEvent({ ...event, context: { ...event.context, actor: { ...event.context.actor, kind: "agent" } } }).success).toBe(false);
  });
});
