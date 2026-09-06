import { vocabularyAdditionSchema, vocabularySchema, type KnowledgeVocabulary, type VocabularyAddition } from "./knowledge-contracts.js";

/** One bounded additive change; existing definitions and their snapshots remain untouched. */
export function extendKnowledgeVocabulary(base: KnowledgeVocabulary, input: VocabularyAddition, schemaId: string): KnowledgeVocabulary {
  const addition = vocabularyAdditionSchema.parse(input);
  const next = structuredClone(base);
  next.schemaId = schemaId;
  if (schemaId === base.schemaId) throw new Error("A schema addition requires a new revision.");
  if (addition.kind === "entityType") {
    if (next.entityTypes.includes(addition.name)) throw new Error("Entity type already exists; existing definitions cannot change.");
    next.entityTypes.push(addition.name);
  } else {
    const definition = addition.definition;
    if (next.predicates.some(p => p.name === definition.name)) throw new Error("Predicate already exists; existing definitions cannot change.");
    if ([definition.fromTypes, definition.toTypes].some(types => new Set(types).size !== types.length || types.some(type => !next.entityTypes.includes(type))))
      throw new Error("Endpoint types must be unique references to reviewed entity types.");
    if (definition.kind === "relationship") {
      if (definition.valueType !== "entity" || !definition.fromTypes.length || !definition.toTypes.length)
        throw new Error("Relationships require an entity value and explicit subject and object types.");
    } else {
      if (definition.toTypes.length || definition.valueType === "entity") throw new Error("Only relationships have entity values and object endpoint constraints.");
      if ((definition.kind === "entity" || definition.kind === "occurrence") && definition.valueType !== "string")
        throw new Error("Entity labels and occurrence descriptions require string values.");
    }
    next.predicates.push(definition);
  }
  return vocabularySchema.parse(next);
}
