import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";

export function writeLegacyCestusFixture(root: string): void {
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "ontology"), { recursive: true });

  writeFileSync(join(root, "docs", "contract.txt"), "contract body");
  writeFileSync(join(root, "docs", "contract-copy.txt"), "contract body");
  writeFileSync(
    join(root, "ontology", "claims.json"),
    JSON.stringify(
      {
        legacyCestusType: "claims",
        claims: [
          {
            id: "legacy_claim_1",
            predicate: "agency.name",
            object: "Example Agency"
          }
        ]
      },
      null,
      2
    )
  );
  writeFileSync(join(root, "ontology", "corrupt.json"), "{\"legacyCestusType\":");
}

export function writeLegacyCestusArchiveFixture(root: string): void {
  mkdirSync(join(root, "archives"), { recursive: true });
  mkdirSync(join(root, "ontology"), { recursive: true });

  writeFileSync(
    join(root, "ontology", "claims.json"),
    JSON.stringify({ legacyCestusType: "claims", claims: [] }, null, 2)
  );
  writeFileSync(
    join(root, "archives", "legacy.zip"),
    zipSync({
      "ontology/claims.json": strToU8(JSON.stringify({ legacyCestusType: "claims", claims: [] }, null, 2)),
      "notes/readme.md": strToU8("# Legacy notes\n")
    })
  );
}

export function writeLargeLegacyPreviewFixture(root: string): void {
  mkdirSync(join(root, "ontology"), { recursive: true });
  writeFileSync(
    join(root, "ontology", "large-claims.json"),
    `${JSON.stringify({ legacyCestusType: "claims" })}\n${"a".repeat(8192)}`
  );
}
