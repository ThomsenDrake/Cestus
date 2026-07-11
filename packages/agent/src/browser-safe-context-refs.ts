import { z } from "zod";
import type { ContextPackRef } from "./context-packs.js";
import { hasVerifiedResolvedContextPackBrand } from "./verified-context-pack-brand.js";

const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const contextPackIdSchema = z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.v[1-9][0-9]*$/);
const contextPackScopeSchema = z.object({
  kind: z.string().min(1),
  id: z.string().min(1)
}).strict();
const contextPackStalenessInputSchema = z.object({
  kind: z.string().min(1),
  ref: z.string().min(1),
  value: z.string().min(1)
}).strict();

export const browserSafeContextPackRefSchema = z.object({
  contextPackId: contextPackIdSchema,
  version: z.number().int().positive(),
  contentHash: contentHashSchema,
  sizeBytes: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
  safeSummary: z.string().min(1),
  provenanceRefs: z.array(z.string().min(1)),
  projectionHighWaterMark: z.number().int().nonnegative().optional(),
  sourceEventIds: z.array(z.string().min(1)).optional(),
  artifactHashes: z.array(contentHashSchema).optional(),
  policyVersion: z.string().min(1).optional(),
  scope: contextPackScopeSchema.optional(),
  sizeBudgetBytes: z.number().int().positive().optional(),
  stalenessInputs: z.array(contextPackStalenessInputSchema).optional()
}).strict();

export function parseBrowserSafeContextPackRef(value: unknown): ContextPackRef {
  return browserSafeContextPackRefSchema.parse(value) as ContextPackRef;
}

export function parseAuthoritativeBrowserSafeResolvedContextPackRef(value: unknown): ContextPackRef {
  if (!hasVerifiedResolvedContextPackBrand(value)) {
    throw new Error("resolved context pack must be an authoritative parser-verified result");
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("resolved context pack must be an object");
  }
  const refDescriptor = Object.getOwnPropertyDescriptor(value, "ref");
  if (refDescriptor === undefined || !refDescriptor.enumerable || !("value" in refDescriptor)) {
    throw new Error("resolved context pack must include a ref");
  }
  return parseBrowserSafeContextPackRef(refDescriptor.value);
}

export function browserSafeContextRefsMatch(left: unknown, right: unknown): boolean {
  const leftRef = parseBrowserSafeContextPackRef(left);
  const rightRef = parseBrowserSafeContextPackRef(right);
  return leftRef.contextPackId === rightRef.contextPackId &&
    leftRef.version === rightRef.version &&
    leftRef.contentHash === rightRef.contentHash;
}
