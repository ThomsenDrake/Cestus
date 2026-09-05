import { useState } from "react";
import type { KnowledgeCitation, KnowledgeProposal, KnowledgeValue } from "../../../ontology/src/knowledge-contracts.js";
import { isGroundedDate, normalizeWrittenDate, partialDateSchema } from "../../../ontology/src/knowledge-dates.js";

export function interpretDateValue(raw: string, evidence: readonly KnowledgeCitation[]): Extract<KnowledgeValue, { type: "date" }> {
  if (partialDateSchema.safeParse(raw).success) return { type: "date", value: raw };
  const value = normalizeWrittenDate(raw);
  if (!value) throw new Error("Date unresolved. Use a complete unambiguous written date, month and year, or an evidence-backed ISO date. Numeric order and relative dates are not guessed.");
  const citationIndex = evidence.findIndex(citation => isGroundedDate(value, citation.quote, { method: "written-date.v1", sourceExpression: raw, citationIndex: 0 }));
  if (citationIndex < 0) throw new Error("Add the exact supporting passage containing this written date before interpreting it.");
  return { type: "date", value, normalization: { method: "written-date.v1", sourceExpression: raw, citationIndex } };
}

export function DateInput({ label, name, initial = "", className }: { label: string; name: string; initial?: string; className: string }) {
  const [raw, setRaw] = useState(initial);
  return <div className="min-w-0"><label className="flex min-w-0 flex-col gap-1">{label}<input className={className} name={name} value={raw} onChange={event => setRaw(event.target.value)} placeholder="September 5, 2026; 2026-09; blank if unknown" /></label><DateInputPreview raw={raw} /></div>;
}
export function DateInputPreview({ raw }: { raw: string }) {
  if (!raw || partialDateSchema.safeParse(raw).success) return null;
  const value = normalizeWrittenDate(raw);
  return <p className="break-words">{value ? `Written source expression “${raw}” → ${value}. Saving records this interpretation and its supporting passage.` : "Date unresolved: numeric order, missing years, relative dates and unsupported expressions are not guessed."}</p>;
}
export function KnowledgeDateInterpretations({ proposal }: { proposal: KnowledgeProposal }) {
  const rows: { meaning: string; value: Extract<KnowledgeValue, { type: "date" }> }[] = [];
  if (proposal.value.type === "date") rows.push({ meaning: proposal.predicate, value: proposal.value });
  for (const attribute of proposal.attributes ?? []) if (attribute.value.type === "date") rows.push({ meaning: attribute.predicate, value: attribute.value });
  for (const [meaning, time] of [["Occurrence", proposal.occurredTime], ["Publication", proposal.publicationTime]] as const) if (time) {
    rows.push({ meaning: `${meaning} start`, value: { type: "date", value: time.start, ...(time.startNormalization ? { normalization: time.startNormalization } : {}) } });
    if (time.end) rows.push({ meaning: `${meaning} end`, value: { type: "date", value: time.end, ...(time.endNormalization ? { normalization: time.endNormalization } : {}) } });
  }
  return <>{rows.filter(row => row.value.normalization).map((row, index) => <p key={index} className="break-words">{row.meaning}: “{row.value.normalization!.sourceExpression}” → {row.value.value} · written-date.v1 · supporting quotation {row.value.normalization!.citationIndex + 1}. Precision: {row.value.value.length === 4 ? "year" : row.value.value.length === 7 ? "month" : "day"}.</p>)}</>;
}
