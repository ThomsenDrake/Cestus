import { z } from "zod";
import type { FileBlobStore } from "../../ontology/src/blob-store.js";
import {
  actorRefSchema,
  type AppendableKnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";

type ActorRef = z.infer<typeof actorRefSchema>;

const sourceCollectionIdSchema = z.string().regex(/^src_[a-zA-Z0-9_-]+$/);
const importBatchIdSchema = z.string().regex(/^imp_[a-zA-Z0-9_-]+$/);
const parseJobIdSchema = z.string().regex(/^parse_[a-zA-Z0-9_-]+$/);
const evidenceIdSchema = z.string().regex(/^ev_[a-zA-Z0-9_-]+$/);
const parserRefSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1)
}).strict();

const parseJobInputSchema = z.object({
  parseJobId: parseJobIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  importBatchId: importBatchIdSchema,
  evidenceId: evidenceIdSchema,
  parser: parserRefSchema
}).strict();

const completeTextParseInputSchema = parseJobInputSchema.extend({
  text: z.string(),
  completedAt: z.string().datetime().optional()
}).strict();

const failParseJobInputSchema = parseJobInputSchema.extend({
  message: z.string().optional(),
  retryable: z.boolean(),
  failedAt: z.string().datetime().optional()
}).strict();

export interface LocalParseServiceDependencies {
  ledger: EventLedger;
  derivativeStore: FileBlobStore;
  actor: ActorRef;
}

export interface CreateLocalParseJobInput {
  parseJobId: string;
  sourceCollectionId: string;
  importBatchId: string;
  evidenceId: string;
  parser: {
    name: string;
    version: string;
  };
}

export interface CompleteTextParseInput extends CreateLocalParseJobInput {
  text: string;
  completedAt?: string;
}

export interface FailParseJobInput extends CreateLocalParseJobInput {
  message?: string;
  retryable: boolean;
  failedAt?: string;
}

interface LocalParseJobStreamState {
  created: KnowledgeEventOf<"ingestion.parse.job.created">;
  completed?: KnowledgeEventOf<"ingestion.parse.completed">;
  latestFailed?: KnowledgeEventOf<"ingestion.parse.failed">;
  latestEvent:
    | KnowledgeEventOf<"ingestion.parse.job.created">
    | KnowledgeEventOf<"ingestion.parse.completed">
    | KnowledgeEventOf<"ingestion.parse.failed">;
  nextSequence: number;
}

export class LocalParseService {
  constructor(private readonly dependencies: LocalParseServiceDependencies) {
    const actor = actorRefSchema.safeParse(dependencies.actor);

    if (!actor.success) {
      throw new Error(`Invalid local parser actor: ${actor.error.issues[0]?.message ?? actor.error.message}`);
    }
  }

  async createLocalParseJob(input: CreateLocalParseJobInput): Promise<KnowledgeEventOf<"ingestion.parse.job.created">> {
    const parsed = this.parseInput(parseJobInputSchema, input, "parse job");
    const event: AppendableKnowledgeEvent<"ingestion.parse.job.created"> = {
      type: "ingestion.parse.job.created",
      version: 1,
      streamId: this.parseStreamId(parsed),
      context: this.context(parsed.parseJobId),
      payload: {
        parseJobId: parsed.parseJobId,
        sourceCollectionId: parsed.sourceCollectionId,
        importBatchId: parsed.importBatchId,
        evidenceId: parsed.evidenceId,
        lane: "local",
        parser: parsed.parser,
        state: "queued"
      }
    };

    const appended = await this.dependencies.ledger.append(event, { expectedNextSequence: 1 });

    if (appended.type !== "ingestion.parse.job.created") {
      throw new Error(`Unexpected event type appended for local parse job: ${appended.type}`);
    }

    return appended;
  }

  async completeTextParse(input: CompleteTextParseInput): Promise<KnowledgeEventOf<"ingestion.parse.completed">> {
    const parsed = this.parseInput(completeTextParseInputSchema, input, "text parse completion");
    const state = await this.readJobState(parsed);

    if (state.completed !== undefined) {
      return state.completed;
    }

    if (state.latestFailed?.payload.retryable === false) {
      throw new Error(`Local parse job ${parsed.parseJobId} has a non-retryable failure and cannot be completed`);
    }

    const content = Buffer.from(parsed.text, "utf8");
    const stored = await this.dependencies.derivativeStore.put(content);
    const event: AppendableKnowledgeEvent<"ingestion.parse.completed"> = {
      type: "ingestion.parse.completed",
      version: 1,
      streamId: this.parseStreamId(parsed),
      context: this.context(parsed.parseJobId, state.latestEvent.id),
      payload: {
        parseJobId: parsed.parseJobId,
        sourceCollectionId: parsed.sourceCollectionId,
        importBatchId: parsed.importBatchId,
        evidenceId: parsed.evidenceId,
        lane: "local",
        parser: parsed.parser,
        outputHash: stored.contentHash,
        outputMediaType: "text/plain",
        completedAt: parsed.completedAt ?? new Date().toISOString()
      }
    };

    const appended = await this.dependencies.ledger.append(event, { expectedNextSequence: state.nextSequence });

    if (appended.type !== "ingestion.parse.completed") {
      throw new Error(`Unexpected event type appended for local parse completion: ${appended.type}`);
    }

    return appended;
  }

