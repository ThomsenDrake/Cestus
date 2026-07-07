import { z } from "zod";
import {
  providerReadinessApprovalClassSchema,
  providerReadinessDiagnosticSchema,
  providerReadinessDtoSchema,
  providerReadinessStateSchema,
  providerSetupCardSchema,
  type ProviderReadinessState
} from "../../../agent/src/provider-readiness.js";
import { credentialKindSchema } from "../../../agent/src/credential-reference.js";
import { providerBackendKindSchema } from "../../../agent/src/provider-registry.js";
import { isAgentSecretSafeText } from "../../../agent/src/secret-safety.js";

const displayLabelByState = Object.freeze({
  ready: "Ready",
  "works-locally": "Works locally",
  "needs-api-key": "Needs API key",
  "needs-workload-identity": "Needs workload identity",
  "needs-oauth-sign-in": "Needs sign-in",
  "needs-device-sign-in": "Needs device sign-in",
  "needs-mtls-binding": "Needs mTLS binding",
  "credential-binding-missing": "Local binding missing",
  "credential-expired": "Access expired",
  "credential-revoked": "Access revoked",
  "insufficient-scope": "Scope too narrow",
  "provider-unavailable": "Provider unavailable",
  "harness-not-installed": "Harness not installed",
  "local-model-not-running": "Local model not running",
  "not-available-for-task": "Not available",
  "policy-blocked": "Blocked by policy",
  "requires-byte-transfer-approval": "Needs byte transfer approval",
  "health-unverified": "Health unverified"
} satisfies Record<ProviderReadinessState, string>);

const rawCredentialLocationPattern =
  /(?:^~|[./\\])[^ \n\r\t]*(?:auth|oauth|token|secret|credential|credentials|private[-_]?key)[^ \n\r\t]*/i;
const embeddedCredentialMarkerPattern =
  /(?:^|[\s._/\\-])(?:[a-z0-9]+[\s._/\\-])*(?:api[\s._/-]?key|access[\s._/-]?token|refresh[\s._/-]?token|session[\s._/-]?token|id[\s._/-]?token|oauth[\s._/-]?token|client[\s._/-]?secret|private[\s._/-]?key|secret[\s._/-]?access[\s._/-]?key|access[\s._/-]?key|tokens?|secrets?|passwords?|credentials?)(?:$|[\s._/\\-])/i;
const providerErrorPattern = /\b(?:provider\s+error|stack\s+trace|traceback|exception)\b/i;
const safeProviderSetupActionIds = [
  "action_link_provider_credential",
  "action_open_oauth_sign_in",
  "action_open_device_sign_in",
  "action_relink_provider_credential",
  "action_rotate_provider_credential",
  "action_review_provider_scope",
  "action_check_provider_health",
  "action_install_provider_harness",
  "action_start_local_model",
  "action_choose_provider",
  "action_review_provider_policy",
  "action_request_provider_byte_transfer_approval"
] as const;
const safeProviderSetupActionIdSet = new Set<string>(safeProviderSetupActionIds);
const safeProviderSetupActionIdSchema = z.enum(safeProviderSetupActionIds);
const safeReadinessStateDiagnosticSuffixes = providerReadinessStateSchema.options.map((state) =>
  state.replaceAll("-", "_")
);

const allowedBrowserLiteralText = new Set<string>([
  ...credentialKindSchema.options,
  ...providerBackendKindSchema.options,
  ...providerReadinessApprovalClassSchema.options,
  ...providerReadinessStateSchema.options,
  ...safeProviderSetupActionIds,
  ...Object.values(displayLabelByState)
]);

const safeFreeTextSchema = z.string().min(1).refine(isBrowserFreeTextSafe, {
  message: "must be browser-safe provider setup text"
});
const safeDisplayLabelSchema = z.enum(Object.values(displayLabelByState) as [string, ...string[]]);
const safeProviderIdSchema = z.string()
  .regex(/^provider_[a-zA-Z0-9_-]+$/)
  .refine(isBrowserIdentifierSafe, { message: "providerId must be browser-safe" });
const safeCredentialRefIdSchema = z.string()
  .regex(/^agent_credref_[a-zA-Z0-9_-]+$/)
  .refine(isBrowserIdentifierSafe, { message: "credentialRefId must be browser-safe" });
const safeDiagnosticIdSchema = z.string()
  .regex(/^diag_[a-z0-9_]+$/)
  .refine(isBrowserDiagnosticIdSafe, { message: "diagnosticId must be browser-safe" });
