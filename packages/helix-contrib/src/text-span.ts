import {
  sha256ContentHash,
  validateProvenanceRecord,
  type ContentHash,
  type ProvenanceRecord
} from "./provenance.js";

export type ScalarPropertyValue = string | number | boolean;

export interface TextSpanNodeInput {
  readonly label?: string;
  readonly stableKey: string;
  readonly locator: string;
  readonly text: string;
  readonly provenance: ProvenanceRecord;
  readonly properties?: Readonly<Record<string, ScalarPropertyValue>>;
}

export interface PreparedTextSpanNode {
  readonly label: string;
  readonly stableKey: string;
  readonly locator: string;
  readonly text: string;
  readonly spanHash: ContentHash;
  readonly provenance: ProvenanceRecord;
  readonly properties: Readonly<Record<string, ScalarPropertyValue>>;
}

export class HelixTextSpanError extends Error {
  readonly code = "HELIX_TEXT_SPAN_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "HelixTextSpanError";
  }
}

export function prepareTextSpanNode(input: TextSpanNodeInput): PreparedTextSpanNode {
  const label = input.label ?? "TextSpan";
  if (label.trim().length === 0) {
    throw new HelixTextSpanError("Text span label must be non-empty.");
  }
  if (input.stableKey.trim().length === 0) {
    throw new HelixTextSpanError("Text span stableKey must be non-empty.");
  }
  if (input.locator.trim().length === 0) {
    throw new HelixTextSpanError("Text span locator must be non-empty.");
  }
  if (typeof input.text !== "string") {
    throw new HelixTextSpanError("Text span text must be a string.");
  }
  const provenance = validateProvenanceRecord({
    ...input.provenance,
    locator: input.provenance.locator ?? input.locator
  });
  const spanHash = sha256ContentHash(input.text);
  const properties: Record<string, ScalarPropertyValue> = {
    ...(input.properties ?? {}),
    locator: input.locator,
    text: input.text,
    spanHash
  };
  return Object.freeze({
    label,
    stableKey: input.stableKey,
    locator: input.locator,
    text: input.text,
    spanHash,
    provenance,
    properties: Object.freeze(properties)
  });
}
