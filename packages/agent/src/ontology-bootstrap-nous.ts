import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  CredentialReference,
  ModelInvocationResult,
  ModelProviderAdapter
} from "./provider.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import type {
  OntologyBootstrapAgentReviewBundle,
  OntologyBootstrapCandidateBundleItem
} from "./ontology-bootstrap-workflow.js";

const memoSchemaVersion = "ontology-bootstrap-nous-memo.v1" as const;
const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const forbiddenAcceptedGraphPattern = /assertion\.accepted|entity\.resolved|relationship\.accepted/i;
const rawContentMarkerPattern = /\{"legacyCestusType"/i;
const riskyAuthorityPattern =
  /\b(?:record|write|commit|apply|create|insert|accept|approve|authorize)\b.{0,80}\b(?:graph truth|ontology truth|accepted assertion|accepted entity|accepted relationship)\b/i;

const memoTextSchema = z.string()
  .min(1)
  .max(2_000)
  .superRefine((value, ctx) => {
    try {
      assertAgentSecretSafeText(value, "ontology bootstrap Nous memo");
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "memo must be safe"
      });
    }
    if (forbiddenAcceptedGraphPattern.test(value) || riskyAuthorityPattern.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "memo must not authorize accepted ontology truth"
      });
    }
  });

const nousMemoSchema = z.object({
  schemaVersion: z.literal(memoSchemaVersion),
  summary: z.string().min(1).max(500),
  questions: z.array(z.string().min(1).max(300)).max(8),
  allowedUse: z.literal("review-note-only"),
  memoHash: contentHashSchema
}).strict();

export type OntologyBootstrapNousMemo = z.infer<typeof nousMemoSchema>;

export interface BuildOntologyBootstrapNousPromptInput {
  readonly bundle: OntologyBootstrapAgentReviewBundle;
  readonly maxCandidates?: number;
}

export interface RunOntologyBootstrapNousReviewInput {
  readonly provider: ModelProviderAdapter;
  readonly bundle: OntologyBootstrapAgentReviewBundle;
  readonly invocationId: string;
  readonly runId: string;
  readonly modelFamily: string;
  readonly inputArtifactHash: `sha256:${string}`;
  readonly credentialRef: CredentialReference;
}

export type RunOntologyBootstrapNousReviewResult =
  | {
      readonly ok: true;
      readonly prompt: string;
      readonly promptHash: `sha256:${string}`;
      readonly memo: OntologyBootstrapNousMemo;
      readonly outputArtifactHash: string;
      readonly usage: ModelInvocationResult["usage"];
    }
  | {
      readonly ok: false;
      readonly category: "provider-unavailable" | "model-output-invalid";
      readonly message: string;
    };

export function buildOntologyBootstrapNousPrompt(input: BuildOntologyBootstrapNousPromptInput): string {
  const bundle = input.bundle;
  const maxCandidates = normalizedMaxCandidates(input.maxCandidates);
  const candidateItems = bundle.candidateBundles
    .flatMap((candidateBundle) => candidateBundle.candidates)
    .slice(0, maxCandidates);
  const quarantine = bundle.dossier.quarantineGroups
    .map((group) => `${group.issueCategory}: count=${group.count}`)
    .join("; ") || "none";
  const blockedReasons = sortedUnique(
    candidateItems.flatMap((candidate) => candidate.blockedReasons)
  ).join(", ") || "none";
  const prompt = [
    "ontology-bootstrap review-note request",
    "You are helping the resident Cestus Agent prepare investigator-facing review notes.",
    "Use only the IDs, hashes, counts, predicates, confidence values, rationale, alternatives, uncertainty, quarantine categories, blocked reasons, and next safe action below.",
    "This memo is review-note-only. It cannot accept ontology truth, approve staging, or change graph state.",
    "Return 2 to 5 short lines. Include one Review note line and any Missing context questions.",
    "",
    `run=${bundle.runId}`,
    `task=${bundle.taskId ?? "none"}`,
    `legacyReport=${bundle.dossier.legacyReportId}`,
    `sourceCollection=${bundle.dossier.sourceCollectionId}`,
    `scanBatch=${bundle.dossier.scanBatchId}`,
    `reportHash=${bundle.dossier.reportHash}`,
    `candidateSetHash=${bundle.dossier.candidateSetHash}`,
    `phase=${bundle.dossier.phase}`,
    `summary eligible=${bundle.dossier.summary.eligibleAssertionCandidates} blocked=${bundle.dossier.summary.blockedAssertionCandidates} quarantine=${bundle.dossier.summary.quarantineEntries}`,
    `quarantine=${quarantine}`,
    `blockedReasons=${blockedReasons}`,
    `nextSafeAction=${bundle.nextSafeAction.label} effect=${bundle.nextSafeAction.effect}`,
    `selectedCandidates=${bundle.stagingReview.selectedCandidateIds.join(",") || "none"}`,
    "candidates:",
    ...candidateItems.map(candidatePromptLine)
  ].join("\n");

  assertPromptSafe(prompt);
  return prompt;
}