  async failParseJob(input: FailParseJobInput): Promise<KnowledgeEventOf<"ingestion.parse.failed">> {
    const parsed = this.parseInput(failParseJobInputSchema, input, "parse failure");
    const state = await this.readJobState(parsed);

    if (state.completed !== undefined) {
      throw new Error(`Local parse job ${parsed.parseJobId} already completed and cannot be failed`);
    }

    if (state.latestFailed?.payload.retryable === false) {
      throw new Error(`Local parse job ${parsed.parseJobId} already has a non-retryable failure`);
    }

    const event: AppendableKnowledgeEvent<"ingestion.parse.failed"> = {
      type: "ingestion.parse.failed",
      version: 1,
      streamId: this.parseStreamId(parsed),
      context: this.context(parsed.parseJobId, state.latestEvent.id),
      payload: {
        parseJobId: parsed.parseJobId,
        sourceCollectionId: parsed.sourceCollectionId,
        importBatchId: parsed.importBatchId,
        evidenceId: parsed.evidenceId,
        lane: "local",
        parser: parsed.parser,
        failedAt: parsed.failedAt ?? new Date().toISOString(),
        message: this.secretSafeFailureMessage(parsed.message),
        retryable: parsed.retryable
      }
    };

    const appended = await this.dependencies.ledger.append(event, { expectedNextSequence: state.nextSequence });

    if (appended.type !== "ingestion.parse.failed") {
      throw new Error(`Unexpected event type appended for local parse failure: ${appended.type}`);
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

  private async readJobState(
    input: CreateLocalParseJobInput
  ): Promise<LocalParseJobStreamState> {
    const events = await this.dependencies.ledger.readStream(this.parseStreamId(input));
    const created = events.find(
      (event): event is KnowledgeEventOf<"ingestion.parse.job.created"> =>
        event.type === "ingestion.parse.job.created" &&
        event.payload.lane === "local" &&
        event.payload.parseJobId === input.parseJobId &&
        event.payload.sourceCollectionId === input.sourceCollectionId &&
        event.payload.importBatchId === input.importBatchId &&
        event.payload.evidenceId === input.evidenceId
    );

    if (created === undefined) {
      throw new Error(`Local parse job ${input.parseJobId} must be created before it can be completed or failed`);
    }

    const completed = events.findLast(
      (event): event is KnowledgeEventOf<"ingestion.parse.completed"> =>
        event.type === "ingestion.parse.completed" &&
        event.payload.lane === "local" &&
        event.payload.parseJobId === input.parseJobId &&
        event.payload.sourceCollectionId === input.sourceCollectionId &&
        event.payload.importBatchId === input.importBatchId &&
        event.payload.evidenceId === input.evidenceId
    );
    const latestFailed = events.findLast(
      (event): event is KnowledgeEventOf<"ingestion.parse.failed"> =>
        event.type === "ingestion.parse.failed" &&
        event.payload.lane === "local" &&
        event.payload.parseJobId === input.parseJobId &&
        event.payload.sourceCollectionId === input.sourceCollectionId &&
        event.payload.importBatchId === input.importBatchId &&
        event.payload.evidenceId === input.evidenceId
    );
    const latestEvent = completed ?? latestFailed ?? created;

    return {
      created,
      ...(completed === undefined ? {} : { completed }),
      ...(latestFailed === undefined ? {} : { latestFailed }),
      latestEvent,
      nextSequence: events.length + 1
    };
  }

  private secretSafeFailureMessage(_message: string | undefined): string {
    return "Local parse failed; details were redacted.";
  }

  private parseStreamId(input: Pick<CreateLocalParseJobInput, "sourceCollectionId" | "importBatchId" | "parseJobId">): string {
    return `ingestion_parse_${input.sourceCollectionId}_${input.importBatchId}_${input.parseJobId}`;
  }

  private context(parseJobId: string, causationId?: string): AppendableKnowledgeEvent["context"] {
    return {
      actor: this.dependencies.actor,
      occurredAt: new Date().toISOString(),
      ...(causationId === undefined ? {} : { causationId }),
      correlationId: `corr_${parseJobId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    };
  }
}
