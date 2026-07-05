import { z } from "zod";

export const governanceTags = [
  "public_record",
  "public_safe",
  "contains_pii",
  "source_identity",
  "private_correspondence",
  "legal_risk",
  "credential_risk",
  "export_restricted",
  "law_enforcement_sensitive"
] as const;

export type GovernanceTag = (typeof governanceTags)[number];

export const publicSafeDefaultTags = ["public_safe"] as const satisfies readonly GovernanceTag[];

export const restrictedExportTags = [
  "contains_pii",
  "source_identity",
  "private_correspondence",
  "legal_risk",
  "credential_risk",
  "export_restricted",
  "law_enforcement_sensitive"
] as const satisfies readonly GovernanceTag[];

const minimumAutomaticWorkflowConfidenceThreshold = 0.8;

const secretTextPatterns = [
  /(?:^|[^a-z0-9])(?:aws[\s._-]*secret[\s._-]*access[\s._-]*key|access[\s._-]*token|api[\s._-]*key|token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth(?:[\s._-]*(?:token|secret|client))?)\s*[:=]\s*\S{3,}/i,
  /(?:^|[^a-z0-9])(?:aws[\s_-]*secret[\s_-]*access[\s_-]*key|access[\s_-]*token|api[\s_-]*key|token|password|private[\s_-]*key|client[\s_-]*secret|refresh[\s_-]*secret|session[\s_-]*secret|oauth[\s_-]*(?:token|secret|client))\s+(?=[a-z0-9._~+/=-]{3,})(?=[a-z0-9._~+/=-]*[0-9._~+/=-])[a-z0-9][a-z0-9._~+/=-]*/i,
  /(?:^|[^a-z0-9])authorization\s*:\s*\S+(?:\s+\S+)?/i,
  /(?:^|[^a-z0-9])bearer\s+[a-z0-9._~+/=-]{6,}/i,
  /(?:^|[^a-z0-9])sk-(?:proj|live|test)-[a-z0-9_-]{3,}/i
] as const;

const governanceTagSchema = z.enum(governanceTags);

const governancePolicyEntrySchema = z.object({
  tag: governanceTagSchema,
  description: z.string().min(1),
  defaultExportBehavior: z.enum(["include-by-default", "exclude-unless-opted-in"]),
  unlocksNormalWorkflowsAtHighConfidence: z.boolean()
}).strict();

const governancePolicySchema = z.object({
  policyId: z.string().regex(/^gov_policy_[a-zA-Z0-9_-]+$/),
  version: z.string().min(1),
  confidenceThreshold: z.number().min(0).max(1),
  tags: z.array(governancePolicyEntrySchema).min(1)
}).strict();

export type GovernancePolicy = z.infer<typeof governancePolicySchema>;

export const defaultGovernancePolicy: GovernancePolicy = {
  policyId: "gov_policy_default",
  version: "0.1.0",
  confidenceThreshold: 0.9,
  tags: [
    {
      tag: "public_record",
      description: "Evidence obtained from public records, public datasets, public websites, or public proceedings.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "public_safe",
      description: "Evidence safe for default export or report inclusion under the active governance policy.",
      defaultExportBehavior: "include-by-default",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "contains_pii",
      description: "Evidence containing personally identifying information.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "source_identity",
      description: "Evidence that may identify a confidential source, requester, witness, or vulnerable person.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "private_correspondence",
      description: "Evidence containing private messages, mailbox content, or non-public correspondence.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "legal_risk",
      description: "Evidence that may affect legal posture, escalation, privilege, defamation risk, or legal strategy.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "credential_risk",
      description: "Evidence that appears to expose reusable authentication material or credential configuration.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "export_restricted",
      description: "Evidence excluded from public-safe exports unless a user explicitly opts in.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "law_enforcement_sensitive",
      description: "Evidence with sensitive law-enforcement, victim, witness, investigatory, or tactical content.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    }
  ]
};

export function validateGovernancePolicy(policy: unknown): GovernancePolicy {
  const result = governancePolicySchema.safeParse(policy);

  if (!result.success) {
    throw new Error(`Invalid governance policy: ${result.error.message}`);
  }

  if (result.data.confidenceThreshold < minimumAutomaticWorkflowConfidenceThreshold) {
    throw new Error("Governance policy confidenceThreshold must stay high enough for automatic workflow unlocks");
  }

  const seenTags = new Set<GovernanceTag>();

  for (const entry of result.data.tags) {
    assertSecretSafeText(entry.description);

    if (seenTags.has(entry.tag)) {
      throw new Error("Governance policy must define each core governance tag exactly once");
    }
    seenTags.add(entry.tag);
  }

  if (governanceTags.some((tag) => !seenTags.has(tag))) {
    throw new Error("Governance policy must define each core governance tag exactly once");
  }

  for (const entry of result.data.tags) {
    const expectedDefaultBehavior = entry.tag === "public_safe" ? "include-by-default" : "exclude-unless-opted-in";
    if (entry.defaultExportBehavior !== expectedDefaultBehavior) {
      throw new Error("Governance policy export defaults do not match core governance tags");
    }

    if (!entry.unlocksNormalWorkflowsAtHighConfidence) {
      throw new Error("Governance policy tags must unlock normal workflows at high confidence");
    }
  }

  return result.data;
}

export function isHighConfidence(confidence: number, policy: GovernancePolicy = defaultGovernancePolicy): boolean {
  return Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 && confidence >= policy.confidenceThreshold;
}

export function assertSecretSafeText(value: string): string {
  if (secretTextPatterns.some((pattern) => pattern.test(value))) {
    throw new Error("Governance text must not contain secrets");
  }

  return value;
}