const safeRelatedIdSchema = z.string()
  .regex(/^(provider|agent_credref|evt|diag|policy|action)_[a-zA-Z0-9_-]+$/)
  .refine(isBrowserRelatedIdSafe, { message: "relatedSafeId must be browser-safe" });

const safeProviderReadinessCardSchema = providerSetupCardSchema.extend({
  providerId: safeProviderIdSchema,
  label: safeFreeTextSchema,
  capabilitySummary: z.array(safeFreeTextSchema),
  safeActionIds: z.array(safeProviderSetupActionIdSchema)
}).strict();

const safeProviderReadinessDiagnosticSchema = providerReadinessDiagnosticSchema.extend({
  diagnosticId: safeDiagnosticIdSchema,
  providerId: safeProviderIdSchema,
  credentialRefId: safeCredentialRefIdSchema.optional(),
  relatedSafeIds: z.array(safeRelatedIdSchema),
  safeRepairActionIds: z.array(safeProviderSetupActionIdSchema)
}).strict();

const safeProviderReadinessDtoSchema = providerReadinessDtoSchema.extend({
  cards: z.array(safeProviderReadinessCardSchema),
  diagnostics: z.array(safeProviderReadinessDiagnosticSchema)
}).strict();

export const safeProviderSetupCardSchema = safeProviderReadinessCardSchema.extend({
  displayLabel: safeDisplayLabelSchema
}).strict();

export type SafeProviderSetupCard = z.infer<typeof safeProviderSetupCardSchema>;

export function providerSetupCardsFromReadiness(value: unknown): readonly SafeProviderSetupCard[] {
  const readiness = safeProviderReadinessDtoSchema.parse(value);
  const cards = readiness.cards.map((card) =>
    safeProviderSetupCardSchema.parse({
      ...card,
      displayLabel: displayLabelByState[card.state]
    })
  );

  assertBrowserSetupCardsSecretSafe(cards);

  return Object.freeze(cards.map(freezeProviderSetupCard));
}

function freezeProviderSetupCard(card: SafeProviderSetupCard): SafeProviderSetupCard {
  return Object.freeze({
    ...card,
    capabilitySummary: Object.freeze([...card.capabilitySummary]),
    credentialKindSummary: Object.freeze([...card.credentialKindSummary]),
    safeActionIds: Object.freeze([...card.safeActionIds])
  }) as SafeProviderSetupCard;
}

function assertBrowserSetupCardsSecretSafe(cards: readonly SafeProviderSetupCard[]): void {
  assertSecretSafeStructure(cards, "providerSetupCards");
}

function assertSecretSafeStructure(value: unknown, path: string): void {
  if (typeof value === "string") {
    assertBrowserSetupCardSafeText(value, path);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSecretSafeStructure(item, `${path}.${index}`));
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      assertBrowserSetupCardSafeText(key, `${path}.${key}`);
      assertSecretSafeStructure(nested, `${path}.${key}`);
    }
  }
}

function assertBrowserSetupCardSafeText(value: string, label: string): void {
  if (!isBrowserSetupCardSafeText(value)) {
    throw new Error(`${label} must be browser-safe provider setup text`);
  }
}

function isBrowserSetupCardSafeText(value: string): boolean {
  return allowedBrowserLiteralText.has(value) ||
    isBrowserFreeTextSafe(value);
}

function isBrowserFreeTextSafe(value: string): boolean {
  return isAgentSecretSafeText(value) &&
    !hasEmbeddedCredentialMarker(value) &&
    !rawCredentialLocationPattern.test(value) &&
    !providerErrorPattern.test(value);
}

function isBrowserIdentifierSafe(value: string): boolean {
  return isAgentSecretSafeText(value) &&
    !hasEmbeddedCredentialMarker(value) &&
    !rawCredentialLocationPattern.test(value);
}

function isBrowserRelatedIdSafe(value: string): boolean {
  if (safeProviderSetupActionIdSet.has(value)) {
    return true;
  }
  if (value.startsWith("diag_")) {
    return isBrowserDiagnosticIdSafe(value);
  }
  return isBrowserIdentifierSafe(value);
}

function isBrowserDiagnosticIdSafe(value: string): boolean {
  return isBrowserIdentifierSafe(value) ||
    safeReadinessStateDiagnosticSuffixes.some((suffix) => value.endsWith(`_${suffix}`));
}

function hasEmbeddedCredentialMarker(value: string): boolean {
  return embeddedCredentialMarkerPattern.test(value);
}
