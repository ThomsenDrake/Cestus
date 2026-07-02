import { describe, expect, it } from "vitest";
import { evaluateLegalEscalationGate, type CitedRule } from "../src/deadlines.js";

const citedRule: CitedRule = {
  jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
  label: "FOIA determination deadline",
  citation: "5 U.S.C. 552(a)(6)(A)(i)"
};

describe("legal escalation gate", () => {
  it("blocks escalation when no explicit user confirmation exists", () => {
    const result = evaluateLegalEscalationGate({
      prrRequestId: "prr_req_001",
      hasConfirmedDeadlineBasis: true,
      hasUserConfirmedStalling: false,
      citedRules: [citedRule],
      evidenceIds: ["ev_correspondence_001"],
      userConfirmedEscalation: false
    });

    expect(result.ready).toBe(false);
    expect(result.missing).toContain("userConfirmedEscalation");
  });

  it("allows escalation with a confirmed deadline basis, citation, evidence, and user confirmation", () => {
    const result = evaluateLegalEscalationGate({
      prrRequestId: "prr_req_001",
      hasConfirmedDeadlineBasis: true,
      hasUserConfirmedStalling: false,
      citedRules: [citedRule],
      evidenceIds: ["ev_correspondence_001"],
      userConfirmedEscalation: true
    });

    expect(result).toEqual({ ready: true, missing: [] });
  });

  it("allows escalation with user-confirmed stalling instead of a confirmed deadline basis", () => {
    const result = evaluateLegalEscalationGate({
      prrRequestId: "prr_req_001",
      hasConfirmedDeadlineBasis: false,
      hasUserConfirmedStalling: true,
      citedRules: [citedRule],
      evidenceIds: ["ev_correspondence_001"],
      userConfirmedEscalation: true
    });

    expect(result).toEqual({ ready: true, missing: [] });
  });

  it("blocks escalation when only an unconfirmed estimated deadline basis exists", () => {
    const result = evaluateLegalEscalationGate({
      prrRequestId: "prr_req_001",
      hasConfirmedDeadlineBasis: false,
      hasUserConfirmedStalling: false,
      citedRules: [citedRule],
      evidenceIds: ["ev_correspondence_001"],
      userConfirmedEscalation: true
    });

    expect(result.ready).toBe(false);
    expect(result.missing).toContain("confirmedDeadlineOrStallingBasis");
  });

  it("reports missing citation and evidence prerequisites", () => {
    const result = evaluateLegalEscalationGate({
      prrRequestId: "prr_req_001",
      hasConfirmedDeadlineBasis: true,
      hasUserConfirmedStalling: false,
      citedRules: [],
      evidenceIds: [],
      userConfirmedEscalation: true
    });

    expect(result).toEqual({
      ready: false,
      missing: ["citedRules", "evidenceIds"]
    });
  });

  it("throws a clear error for invalid prrRequestId values", () => {
    expect(() =>
      evaluateLegalEscalationGate({
        prrRequestId: "request_001",
        hasConfirmedDeadlineBasis: true,
        hasUserConfirmedStalling: false,
        citedRules: [citedRule],
        evidenceIds: ["ev_correspondence_001"],
        userConfirmedEscalation: true
      })
    ).toThrow("Invalid prrRequestId");
  });

  it("throws a clear error for invalid evidence IDs", () => {
    expect(() =>
      evaluateLegalEscalationGate({
        prrRequestId: "prr_req_001",
        hasConfirmedDeadlineBasis: true,
        hasUserConfirmedStalling: false,
        citedRules: [citedRule],
        evidenceIds: ["not_evidence"],
        userConfirmedEscalation: true
      })
    ).toThrow("Invalid evidenceIds[0]");
  });

  it("throws a clear error for cited rules with empty citation metadata", () => {
    expect(() =>
      evaluateLegalEscalationGate({
        prrRequestId: "prr_req_001",
        hasConfirmedDeadlineBasis: true,
        hasUserConfirmedStalling: false,
        citedRules: [{ ...citedRule, label: "" }],
        evidenceIds: ["ev_correspondence_001"],
        userConfirmedEscalation: true
      })
    ).toThrow("Invalid citedRules[0].label");

    expect(() =>
      evaluateLegalEscalationGate({
        prrRequestId: "prr_req_001",
        hasConfirmedDeadlineBasis: true,
        hasUserConfirmedStalling: false,
        citedRules: [{ ...citedRule, citation: "" }],
        evidenceIds: ["ev_correspondence_001"],
        userConfirmedEscalation: true
      })
    ).toThrow("Invalid citedRules[0].citation");
  });

  it("throws a clear error for cited rules with empty jurisdiction pack references", () => {
    expect(() =>
      evaluateLegalEscalationGate({
        prrRequestId: "prr_req_001",
        hasConfirmedDeadlineBasis: true,
        hasUserConfirmedStalling: false,
        citedRules: [{ ...citedRule, jurisdictionPack: { name: "", version: "0.1.0" } }],
        evidenceIds: ["ev_correspondence_001"],
        userConfirmedEscalation: true
      })
    ).toThrow("Invalid citedRules[0].jurisdictionPack.name");

    expect(() =>
      evaluateLegalEscalationGate({
        prrRequestId: "prr_req_001",
        hasConfirmedDeadlineBasis: true,
        hasUserConfirmedStalling: false,
        citedRules: [{ ...citedRule, jurisdictionPack: { name: "us-federal-foia", version: "" } }],
        evidenceIds: ["ev_correspondence_001"],
        userConfirmedEscalation: true
      })
    ).toThrow("Invalid citedRules[0].jurisdictionPack.version");
  });
});
