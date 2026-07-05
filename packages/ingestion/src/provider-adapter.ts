import { z } from "zod";
import {
  actorRefSchema,
  type AppendableKnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";

type ActorRef = z.infer<typeof actorRefSchema>;

const providerJobIdSchema = z.string().regex(/^provider_[a-zA-Z0-9_-]+$/);
const sourceCollectionIdSchema = z.string().regex(/^src_[a-zA-Z0-9_-]+$/);
const importBatchIdSchema = z.string().regex(/^imp_[a-zA-Z0-9_-]+$/);
const evidenceIdSchema = z.string().regex(/^ev_[a-zA-Z0-9_-]+$/);
const secretLikeTextSchema = z.string().refine((value) => !/token|secret|password|oauth|credential/i.test(value), {
  message: "must not contain credential-shaped text"
});
const providerRefSchema = z.object({
  name: secretLikeTextSchema.min(1),
  version: secretLikeTextSchema.min(1)
}).strict();
const mediaTypeSchema = secretLikeTextSchema.min(1);

const approveProviderBatchInputSchema = z.object({
  providerJobId: providerJobIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  importBatchId: importBatchIdSchema,
  provider: providerRefSchema,
  approvedBy: secretLikeTextSchema.min(3),
  approvedAt: z.string().datetime().optional(),
  eligibleMediaTypes: z.array(mediaTypeSchema).min(1),
  maxBytesPerFile: z.number().int().positive()
}).strict();

const fakeProviderConfigSchema = z.object({
  name: providerRefSchema.shape.name,
  supportedMediaTypes: z.array(mediaTypeSchema).min(1),
  maxBytesPerFile: z.number().int().positive()
}).strict();

const parseInputSchema = z.object({
  evidenceId: evidenceIdSchema,
  mediaType: mediaTypeSchema,
  content: z.instanceof(Buffer)
}).strict();

export interface DocumentAiProvider {
  capabilities(): Promise<{ name: string; supportedMediaTypes: string[]; maxBytesPerFile: number }>;
  parse(input: { evidenceId: string; mediaType: string; content: Buffer }): Promise<{ text: string; warnings: string[] }>;
}

export interface ProviderParseApprovalServiceDependencies {
  ledger: EventLedger;
  actor: ActorRef;
}

export interface ApproveProviderBatchInput {
  providerJobId: string;
  sourceCollectionId: string;
  importBatchId: string;
  provider: {
    name: string;
    version: string;
  };
  approvedBy: string;
  approvedAt?: string;
  eligibleMediaTypes: string[];
  maxBytesPerFile: number;
}

export class ProviderParseApprovalService {
  constructor(private readonly dependencies: ProviderParseApprovalServiceDependencies) {
    const actor = actorRefSchema.safeParse(dependencies.actor);

    if (!actor.success) {
      throw new Error(`Invalid provider approval actor: ${actor.error.issues[0]?.message ?? actor.error.message}`);
    }
  }

  async approveProviderBatch(
    input: ApproveProviderBatchInput
  ): Promise<KnowledgeEventOf<"ingestion.provider.approved">> {
    const parsed = this.parseInput(approveProviderBatchInputSchema, input, "provider approval");
    const approvedAt = parsed.approvedAt ?? new Date().toISOString();
    const payload = {
      providerJobId: parsed.providerJobId,
      sourceCollectionId: parsed.sourceCollectionId,
      importBatchId: parsed.importBatchId,
      provider: parsed.provider,
      approvedBy: parsed.approvedBy,
      approvedAt,
      eligibleMediaTypes: parsed.eligibleMediaTypes,
      maxBytesPerFile: parsed.maxBytesPerFile,
      policy: "send-all-technically-eligible" as const
    };
    const streamId = this.providerStreamId(parsed);
    const existingEvents = await this.dependencies.ledger.readStream(streamId);
    const existingApproval = existingEvents.find(
      (event): event is KnowledgeEventOf<"ingestion.provider.approved"> =>
        event.type === "ingestion.provider.approved" &&
        event.payload.providerJobId === parsed.providerJobId
    );

    if (existingApproval !== undefined) {
      this.assertApprovalMatches(existingApproval, payload);
      return existingApproval;
    }

    if (existingEvents.length > 0) {
      throw new Error(`Provider approval ${parsed.providerJobId} conflicts with existing provider stream state`);
    }

    const event: AppendableKnowledgeEvent<"ingestion.provider.approved"> = {
      type: "ingestion.provider.approved",
      version: 1,
      streamId,
      context: this.context(parsed.providerJobId),
      payload
    };
    const appended = await this.dependencies.ledger.append(event, { expectedNextSequence: 1 });

    if (appended.type !== "ingestion.provider.approved") {
      throw new Error(`Unexpected event type appended for provider approval: ${appended.type}`);
    }

    return appended;
  }

  private parseInput<Schema extends z.ZodType>(schema: Schema, input: unknown, label: string): z.infer<Schema> {
    const result = schema.safeParse(input);

    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.length === 0 ? label : issue?.path.join(".");
      throw new Error(`Invalid ${label} ${path}: ${issue?.message ?? result.error.message}`);
    }

    return result.data;
  }

  private assertApprovalMatches(
    existingApproval: KnowledgeEventOf<"ingestion.provider.approved">,
    payload: AppendableKnowledgeEvent<"ingestion.provider.approved">["payload"]
  ): void {
    const existing = existingApproval.payload;
    const matches =
      existing.providerJobId === payload.providerJobId &&
      existing.sourceCollectionId === payload.sourceCollectionId &&
      existing.importBatchId === payload.importBatchId &&
      existing.provider.name === payload.provider.name &&
      existing.provider.version === payload.provider.version &&
      existing.approvedBy === payload.approvedBy &&
      existing.approvedAt === payload.approvedAt &&
      existing.maxBytesPerFile === payload.maxBytesPerFile &&
      existing.policy === payload.policy &&
      this.sameStringList(existing.eligibleMediaTypes, payload.eligibleMediaTypes);

    if (!matches) {
      throw new Error(`Provider approval ${payload.providerJobId} conflicts with existing approval payload`);
    }
  }

  private sameStringList(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private providerStreamId(
    input: Pick<ApproveProviderBatchInput, "sourceCollectionId" | "importBatchId" | "providerJobId">
  ): string {
    return `ingestion_provider_${input.sourceCollectionId}_${input.importBatchId}_${input.providerJobId}`;
  }

  private context(providerJobId: string): AppendableKnowledgeEvent["context"] {
    return {
      actor: this.dependencies.actor,
      occurredAt: new Date().toISOString(),
      correlationId: `corr_${providerJobId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    };
  }
}

export interface FakeDocumentAiProviderConfig {
  name: string;
  supportedMediaTypes: string[];
  maxBytesPerFile: number;
}

export class FakeDocumentAiProvider implements DocumentAiProvider {
  private readonly name: string;
  private readonly supportedMediaTypes: string[];
  private readonly maxBytesPerFile: number;

  constructor(config: FakeDocumentAiProviderConfig) {
    const parsed = this.parseInput(fakeProviderConfigSchema, config, "fake provider config");

    this.name = parsed.name;
    this.supportedMediaTypes = [...parsed.supportedMediaTypes];
    this.maxBytesPerFile = parsed.maxBytesPerFile;
  }

  async capabilities(): Promise<{ name: string; supportedMediaTypes: string[]; maxBytesPerFile: number }> {
    return {
      name: this.name,
      supportedMediaTypes: [...this.supportedMediaTypes],
      maxBytesPerFile: this.maxBytesPerFile
    };
  }

  async parse(input: { evidenceId: string; mediaType: string; content: Buffer }): Promise<{ text: string; warnings: string[] }> {
    const parsed = this.parseInput(parseInputSchema, input, "provider parse input");

    if (!this.supportedMediaTypes.includes(parsed.mediaType)) {
      throw new Error(`Unsupported media type for fake provider: ${parsed.mediaType}`);
    }

    if (parsed.content.byteLength > this.maxBytesPerFile) {
      throw new Error(`Fake provider rejected oversized file ${parsed.evidenceId}`);
    }

    return {
      text: `fake parsed text for ${parsed.evidenceId}`,
      warnings: []
    };
  }

  private parseInput<Schema extends z.ZodType>(schema: Schema, input: unknown, label: string): z.infer<Schema> {
    const result = schema.safeParse(input);

    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.length === 0 ? label : issue?.path.join(".");
      throw new Error(`Invalid ${label} ${path}: ${issue?.message ?? result.error.message}`);
    }

    return result.data;
  }
}
