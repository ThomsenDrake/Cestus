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

  it("quarantines duplicate legacy claim ids before candidate emission", () => {
    const result = parseLegacyClaimMetadata({
      sourcePath: "ontology/claims.json",
      contentHash,
      text: JSON.stringify({
        legacyCestusType: "claims",
        claims: [
          {
            id: "legacy_claim_duplicate",
            predicate: "agency.name",
            object: "Example Agency",
            confidence: 0.8
          },
          {
            id: "legacy_claim_duplicate",
            predicate: "agency.altName",
            object: "Example Agency Alt",
            confidence: 0.7
          }
        ]
      })
    });

    expect(result.candidates).toEqual([]);
    expect(result.quarantineEntries).toHaveLength(1);
    expect(result.quarantineEntries[0]).toMatchObject({
      issueCategory: "conflict",
      legacyIds: ["legacy_claim_duplicate"]
    });
  });

  it("uses deterministic tuple identity for claim candidates", () => {
    const text = JSON.stringify({
      legacyCestusType: "claims",
      claims: [{ id: "legacy_claim_1", predicate: "agency.name", object: "Example Agency" }]
    });
    const first = parseLegacyClaimMetadata({ sourcePath: "ontology/claims.json", contentHash, text });
    const repeated = parseLegacyClaimMetadata({ sourcePath: "ontology/claims.json", contentHash, text });
    const changedPath = parseLegacyClaimMetadata({ sourcePath: "ontology/claims-copy.json", contentHash, text });
    const changedHash = parseLegacyClaimMetadata({
      sourcePath: "ontology/claims.json",
      contentHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      text
    });
    const changedLegacyId = parseLegacyClaimMetadata({
      sourcePath: "ontology/claims.json",
      contentHash,
      text: JSON.stringify({
        legacyCestusType: "claims",
        claims: [{ id: "legacy_claim_2", predicate: "agency.name", object: "Example Agency" }]
      })
    });

    expect(first.candidates[0]?.candidateId).toBe(repeated.candidates[0]?.candidateId);
    expect(first.candidates[0]?.observationId).toBe(repeated.candidates[0]?.observationId);
    expect(new Set([
      first.candidates[0]?.candidateId,
      changedPath.candidates[0]?.candidateId,
      changedHash.candidates[0]?.candidateId,
      changedLegacyId.candidates[0]?.candidateId
    ]).size).toBe(4);
  });

  it("keeps delimiter-bearing identity parts distinct", () => {
    const firstHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;
    const secondHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const;
    const first = parseLegacyClaimMetadata({
      sourcePath: "a",
      contentHash: firstHash,
      text: JSON.stringify({
        legacyCestusType: "claims",
        claims: [{
          id: `x:${secondHash}:z`,
          predicate: "agency.name",
          object: "Example Agency"
        }]
      })
    });
    const second = parseLegacyClaimMetadata({
      sourcePath: `a:${firstHash}:x`,
      contentHash: secondHash,
      text: JSON.stringify({
        legacyCestusType: "claims",
        claims: [{ id: "z", predicate: "agency.name", object: "Example Agency" }]
      })
    });

    expect(first.candidates[0]?.candidateId).not.toBe(second.candidates[0]?.candidateId);
    expect(first.candidates[0]?.observationId).not.toBe(second.candidates[0]?.observationId);
  });

  it("quarantines unsupported explicit claim shapes", () => {
    const invalidConfidence = parseLegacyClaimMetadata({
      sourcePath: "ontology/claims.json",
      contentHash,
      text: JSON.stringify({
        legacyCestusType: "claims",
        claims: [{ id: "legacy_claim_confidence", predicate: "agency.name", object: "Example Agency", confidence: 1.1 }]
      })
    });
    const nonPrimitiveObject = parseLegacyClaimMetadata({
      sourcePath: "ontology/claims.json",
      contentHash,
      text: JSON.stringify({
        legacyCestusType: "claims",
        claims: [{ id: "legacy_claim_object", predicate: "agency.name", object: { name: "Example Agency" } }]
      })
    });
    const missingClaims = parseLegacyClaimMetadata({
      sourcePath: "ontology/claims.json",
      contentHash,
      text: JSON.stringify({ legacyCestusType: "claims" })
    });

    expect(invalidConfidence.candidates).toEqual([]);
    expect(nonPrimitiveObject.candidates).toEqual([]);
    expect(missingClaims.candidates).toEqual([]);
    expect(invalidConfidence.quarantineEntries[0]).toMatchObject({
      issueCategory: "unsupported",
      legacyIds: ["legacy_claim_confidence"]
    });
    expect(nonPrimitiveObject.quarantineEntries[0]).toMatchObject({
      issueCategory: "unsupported",
      legacyIds: ["legacy_claim_object"]
    });
    expect(missingClaims.quarantineEntries[0]).toMatchObject({
      issueCategory: "unsupported",
      legacyIds: []
    });
  });
});
