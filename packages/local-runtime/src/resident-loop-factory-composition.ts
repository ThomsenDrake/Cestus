import type {
  WakeSupervisorCommandResultDto
} from "../../agent/src/wake-supervisor.js";
import type {
  HandoffAuthorityBinding,
  MountedSpecialistHandoffAuthorityWitness
} from "../../agent/src/specialist-handoff-authority.js";
import type {
  MountedProviderAuthority,
  MountedProviderAuthorityReadback
} from "./mounted-provider-authority.js";
import {
  createResidentLoopFactoryCompositionForFacade
} from "./wake-supervisor-runtime.js";
import type {
  WakeSupervisorRuntime,
  WakeSupervisorRuntimeInput
} from "./wake-supervisor-runtime.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

export interface ResidentLoopFactoryCompositionInput {
  readonly runtimeHandle: LocalRuntimeHandle;
  readonly actor: WakeSupervisorRuntimeInput["actor"];
  readonly supervisorEpoch: string;
  readonly policy: {
    readonly policyVersion: string;
    readonly policyDigest: `sha256:${string}`;
    readonly lockStateDigest: `sha256:${string}`;
  };
  readonly now: () => string;
  readonly createSafeId: (
    kind: "lease" | "diagnostic" | "reconciliation"
  ) => string;
}

export interface ResidentLoopFactoryAuthorityBindInput {
  readonly providerAuthority: MountedProviderAuthority;
  readonly handoffAuthorityWitness: MountedSpecialistHandoffAuthorityWitness;
}

export interface ResidentLoopFactoryAuthorityReadback {
  readonly provider: MountedProviderAuthorityReadback;
  readonly handoff: {
    readonly taskId: string;
    readonly attemptId: string;
    readonly runId: string;
    readonly runType: string;
    readonly retryGeneration: number;
    readonly authorityBinding: HandoffAuthorityBinding;
  };
}

export interface ResidentLoopFactoryComposition {
  /** W's bounded public control surface; it never exposes a runtime handle. */
  readonly wakeRuntime: WakeSupervisorRuntime;
  start(): Promise<WakeSupervisorCommandResultDto>;
  bind(input: unknown): Promise<ResidentLoopFactoryAuthorityReadback>;
  stop(): Promise<void>;
}

export function createResidentLoopFactoryComposition(
  rawInput: unknown
): ResidentLoopFactoryComposition {
  return createResidentLoopFactoryCompositionForFacade(rawInput);
}
