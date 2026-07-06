import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
