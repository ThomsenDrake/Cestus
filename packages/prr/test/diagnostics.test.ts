import { describe, expect, it } from "vitest";
import { createPrrDiagnostic as exportedCreatePrrDiagnostic } from "../src/index.js";
import { createPrrDiagnostic, type PrrDiagnosticCategory } from "../src/diagnostics.js";

const cleanInput = {
  diagnosticId: "diag_prr_001",
  prrRequestId: "prr_req_001",
  category: "adapter",
  message: "Himalaya command failed",
  violatedPath: "adapter.himalaya.command",
  allowedActions: ["check Himalaya profile", "use another adapter"]
} as const;

describe("PRR diagnostics", () => {
  it("records repair hints without secrets", () => {
    expect(createPrrDiagnostic(cleanInput)).toEqual({
      diagnosticId: "diag_prr_001",
      prrRequestId: "prr_req_001",
      category: "adapter",
      message: "Himalaya command failed",
      repairHint: {
        violatedPath: "adapter.himalaya.command",
        allowedActions: ["check Himalaya profile", "use another adapter"]
      }
    });
  });

  it("exports the diagnostic helper from the PRR package index", () => {
    expect(exportedCreatePrrDiagnostic(cleanInput)).toEqual(createPrrDiagnostic(cleanInput));
  });

  it.each([
    ["message token", { message: "OAuth token expired" }],
    ["message password", { message: "Mailbox password was rejected" }],
    ["message private key", { message: "-----BEGIN PRIVATE KEY-----" }],
    ["action client secret", { allowedActions: ["rotate client secret"] }],
    ["action refresh secret", { allowedActions: ["replace refresh secret"] }],
    ["action session secret", { allowedActions: ["replace session secret"] }],
    ["path token", { violatedPath: "adapter.oauth.token" }],
    ["path password", { violatedPath: "adapter.credentials.password" }]
  ])("rejects secret-bearing %s text", (_caseName, override) => {
    expect(() => createPrrDiagnostic({ ...cleanInput, ...override })).toThrow(
      "PRR diagnostics must not contain secrets"
    );
  });

  it("clones allowed actions so input mutation cannot change the diagnostic", () => {
    const allowedActions = ["check Himalaya profile", "use another adapter"];

    const diagnostic = createPrrDiagnostic({
      ...cleanInput,
      allowedActions
    });
    allowedActions.push("mutated after diagnostic creation");

    expect(diagnostic.repairHint.allowedActions).toEqual([
      "check Himalaya profile",
      "use another adapter"
    ]);
  });

  it("accepts every clean diagnostic category", () => {
    const categories: PrrDiagnosticCategory[] = [
      "contract",
      "lifecycle",
      "deadline",
      "adapter",
      "evidence",
      "projection",
      "escalation"
    ];

    expect(
      categories.map((category) =>
        createPrrDiagnostic({
          ...cleanInput,
          diagnosticId: `diag_prr_${category}`,
          category,
          message: `${category} diagnostic recorded`,
          violatedPath: `${category}.repairable`,
          allowedActions: [`review ${category} input`]
        }).category
      )
    ).toEqual(categories);
  });
});
