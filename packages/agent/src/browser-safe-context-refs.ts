import { z } from "zod";
import type { ContextPackRef } from "./context-packs.js";

const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const browserSafeContextPackRefSchema = z.object({
  contextPackId: z.string().min(1),
  version: z.number().int().positive(),
  generatedAt: z.string().min(1),
  contentHash: contentHashSchema,
  sizeBytes: z.number().int().nonnegative(),
  safeSummary: z.string().min(1),
  provenanceRefs: z.array(z.string().min(1))
}).passthrough();

export function parseBrowserSafeContextPackRef(value: unknown): ContextPackRef {
  return browserSafeContextPackRefSchema.parse(value) as ContextPackRef;
}

export function browserSafeContextRefsMatch(left: unknown, right: unknown): boolean {
  const leftRef = parseBrowserSafeContextPackRef(left);
  const rightRef = parseBrowserSafeContextPackRef(right);
  return leftRef.contextPackId === rightRef.contextPackId &&
    leftRef.version === rightRef.version &&
    leftRef.contentHash === rightRef.contentHash;
}
