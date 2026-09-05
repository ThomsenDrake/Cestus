import type { EvidenceLocator } from "../../../ontology/src/extraction-contracts.js";

export function locatorLabel(locator: EvidenceLocator) {
  if (locator.kind === "csv") return `Row ${locator.row}, cell ${locator.column}`;
  return `${locator.kind === "pdf" ? `Page ${locator.page}, ` : ""}block ${locator.block}, characters ${locator.start}–${locator.end}`;
}
