import { describe, expect, it } from "vitest";
import { parseLegacyClaimMetadata } from "../src/legacy-claim-parser.js";

const contentHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const;

describe("legacy claim parser", () => {
  it("creates proposed assertion candidates only for explicit legacy claims metadata", () => {
    const result = parseLegacyClaimMetadata({
      sourcePath: "ontology/claims.json",
      contentHash,
      text: JSON.stringify({
        legacyCestusType: "claims",
        claims: [{
          id: "legacy_claim_1",
          subjectRef: "legacy:agency:example",
          predicate: "agency.name",
          object: "Example Agency",
          confidence: 0.8
        }]
      })
    });

    expect(result.candidates).toEqual([{
      candidateId: expect.stringMatching(/^legacy_candidate_/),
      observationId: expect.stringMatching(/^legacy_observation_/),
      evidenceContentHash: contentHash,
      sourcePath: "ontology/claims.json",
      subjectRef: "legacy:agency:example",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.8
    }]);
    expect(result.quarantineEntries).toEqual([]);
  });

  it("keeps generic JSON out of ontology staging", () => {
    const result = parseLegacyClaimMetadata({
      sourcePath: "notes/random.json",
      contentHash,
      text: JSON.stringify({ agency: "Example Agency" })
    });

    expect(result.candidates).toEqual([]);
    expect(result.quarantineEntries).toEqual([]);
  });

  it("quarantines malformed and incomplete explicit claim records", () => {
    const malformed = parseLegacyClaimMetadata({
      sourcePath: "ontology/corrupt.json",
      contentHash,
      text: "{\"legacyCestusType\":"
    });
    const incomplete = parseLegacyClaimMetadata({
      sourcePath: "ontology/claims.json",
      contentHash,
      text: JSON.stringify({ legacyCestusType: "claims", claims: [{ id: "legacy_claim_missing" }] })
    });

    expect(malformed.quarantineEntries[0]).toMatchObject({
      issueCategory: "malformed",
      sourcePath: "ontology/corrupt.json"
    });
    expect(incomplete.quarantineEntries[0]).toMatchObject({
      issueCategory: "unsupported",
      legacyIds: ["legacy_claim_missing"]
    });
    expect(JSON.stringify([...malformed.quarantineEntries, ...incomplete.quarantineEntries]))
      .not.toMatch(/token|secret|password/i);
  });
});
