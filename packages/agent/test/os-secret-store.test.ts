import { describe, expect, it } from "vitest";
import { createCredentialReference } from "../src/credential-reference.js";
import {
  createCredentialFreeTestOpaqueSecretMaterial,
  createOsSecretStore,
  OpaqueSecretMaterial,
  type OsSecretResolutionRequest
} from "../src/os-secret-store.js";

const capabilityHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function currentReference() {
  return currentReferenceWith({});
}

function currentReferenceWith(input: {
  readonly status?: "linked" | "missing-binding" | "healthy" | "expired" | "revoked" | "insufficient-scope" | "unverified";
  readonly capabilityScopes?: ("model-inference" | "provider-health" | "provider-parse" | "harness-execution")[];
}) {
  return createCredentialReference({
    credentialRefId: "agent_credref_nous_primary",
    providerId: "provider_nous",
    credentialKind: "api-key-bearer",
    scopeKind: "machine",
    capabilityScopes: input.capabilityScopes ?? ["model-inference"],
    safeLabel: "Nous primary credential",
    authorizedBy: "actor_operator",
    authorizedAt: "2026-07-14T00:00:00.000Z",
    status: input.status ?? "healthy",
    policyVersion: "policy_nous_v1",
    sourceEventIds: ["evt_binding_linked"]
  });
}

function exactUseRequest(input: Partial<OsSecretResolutionRequest> = {}): OsSecretResolutionRequest {
  return {
    credentialRef: currentReference(),
    providerCapabilityHash: capabilityHash,
    workspaceId: "workspace_primary",
    mountInstanceId: "mount_primary",
    runId: "run_primary",
    purpose: "model-inference",
    ...input
  };
}

