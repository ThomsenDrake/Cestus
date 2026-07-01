export const prrDiagnosticCategories = [
  "contract",
  "lifecycle",
  "deadline",
  "adapter",
  "evidence",
  "projection",
  "escalation"
] as const;

export type PrrDiagnosticCategory = (typeof prrDiagnosticCategories)[number];

export interface PrrDiagnosticInput {
  diagnosticId: string;
  prrRequestId: string;
  category: PrrDiagnosticCategory;
  message: string;
  violatedPath: string;
  allowedActions: readonly string[];
}

export interface PrrDiagnostic {
  diagnosticId: string;
  prrRequestId: string;
  category: PrrDiagnosticCategory;
  message: string;
  repairHint: {
    violatedPath: string;
    allowedActions: string[];
  };
}

const secretTextPattern =
  /(?:^|[^a-z0-9])(?:token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret)(?:$|[^a-z0-9])/i;

export function createPrrDiagnostic(input: PrrDiagnosticInput): PrrDiagnostic {
  assertNoSecretText(input.message);
  assertNoSecretText(input.violatedPath);
  for (const action of input.allowedActions) {
    assertNoSecretText(action);
  }

  return {
    diagnosticId: input.diagnosticId,
    prrRequestId: input.prrRequestId,
    category: input.category,
    message: input.message,
    repairHint: {
      violatedPath: input.violatedPath,
      allowedActions: [...input.allowedActions]
    }
  };
}

function assertNoSecretText(value: string): void {
  if (secretTextPattern.test(value)) {
    throw new Error("PRR diagnostics must not contain secrets");
  }
}
