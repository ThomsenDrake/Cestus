import { z } from "zod";
import { assertAgentSecretSafeText, isAgentSecretSafeText } from "./secret-safety.js";

const secretSafeTextSchema = z.string().min(1).refine(isAgentSecretSafeText, {
  message: "must be secret-safe"
});

const credentialRefIdSchema = z.string()
  .regex(/^agent_credref_[a-zA-Z0-9_-]+$/)
  .refine(isAgentSecretSafeText, { message: "credentialRefId must be secret-safe" });

const providerIdSchema = z.string()
  .regex(/^provider_[a-zA-Z0-9_-]+$/)
  .refine(isAgentSecretSafeText, { message: "providerId must be secret-safe" });

export const credentialKindSchema = z.enum([
  "api-key-bearer",
  "workload-identity-token",
  "subscription-oauth",
  "device-code-oauth",
  "local-no-secret",
  "mtls-certificate",
  "enterprise-gateway"
]);

export const credentialReferenceStatusSchema = z.enum([
  "linked",
  "missing-binding",
  "healthy",
  "expired",
  "revoked",
  "insufficient-scope",
  "unverified"
]);

export const credentialReferenceSchema = z.object({
  credentialRefId: credentialRefIdSchema,
  providerId: providerIdSchema,
  credentialKind: credentialKindSchema,
  scopeKind: z.enum(["machine", "user", "workspace", "organization", "enterprise"]),
  capabilityScopes: z.array(z.enum([
    "model-inference",
    "provider-health",
    "provider-parse",
    "harness-execution"
  ])).min(1),
  safeLabel: secretSafeTextSchema,
  authorizedBy: secretSafeTextSchema,
  authorizedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  rotationDueAt: z.string().datetime().optional(),
  revokedAt: z.string().datetime().optional(),
  status: credentialReferenceStatusSchema,
  policyVersion: secretSafeTextSchema,
  sourceEventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)).default([])
}).strict();

export type CredentialReference = z.infer<typeof credentialReferenceSchema>;
export type CredentialKind = z.infer<typeof credentialKindSchema>;
export type CredentialReferenceStatus = z.infer<typeof credentialReferenceStatusSchema>;

export function createCredentialReference(input: z.input<typeof credentialReferenceSchema>): CredentialReference {
  for (const [label, value] of Object.entries({
    credentialRefId: input.credentialRefId,
    providerId: input.providerId,
    safeLabel: input.safeLabel,
    authorizedBy: input.authorizedBy,
    policyVersion: input.policyVersion
  })) {
    if (typeof value === "string") {
      assertAgentSecretSafeText(value, label);
    }
  }

  return Object.freeze(credentialReferenceSchema.parse(input));
}