describe("OS-backed exact-use secret store", () => {
  it("rejects a swapped workspace before the OS facility observes the request", async () => {
    let backendCalls = 0;
    const store = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve() {
          backendCalls += 1;
          return { kind: "resolved", material: createCredentialFreeTestOpaqueSecretMaterial() };
        }
      }
    });

    const result = await store.resolveForExactUse({
      ...exactUseRequest(),
      workspaceId: "workspace_swapped"
    });

    expect(result).toEqual({
      kind: "blocked",
      health: "unverified",
      safeDiagnosticCodes: ["exact-use-mismatch"]
    });
    expect(backendCalls).toBe(0);
  });

  it("resolves a current exact use through an opaque credential-free test handle only", async () => {
    const material = createCredentialFreeTestOpaqueSecretMaterial();
    const store = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve() {
          return { kind: "resolved", material };
        }
      }
    });

    const result = await store.resolveForExactUse(exactUseRequest());

    expect(result.kind).toBe("resolved");
    expect(result.health).toBe("healthy");
    expect(result.safeDiagnosticCodes).toEqual([]);
    expect(result.material).toBe(material);
    expect(JSON.stringify(result)).toBe(
      JSON.stringify({ kind: "resolved", health: "healthy", safeDiagnosticCodes: [] })
    );
  });

  it("makes runtime construction unable to mint accepted material", () => {
    const runtimeConstructor = OpaqueSecretMaterial as unknown as Function;
    expect(() => Reflect.construct(runtimeConstructor, [])).toThrow();
  });

  it("rejects a released material before a resolved result", async () => {
    const released = createCredentialFreeTestOpaqueSecretMaterial();
    released.releaseAfterImmediateUse();
    const store = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve() {
          return { kind: "resolved", material: released };
        }
      }
    });

    await expect(store.resolveForExactUse(exactUseRequest())).resolves.toEqual({
      kind: "unavailable",
      health: "unverified",
      safeDiagnosticCodes: ["os-secret-facility-unavailable"]
    });
  });

  it.each([
    ["mount", { mountInstanceId: "mount_swapped" }],
    ["run", { runId: "run_swapped" }],
    ["provider capability", { providerCapabilityHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }],
    ["credential reference", { credentialRef: createCredentialReference({
      ...currentReference(),
      credentialRefId: "agent_credref_nous_swapped"
    }) }]
  ] as const)("rejects a swapped %s before the OS facility observes the request", async (_label, mutation) => {
    let backendCalls = 0;
    const store = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve() {
          backendCalls += 1;
          return { kind: "resolved", material: createCredentialFreeTestOpaqueSecretMaterial() };
        }
      }
    });

    await expect(store.resolveForExactUse({ ...exactUseRequest(), ...mutation })).resolves.toEqual({
      kind: "blocked",
      health: "unverified",
      safeDiagnosticCodes: ["exact-use-mismatch"]
    });
    expect(backendCalls).toBe(0);
  });

  it("rejects a direct hostile proxy before it can reach the OS facility", async () => {
    let backendCalls = 0;
    let getterCalls = 0;
    const store = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve() {
          backendCalls += 1;
          return { kind: "resolved", material: createCredentialFreeTestOpaqueSecretMaterial() };
        }
      }
    });
    const proxied = new Proxy(exactUseRequest(), {
      get() {
        getterCalls += 1;
        throw new Error("hostile getter must not run");
      }
    });

    await expect(store.resolveForExactUse(proxied as OsSecretResolutionRequest)).resolves.toEqual({
      kind: "blocked",
      health: "unverified",
      safeDiagnosticCodes: ["secret-safety-rejection"]
    });
    expect(getterCalls).toBe(0);
    expect(backendCalls).toBe(0);
  });

  it.each([
    ["missing-binding", "unavailable", "missing-binding", "credential-binding-missing"],
    ["expired", "blocked", "expired", "credential-expired"],
    ["revoked", "blocked", "revoked", "credential-revoked"],
    ["insufficient-scope", "blocked", "insufficient-scope", "credential-insufficient-scope"],
    ["unverified", "blocked", "unverified", "credential-unverified"]
  ] as const)("returns only safe health for a %s current reference", async (
    status,
    kind,
    health,
    safeDiagnosticCode
  ) => {
    let backendCalls = 0;
    const request = exactUseRequest({ credentialRef: currentReferenceWith({ status }) });
    const store = createOsSecretStore({
      currentUse: request,
      backend: {
        async resolve() {
          backendCalls += 1;
          return { kind: "resolved", material: createCredentialFreeTestOpaqueSecretMaterial() };
        }
      }
    });

    await expect(store.resolveForExactUse(request)).resolves.toEqual({
      kind,
      health,
      safeDiagnosticCodes: [safeDiagnosticCode]
    });
    expect(backendCalls).toBe(0);
  });

  it("rejects a swapped declared purpose before the OS facility observes it", async () => {
    let backendCalls = 0;
    const currentUse = exactUseRequest({
      credentialRef: currentReferenceWith({ capabilityScopes: ["model-inference", "provider-health"] })
    });
    const store = createOsSecretStore({
      currentUse,
      backend: {
        async resolve() {
          backendCalls += 1;
          return { kind: "resolved", material: createCredentialFreeTestOpaqueSecretMaterial() };
        }
      }
    });

    await expect(store.resolveForExactUse({ ...currentUse, purpose: "provider-health" })).resolves.toEqual({
      kind: "blocked",
      health: "unverified",
      safeDiagnosticCodes: ["exact-use-mismatch"]
    });
    expect(backendCalls).toBe(0);
  });

  it("rejects accessor, prototype, symbol, and sparse-array request shapes without invoking the backend", async () => {
    let backendCalls = 0;
    let accessorCalls = 0;
    const store = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve() {
          backendCalls += 1;
          return { kind: "resolved", material: createCredentialFreeTestOpaqueSecretMaterial() };
        }
      }
    });
    const accessorRequest = exactUseRequest();
    Object.defineProperty(accessorRequest, "workspaceId", {
      enumerable: true,
      get() {
        accessorCalls += 1;
        return "workspace_primary";
      }
    });
    const prototypeRequest = Object.assign(Object.create({ inherited: true }), exactUseRequest());
    const symbolRequest = Object.assign(exactUseRequest(), { [Symbol("unexpected")]: true });
    const sparseCapabilityScopes: ("model-inference" | "provider-health" | "provider-parse" | "harness-execution")[] = ["model-inference"];
    sparseCapabilityScopes.length = 2;
    const sparseRequest = exactUseRequest({
      credentialRef: {
        ...currentReference(),
        capabilityScopes: sparseCapabilityScopes
      }
    });

    for (const request of [accessorRequest, prototypeRequest, symbolRequest, sparseRequest]) {
      await expect(store.resolveForExactUse(request as OsSecretResolutionRequest)).resolves.toEqual({
        kind: "blocked",
        health: "unverified",
        safeDiagnosticCodes: ["secret-safety-rejection"]
      });
    }
    expect(accessorCalls).toBe(0);
    expect(backendCalls).toBe(0);
  });

  it("returns a bounded unavailable result when the injected OS facility is locked or throws", async () => {
    const lockedStore = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve() {
          return {
            kind: "unavailable",
            health: "unverified",
            safeDiagnosticCode: "os-secret-facility-unavailable"
          };
        }
      }
    });
    const throwingStore = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve() {
          throw new Error("OS facility locator must not escape");
        }
      }
    });
    const expected = {
      kind: "unavailable",
      health: "unverified",
      safeDiagnosticCodes: ["os-secret-facility-unavailable"]
    };

    await expect(lockedStore.resolveForExactUse(exactUseRequest())).resolves.toEqual(expected);
    await expect(throwingStore.resolveForExactUse(exactUseRequest())).resolves.toEqual(expected);
  });
});
