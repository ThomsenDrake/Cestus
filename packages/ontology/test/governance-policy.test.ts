import { describe, expect, it } from "vitest";
import {
  assertSecretSafeText,
  defaultGovernancePolicy,
  evaluateGovernanceWorkflowAccess,
  governanceTags,
  isHighConfidence,
  protectedGovernanceCapabilities,
  publicSafeDefaultTags,
  restrictedExportTags,
  validateGovernancePolicy
} from "../src/governance-policy.js";

describe("governance policy helpers", () => {
  it("defines independent governance tags and export defaults", () => {
    expect(governanceTags).toContain("public_record");
    expect(governanceTags).toContain("contains_pii");
    expect(governanceTags).toContain("source_identity");
    expect(publicSafeDefaultTags).toEqual(["public_safe"]);
    expect(restrictedExportTags).toContain("contains_pii");
    expect(restrictedExportTags).toContain("private_correspondence");
  });

  it("validates the default policy", () => {
    expect(validateGovernancePolicy(defaultGovernancePolicy)).toEqual(defaultGovernancePolicy);
  });

  it("uses a visible high-confidence threshold", () => {
    expect(isHighConfidence(0.94, defaultGovernancePolicy)).toBe(true);
    expect(isHighConfidence(0.79, defaultGovernancePolicy)).toBe(false);
  });

  it("allows high-confidence classification to unlock only ordinary internal workflow", () => {
    const classification = {
      status: "succeeded" as const,
      proposedTag: "public_safe",
      confidence: 0.96
    };

    expect(evaluateGovernanceWorkflowAccess({
      capability: "ordinary_internal_workflow",
      classification
    })).toEqual({
      capability: "ordinary_internal_workflow",
      allowed: true,
      reason: "high-confidence-classification"
    });

    for (const capability of protectedGovernanceCapabilities) {
      expect(evaluateGovernanceWorkflowAccess({ capability, classification })).toMatchObject({
        capability,
        allowed: false,
        reason: "human-gate-required",
        repairHint: {
          code: "human-approval-required",
          action: "use-protected-human-workflow"
        }
      });
    }
  });

  it("locks low, missing, failed, and unknown-tag classifications with exact repair hints", () => {
    const cases = [
      {
        classification: { status: "succeeded" as const, proposedTag: "public_safe", confidence: 0.62 },
        reason: "low-confidence" as const,
        action: "request-human-governance-review" as const
      },
      {
        classification: { status: "missing" as const },
        reason: "classification-missing" as const,
        action: "record-governance-classification" as const
      },
      {
        classification: { status: "failed" as const },
        reason: "classification-failed" as const,
        action: "retry-or-review-classification" as const
      },
      {
        classification: { status: "succeeded" as const, proposedTag: "unrecognized_tag", confidence: 0.99 },
        reason: "unknown-tag" as const,
        action: "replace-unknown-governance-tag" as const
      }
    ];

    for (const testCase of cases) {
      expect(evaluateGovernanceWorkflowAccess({
        capability: "ordinary_internal_workflow",
        classification: testCase.classification
      })).toEqual({
        capability: "ordinary_internal_workflow",
        allowed: false,
        reason: testCase.reason,
        repairHint: {
          code: "governance-review-required",
          action: testCase.action
        }
      });
    }
  });

  it("rejects governance policies with low-confidence thresholds", () => {
    expect(() => validateGovernancePolicy({ ...defaultGovernancePolicy, confidenceThreshold: 0.1 })).toThrow(
      "Governance policy confidenceThreshold must stay high enough for automatic workflow unlocks"
    );
  });

  it("treats non-finite and out-of-range confidence values as low confidence", () => {
    expect(isHighConfidence(1.5, defaultGovernancePolicy)).toBe(false);
    expect(isHighConfidence(-0.1, defaultGovernancePolicy)).toBe(false);
    expect(isHighConfidence(Infinity, defaultGovernancePolicy)).toBe(false);
    expect(isHighConfidence(Number.NaN, defaultGovernancePolicy)).toBe(false);
  });

  it("rejects secret-bearing policy text", () => {
    expect(() => assertSecretSafeText("rotate access_token abc123")).toThrow(
      "Governance text must not contain secrets"
    );
  });

  it("rejects common secret-looking values", () => {
    const secretTexts = [
      "AWS_SECRET_ACCESS_KEY=abc123",
      "access_token=abc123",
      "api_key: abc123",
      "Authorization: Bearer abc123",
      "sk-proj-abc123",
      "access token abc123",
      "api key abc123",
      "token abc123",
      "password abc123",
      "private key abc123",
      "client secret abc123",
      "refresh secret abc123",
      "session secret abc123",
      "oauth token abc123"
    ];

    for (const text of secretTexts) {
      expect(() => assertSecretSafeText(text), text).toThrow("Governance text must not contain secrets");
    }
  });

  it("allows descriptive credential-risk text without secret-looking values", () => {
    expect(assertSecretSafeText("evidence may contain a password and requires review")).toBe(
      "evidence may contain a password and requires review"
    );
  });

  it("does not reject safe tag text solely because it names credential_risk", () => {
    expect(assertSecretSafeText("credential_risk evidence requires review")).toBe(
      "credential_risk evidence requires review"
    );
  });

  it("requires every core governance tag exactly once", () => {
    const duplicatePolicy = {
      ...defaultGovernancePolicy,
      tags: defaultGovernancePolicy.tags.map((entry) =>
        entry.tag === "public_record" ? { ...entry, tag: "public_safe" as const } : entry
      )
    };

    expect(() => validateGovernancePolicy(duplicatePolicy)).toThrow(
      "Governance policy must define each core governance tag exactly once"
    );
  });

  it("rejects unknown policy keys", () => {
    expect(() => validateGovernancePolicy({ ...defaultGovernancePolicy, extra: true })).toThrow(
      "Invalid governance policy"
    );

    expect(() =>
      validateGovernancePolicy({
        ...defaultGovernancePolicy,
        tags: defaultGovernancePolicy.tags.map((entry) =>
          entry.tag === "public_safe" ? { ...entry, reviewNote: "safe extra key" } : entry
        )
      })
    ).toThrow("Invalid governance policy");
  });
});
