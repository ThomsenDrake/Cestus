import { useState } from "react";
import { investigationVocabulary, type VocabularyAddition } from "../../../ontology/src/knowledge-contracts.js";
import { extendKnowledgeVocabulary } from "../../../ontology/src/knowledge-vocabulary.js";
import { newKnowledgeId, type SharedKnowledge } from "./shared-ontology-adapter.js";

const field = "min-w-0 max-w-full rounded border border-[var(--console-line)] bg-[var(--console-panel)] p-2";
const button = "rounded border border-[var(--console-line-strong)] px-3 py-2 text-sm disabled:opacity-50";
type Command = Record<string, unknown> & { decisionId: string; expectedRevision: number };
export function KnowledgeVocabularyForm({ workspace, commit }: { workspace: SharedKnowledge; commit: (command: Command) => Promise<void> }) {
  const schema = workspace.schema ?? investigationVocabulary;
  const [kind, setKind] = useState("entityType");
  const [preview, setPreview] = useState<Command>();
  const [error, setError] = useState<string>();
  return <section aria-label="Reviewed vocabulary" className="min-w-0 space-y-3 rounded border border-[var(--console-line)] p-4">
    <h3 className="font-semibold">Reviewed vocabulary · {schema.schemaId}</h3>
    <p>Add one necessary term after inspecting its meaning and constraints. Existing definitions cannot change. Adding a term never accepts knowledge.</p>
    <details><summary>Add a vocabulary term</summary>
      <form aria-label="Vocabulary addition" className="mt-3 grid min-w-0 gap-3" onChange={() => setPreview(undefined)} onSubmit={event => {
        event.preventDefault(); setError(undefined); const data = new FormData(event.currentTarget);
        const addition = (kind === "entityType" ? { kind, name: data.get("term") } : { kind: "predicate", definition: { name: data.get("term"), kind, valueType: data.get("valueType"), fromTypes: data.getAll("fromTypes"), toTypes: data.getAll("toTypes") } }) as VocabularyAddition;
        try {
          extendKnowledgeVocabulary(schema, addition, "preview-only");
          setPreview({ action: "extendSchema", baseSchemaId: schema.schemaId, addition, rationale: String(data.get("rationale")), expectedRevision: workspace.revision, decisionId: newKnowledgeId("schema") });
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Check term and endpoint constraints."); }
      }}>
        <label className="flex min-w-0 flex-col gap-1">Addition kind<select className={field} value={kind} onChange={event => setKind(event.target.value)}><option value="entityType">Entity type</option><option value="fact">Typed fact predicate</option><option value="relationship">Relationship predicate</option><option value="occurrence">Occurrence predicate</option><option value="entity">Entity label predicate</option></select></label>
        <label className="flex min-w-0 flex-col gap-1">New term<input className={field} name="term" required pattern="[a-z][a-z0-9_]{0,63}" placeholder="e.g. cooperative or registered_on" /></label>
        {kind !== "entityType" && <>
          <label className="flex min-w-0 flex-col gap-1">Predicate value type<select key={kind} className={field} name="valueType" defaultValue={kind === "relationship" ? "entity" : "string"}>{(kind === "relationship" ? ["entity"] : kind === "fact" ? ["string", "number", "boolean", "date"] : ["string"]).map(type => <option key={type}>{type}</option>)}</select></label>
          <label className="flex min-w-0 flex-col gap-1">Allowed subject or participant types<select className={field} name="fromTypes" multiple required={kind === "relationship"}>{schema.entityTypes.map(type => <option key={type}>{type}</option>)}</select></label>
          {kind === "relationship" && <label className="flex min-w-0 flex-col gap-1">Allowed object types<select className={field} name="toTypes" multiple required>{schema.entityTypes.map(type => <option key={type}>{type}</option>)}</select></label>}
          <p>Hold Ctrl or Command for several types. Empty subject constraints allow all reviewed types; relationships require explicit types on both ends.</p>
        </>}
        <label className="flex min-w-0 flex-col gap-1">Why this term is needed<textarea className={field} name="rationale" required maxLength={10000} /></label>
        <button className={button}>Preview vocabulary addition</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {preview && <section aria-label="Vocabulary addition preview" className="mt-3 min-w-0 space-y-2 border p-3">
        <p>Extend {String(preview.baseSchemaId)} at workspace revision {preview.expectedRevision}. Existing definitions remain unchanged.</p>
        <pre className="whitespace-pre-wrap break-words">{JSON.stringify(preview.addition, null, 2)}</pre><p>{String(preview.rationale)}</p>
        <p>After approval, explicitly revise any old proposal under the new schema, then review and accept it separately.</p>
        <button className={button} onClick={() => void commit(preview).then(() => setPreview(undefined))}>Approve this vocabulary addition</button>
      </section>}
    </details>
    {!!workspace.schemaHistory?.length && <details><summary>Vocabulary review history</summary>{workspace.schemaHistory.map(item => <p key={item.schemaId} className="break-words">{item.baseSchemaId} → {item.schemaId} · {item.actorId} · {item.occurredAt}: {item.rationale}</p>)}</details>}
  </section>;
}
