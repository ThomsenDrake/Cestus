import { describe, expect, it } from "vitest";
import {
  assertSecretSafeText,
  defaultGovernancePolicy,
  governanceTags,
  isHighConfidence,
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

  it("rejects secret-bearing policy text", () => {
    expect(() => assertSecretSafeText("rotate access_token abc123")).toThrow(
      "Governance text must not contain secrets"
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
});