export function validateOntologyBootstrapNousMemo(text: string): OntologyBootstrapNousMemo {
  const parsedText = memoTextSchema.parse(text.trim());
  const lines = parsedText
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter((line) => line.length > 0);
  const summary = safeMemoLine(lines[0] ?? parsedText);
  const questions = lines
    .filter((line) => /\?/.test(line) || /^missing context/i.test(line) || /^question/i.test(line))
    .slice(0, 8)
    .map(safeMemoLine);

  return Object.freeze(nousMemoSchema.parse({
    schemaVersion: memoSchemaVersion,
    summary,
    questions,
    allowedUse: "review-note-only",
    memoHash: sha256(parsedText)
  }));
}

export async function runOntologyBootstrapNousReview(
  input: RunOntologyBootstrapNousReviewInput
): Promise<RunOntologyBootstrapNousReviewResult> {
  const prompt = buildOntologyBootstrapNousPrompt({ bundle: input.bundle });
  let result: ModelInvocationResult;
  try {
    result = await input.provider.invoke({
      invocationId: input.invocationId,
      runId: input.runId,
      modelFamily: input.modelFamily,
      inputArtifactHash: input.inputArtifactHash,
      inputText: prompt,
      credentialRef: input.credentialRef
    });
  } catch {
    return {
      ok: false,
      category: "provider-unavailable",
      message: "Nous provider review memo call failed safely."
    };
  }

  try {
    const memo = validateOntologyBootstrapNousMemo(result.outputText);
    return {
      ok: true,
      prompt,
      promptHash: sha256(prompt),
      memo,
      outputArtifactHash: result.outputArtifactHash,
      usage: result.usage
    };
  } catch {
    return {
      ok: false,
      category: "model-output-invalid",
      message: "Nous provider returned review memo text outside the ontology bootstrap safety contract."
    };
  }
}

function candidatePromptLine(candidate: OntologyBootstrapCandidateBundleItem): string {
  const evidenceRefs = candidate.evidenceRefs
    .map((ref) => `${ref.evidenceId ?? "no-evidence"}:${ref.evidenceContentHash}`)
    .join(",");
  const sourceHashes = candidate.sourceArtifactHashes.join(",");
  const alternatives = candidate.alternatives.join(" | ");
  const blockedReasons = candidate.blockedReasons.join(",") || "none";
  return [
    `- id=${candidate.candidateId}`,
    `status=${candidate.status}`,
    `predicate=${candidate.proposedAssertion.predicate}`,
    `object=${String(candidate.proposedAssertion.object)}`,
    `confidence=${candidate.proposedAssertion.confidence}`,
    `evidence=${evidenceRefs}`,
    `sourceHashes=${sourceHashes}`,
    `rationale=${candidate.rationale}`,
    `alternatives=${alternatives}`,
    `uncertainty=${candidate.uncertainty}`,
    `blocked=${blockedReasons}`
  ].join(" ");
}

function normalizedMaxCandidates(value: number | undefined): number {
  if (value === undefined) {
    return 12;
  }
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    throw new Error("maxCandidates must be an integer from 1 to 50.");
  }
  return value;
}

function safeMemoLine(value: string): string {
  const line = value.trim().replace(/\s+/g, " ").slice(0, 500);
  assertAgentSecretSafeText(line, "ontology bootstrap Nous memo line");
  if (forbiddenAcceptedGraphPattern.test(line) || riskyAuthorityPattern.test(line)) {
    throw new Error("memo line must not authorize accepted ontology truth");
  }
  return line;
}

function assertPromptSafe(prompt: string): void {
  assertAgentSecretSafeText(prompt, "ontology bootstrap Nous prompt");
  if (rawContentMarkerPattern.test(prompt)) {
    throw new Error("ontology bootstrap Nous prompt must not include raw legacy content");
  }
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function sha256(text: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}
