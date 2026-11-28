export interface EndpointAllowlistRule {
  readonly fromLabel: string;
  readonly edgeLabel: string;
  readonly toLabel: string;
}

export class HelixAllowlistError extends Error {
  readonly code = "HELIX_ENDPOINT_NOT_ALLOWED";

  constructor(message: string) {
    super(message);
    this.name = "HelixAllowlistError";
  }
}

export class EndpointAllowlist {
  private readonly allowedKeys: ReadonlySet<string>;
  readonly rules: readonly EndpointAllowlistRule[];

  constructor(rules: readonly EndpointAllowlistRule[]) {
    const normalized: EndpointAllowlistRule[] = [];
    const keys = new Set<string>();
    for (const rule of rules) {
      assertNonEmptyLabel("fromLabel", rule.fromLabel);
      assertNonEmptyLabel("edgeLabel", rule.edgeLabel);
      assertNonEmptyLabel("toLabel", rule.toLabel);
      const key = allowlistKey(rule.fromLabel, rule.edgeLabel, rule.toLabel);
      if (!keys.has(key)) {
        keys.add(key);
        normalized.push(Object.freeze({ ...rule }));
      }
    }
    this.rules = Object.freeze(normalized);
    this.allowedKeys = keys;
  }

  isAllowed(fromLabel: string, edgeLabel: string, toLabel: string): boolean {
    return this.allowedKeys.has(allowlistKey(fromLabel, edgeLabel, toLabel));
  }

  assertAllowed(fromLabel: string, edgeLabel: string, toLabel: string): void {
    if (!this.isAllowed(fromLabel, edgeLabel, toLabel)) {
      throw new HelixAllowlistError(
        `Edge (${fromLabel})-[:${edgeLabel}]->(${toLabel}) is not in the configured endpoint allowlist.`
      );
    }
  }
}

function assertNonEmptyLabel(field: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HelixAllowlistError(`Endpoint allowlist ${field} must be a non-empty string.`);
  }
}

function allowlistKey(fromLabel: string, edgeLabel: string, toLabel: string): string {
  return `${fromLabel}\u0000${edgeLabel}\u0000${toLabel}`;
}
