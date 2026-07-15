import {
  parseUntrustedSpecialistHandoffPreparation,
  type UntrustedSpecialistHandoffPreparationV1
} from "../../agent/src/specialist-handoff-preparation.js";
import type {
  TaskOrchestratorRunnerDispatchInput,
  TaskOrchestratorRunnerDispatchResult
} from "../../agent/src/task-orchestrator.js";

export interface UntrustedSpecialistRunner {
  dispatch(input: TaskOrchestratorRunnerDispatchInput): Promise<TaskOrchestratorRunnerDispatchResult>;
}

export type SpecialistRunnerPreparationErrorCode = "runner-preparation-invalid";

export class SpecialistRunnerPreparationError extends Error {
  readonly code: SpecialistRunnerPreparationErrorCode;

  constructor() {
    super("runner-preparation-invalid");
    this.name = "SpecialistRunnerPreparationError";
    this.code = "runner-preparation-invalid";
    Object.freeze(this);
  }
}

/**
 * This nonterminal adapter owns neither factory authority nor a durable handoff
 * capability. It snapshots the public dispatch before delegation and returns
 * only canonical untrusted preparation data.
 */
export function createUntrustedSpecialistRunner(input: {
  readonly delegate: (input: TaskOrchestratorRunnerDispatchInput) => Promise<unknown>;
}): UntrustedSpecialistRunner {
  const delegate = normalizeDelegate(input);
  return Object.freeze({
    async dispatch(input: TaskOrchestratorRunnerDispatchInput): Promise<TaskOrchestratorRunnerDispatchResult> {
      const dispatch = normalizePublicDispatch(input);
      let value: unknown;
      try {
        value = await delegate(dispatch);
      } catch (error) {
        if (error instanceof SpecialistRunnerPreparationError) {
          throw error;
        }
        throw error;
      }

      let preparation: UntrustedSpecialistHandoffPreparationV1;
      try {
        preparation = parseUntrustedSpecialistHandoffPreparation(value);
      } catch {
        throw preparationError();
      }
      if (
        preparation.taskId !== dispatch.taskId ||
        preparation.attemptId !== dispatch.attemptId ||
        preparation.approvedRunId !== dispatch.approvedRunId ||
        preparation.runType !== dispatch.runType
      ) {
        throw preparationError();
      }
      return Object.freeze({
        preparation: Object.freeze({
          schemaVersion: "agent.task-orchestrator.runner-preparation.v1" as const,
          preparation
        })
      });
    }
  });
}

function normalizeDelegate(value: unknown): (input: TaskOrchestratorRunnerDispatchInput) => Promise<unknown> {
  const input = exactOwnDataObject(value, ["delegate"]);
  if (typeof input.delegate !== "function") {
    throw preparationError();
  }
  return input.delegate as (input: TaskOrchestratorRunnerDispatchInput) => Promise<unknown>;
}

function normalizePublicDispatch(value: unknown): TaskOrchestratorRunnerDispatchInput {
  const input = exactOwnDataObject(value, ["taskId", "runType", "attemptId", "approvedRunId"]);
  if (
    !isText(input.taskId) ||
    !isText(input.runType) ||
    !isText(input.attemptId) ||
    !isText(input.approvedRunId)
  ) {
    throw preparationError();
  }
  return Object.freeze({
    taskId: input.taskId,
    runType: input.runType as TaskOrchestratorRunnerDispatchInput["runType"],
    attemptId: input.attemptId,
    approvedRunId: input.approvedRunId
  });
}

function exactOwnDataObject(value: unknown, expectedFields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw preparationError();
  }
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0) {
    throw preparationError();
  }
  const actual = Object.getOwnPropertyNames(value).sort();
  const expected = [...expectedFields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw preparationError();
  }
  const normalized: Record<string, unknown> = Object.create(null);
  for (const field of expectedFields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw preparationError();
    }
    normalized[field] = descriptor.value;
  }
  return Object.freeze(normalized);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function preparationError(): SpecialistRunnerPreparationError {
  return new SpecialistRunnerPreparationError();
}
