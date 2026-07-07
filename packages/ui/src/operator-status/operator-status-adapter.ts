import { operatorStatusDtoSchema } from "../../../operator-status/src/contracts.js";
import type {
  OperatorDiagnosticDto,
  OperatorReadinessState,
  OperatorStatusDto,
  OperatorStatusSectionDto
} from "./operator-status-types.js";

export interface OperatorStatusAdapter {
  loadStatus(): Promise<OperatorStatusDto>;
}

export interface HttpOperatorStatusAdapterOptions {
  readonly baseUrl?: string;
  readonly authToken?: string;
  readonly credentials?: RequestCredentials;
  readonly fetcher?: typeof fetch;
}

const unavailableSectionIds = ["workspace", "ingestion", "legacy-import", "prr", "agent"] as const;

export function createHttpOperatorStatusAdapter(
  options: HttpOperatorStatusAdapterOptions = {}
): OperatorStatusAdapter {
  const baseUrl = options.baseUrl ?? "";
  const credentials = options.credentials ?? "same-origin";
  const fetcher = options.fetcher ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));

  return Object.freeze({
    async loadStatus() {
      let response: Response;
      try {
        response = await fetcher(`${baseUrl}/api/operator/status`, {
          credentials,
          headers: authHeaders(options.authToken),
          method: "GET"
        });
      } catch {
        return runtimeUnavailableStatus({ message: "Operator status runtime request failed." });
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        return runtimeUnavailableStatus({
          message: response.ok
            ? "Operator status runtime returned invalid JSON."
            : `Operator status runtime returned HTTP ${response.status}.`
        });
      }

      if (!response.ok) {
        return runtimeUnavailableStatus({
          message: messageFromRuntimeFailure(json) ?? `Operator status runtime returned HTTP ${response.status}.`
        });
      }

      try {
        return operatorStatusDtoFromJson(json);
      } catch {
        return runtimeUnavailableStatus({ message: "Operator status runtime returned an invalid DTO." });
      }
    }
  });
}

export const httpOperatorStatusAdapter = createHttpOperatorStatusAdapter();

export function createStaticOperatorStatusAdapter(dto: OperatorStatusDto): OperatorStatusAdapter {
  const stored = operatorStatusDtoFromJson(dto);

  return Object.freeze({
    async loadStatus() {
      return deepFreeze(deepClone(stored));
    }
  });
}

export function operatorStatusDtoFromJson(value: unknown): OperatorStatusDto {
  return deepFreeze(operatorStatusDtoSchema.parse(safeOperatorValue(value)));
}

export function runtimeUnavailableStatus(input: {
  readonly generatedAt?: string;
  readonly message?: string;
} = {}): OperatorStatusDto {
  const generatedAt = safeGeneratedAt(input.generatedAt);
  const message = safeOperatorText(input.message ?? "Operator status runtime is unavailable.");
  const diagnostic: OperatorDiagnosticDto = {
    diagnosticId: "diag_operator_runtime_unavailable",
    severity: "error",
    category: "runtime",
    message,
    refs: []
  };
  const sections = unavailableSectionIds.map((sectionId) =>
    unavailableSection(sectionId, diagnostic)
  );

  const value = {
    schemaVersion: "operator-status.v1",
    generatedAt,
    runtime: {
      available: false,
      safeMessage: message
    },
    summary: {
      overallState: "unavailable",
      blockedCount: 0,
      actionRequiredCount: 0,
      degradedCount: 0
    },
    sections,
    safeActions: []
  };
  const parsed = operatorStatusDtoSchema.safeParse(safeOperatorValue(value));
  if (parsed.success) {
    return deepFreeze(parsed.data);
  }

  return operatorStatusDtoFromJson({
    schemaVersion: "operator-status.v1",
    generatedAt: new Date().toISOString(),
    runtime: {
      available: false,
      safeMessage: "Operator status runtime is unavailable."
    },
    summary: {
      overallState: "unavailable",
      blockedCount: 0,
      actionRequiredCount: 0,
      degradedCount: 0
    },
    sections: unavailableSectionIds.map((sectionId) =>
      unavailableSection(sectionId, {
        diagnosticId: "diag_operator_runtime_unavailable",
        severity: "error",
        category: "runtime",
        message: "Operator status runtime is unavailable.",
        refs: []
      })
    ),
    safeActions: []
  });
}

export function safeOperatorText(text: string): string {
  return text
    .replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted credential]")
    .replace(
      /\b(?:password|passwd|secret|token|oauth[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|credential|credentials)\s*[:=]\s*[^\s,;]+/gi,
      "[redacted credential]"
    )
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----/gi, "[redacted credential]")
    .replace(/-----END [^-]*PRIVATE KEY-----/gi, "[redacted credential]")
    .replace(/\b[A-Za-z]:\\[^\s"',;)]+/g, "[path redacted]")
    .replace(/(?<![:/])\/(?!\/)[^\s"',;)]+/g, "[path redacted]")
    .replace(
      /\b(?:auth[\s._-]*tokens?|bearer(?:[\s._-]*tokens?)?|tokens?|passwords?|private[\s._-]*keys?)\b/gi,
      "[redacted credential]"
    );
}

function safeGeneratedAt(value: string | undefined): string {
  if (value === undefined) {
    return new Date().toISOString();
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString();
}

function unavailableSection(
  sectionId: OperatorStatusSectionDto["sectionId"],
  diagnostic: OperatorDiagnosticDto
): OperatorStatusSectionDto {
  return {
    sectionId,
    label: sectionLabel(sectionId),
    state: "unavailable" satisfies OperatorReadinessState,
    headline: `${sectionLabel(sectionId)} unavailable`,
    safeSummary: "Local runtime status could not be loaded.",
    metrics: [],
    diagnostics: [diagnostic],
    sourceEvidence: [],
    nextSafeActionIds: []
  };
}

function sectionLabel(sectionId: OperatorStatusSectionDto["sectionId"]): string {
  switch (sectionId) {
    case "workspace":
      return "Workspace";
    case "ingestion":
      return "Ingestion";
    case "legacy-import":
      return "Legacy Import";
    case "prr":
      return "PRR";
    case "agent":
      return "Agent";
  }
}

function authHeaders(authToken: string | undefined): Record<string, string> {
  return authToken === undefined ? {} : { authorization: `Bearer ${authToken}` };
}

function messageFromRuntimeFailure(value: unknown): string | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  if (typeof value.message === "string") {
    return value.message;
  }

  if (isJsonObject(value.error) && typeof value.error.message === "string") {
    return value.error.message;
  }

  return undefined;
}

function safeOperatorValue(value: unknown): unknown {
  if (typeof value === "string") {
    return safeOperatorText(value);
  }

  if (Array.isArray(value)) {
    return value.map(safeOperatorValue);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, safeOperatorValue(nested)])
  );
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
