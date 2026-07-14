import { describe, expect, it } from "vitest";
import { createCredentialReference } from "../src/credential-reference.js";
import * as osSecretStore from "../src/os-secret-store.js";
import {
  createOsSecretStore,
  OpaqueSecretMaterial,
  type OsSecretMaterialIssuer,
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

function resolvedCredentialFreeTestMaterial(issueMaterial: OsSecretMaterialIssuer) {
  const material = issueMaterial();
  if (material === undefined) {
    throw new Error("in-flight test issuer was unexpectedly unavailable");
  }
  return { kind: "resolved" as const, material };
}

describe("OS-backed exact-use secret store", () => {
  it("rejects a swapped workspace before the OS facility observes the request", async () => {
    let backendCalls = 0;
    const store = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve(_request, issueMaterial) {
          backendCalls += 1;
          return resolvedCredentialFreeTestMaterial(issueMaterial);
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
    let material: OpaqueSecretMaterial | undefined;
    const store = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve(_request, issueMaterial) {
          const resolution = resolvedCredentialFreeTestMaterial(issueMaterial);
          material = resolution.material;
          return resolution;
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

  it("expires a backend-retained issuer after its valid resolution settles", async () => {
    let retainedIssuer: OsSecretMaterialIssuer | undefined;
    const store = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve(_request, issueMaterial) {
          retainedIssuer = issueMaterial;
          return resolvedCredentialFreeTestMaterial(issueMaterial);
        }
      }
    });

    await expect(store.resolveForExactUse(exactUseRequest())).resolves.toMatchObject({
      kind: "resolved",
      health: "healthy"
    });
    expect(retainedIssuer).toBeDefined();

    const materialMintedAfterSettlement = retainedIssuer?.();
    expect(materialMintedAfterSettlement).toBeUndefined();

    const replayStore = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve() {
          return { kind: "resolved" as const, material: materialMintedAfterSettlement as OpaqueSecretMaterial };
        }
      }
    });

    await expect(replayStore.resolveForExactUse(exactUseRequest())).resolves.toEqual({
      kind: "unavailable",
      health: "unverified",
      safeDiagnosticCodes: ["os-secret-facility-unavailable"]
    });
  });

  it("makes runtime construction unable to mint accepted material", () => {
    expect("createCredentialFreeTestOpaqueSecretMaterial" in osSecretStore).toBe(false);
    const runtimeConstructor = OpaqueSecretMaterial as unknown as Function;
    expect(() => Reflect.construct(runtimeConstructor, [])).toThrow();
  });

  it("does not accept active material issued for a different exact use", async () => {
    let issuedForPrimary: OpaqueSecretMaterial | undefined;
    const primaryStore = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve(_request, issueMaterial) {
          issuedForPrimary = issueMaterial();
          if (issuedForPrimary === undefined) {
            throw new Error("test issuer was unexpectedly unavailable");
          }
          return { kind: "resolved", material: issuedForPrimary };
        }
      }
    });

    await expect(primaryStore.resolveForExactUse(exactUseRequest())).resolves.toMatchObject({
      kind: "resolved",
      health: "healthy"
    });
    expect(issuedForPrimary).toBeDefined();

    const otherUse = exactUseRequest({ runId: "run_other" });
    const otherStore = createOsSecretStore({
      currentUse: otherUse,
      backend: {
        async resolve() {
          return { kind: "resolved", material: issuedForPrimary as OpaqueSecretMaterial };
        }
      }
    });

    await expect(otherStore.resolveForExactUse(otherUse)).resolves.toEqual({
      kind: "unavailable",
      health: "unverified",
      safeDiagnosticCodes: ["os-secret-facility-unavailable"]
    });
  });

  it("cannot bypass release by replacing the exported prototype method", async () => {
    let material: OpaqueSecretMaterial | undefined;
    const store = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve(_request, issueMaterial) {
          if (material === undefined) {
            material = resolvedCredentialFreeTestMaterial(issueMaterial).material;
          }
          return { kind: "resolved" as const, material };
        }
      }
    });
    const firstResult = await store.resolveForExactUse(exactUseRequest());
    expect(firstResult.material).toBeDefined();
    const prototype = OpaqueSecretMaterial.prototype as {
      releaseAfterImmediateUse?: () => void;
    };
    const original = prototype.releaseAfterImmediateUse;
    prototype.releaseAfterImmediateUse = () => undefined;
    try {
      firstResult.material?.releaseAfterImmediateUse();
    } finally {
      if (original === undefined) {
        delete prototype.releaseAfterImmediateUse;
      } else {
        prototype.releaseAfterImmediateUse = original;
      }
    }

    await expect(store.resolveForExactUse(exactUseRequest())).resolves.toEqual({
      kind: "unavailable",
      health: "unverified",
      safeDiagnosticCodes: ["os-secret-facility-unavailable"]
    });
  });

  it("rejects a released material before a resolved result", async () => {
    const store = createOsSecretStore({
      currentUse: exactUseRequest(),
      backend: {
        async resolve(_request, issueMaterial) {
          const released = resolvedCredentialFreeTestMaterial(issueMaterial).material;
          released.releaseAfterImmediateUse();
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
        async resolve(_request, issueMaterial) {
          backendCalls += 1;
          return resolvedCredentialFreeTestMaterial(issueMaterial);
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
        async resolve(_request, issueMaterial) {
          backendCalls += 1;
          return resolvedCredentialFreeTestMaterial(issueMaterial);
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

  it("normalizes hostile factory and backend inputs before any traps or effects", async () => {
    let traps = 0;
    const hostileFactory = new Proxy({}, {
      get() {
        traps += 1;
        throw new Error("hostile factory getter must not run");
      },
      ownKeys() {
        traps += 1;
        throw new Error("hostile factory keys must not run");
      }
    });
    const factoryWithGetter = Object.defineProperty({}, "currentUse", {
      enumerable: true,
      get() {
        traps += 1;
        throw new Error("hostile factory accessor must not run");
      }
    });
    const hostileBackend = new Proxy({}, {
      get() {
        traps += 1;
        throw new Error("hostile backend getter must not run");
      },
      ownKeys() {
        traps += 1;
        throw new Error("hostile backend keys must not run");
      }
    });
    const backendWithGetter = Object.defineProperty({}, "resolve", {
      enumerable: true,
      get() {
        traps += 1;
        throw new Error("hostile backend accessor must not run");
      }
    });
    const inputs = [
      hostileFactory,
      factoryWithGetter,
      { currentUse: exactUseRequest(), backend: hostileBackend },
      { currentUse: exactUseRequest(), backend: backendWithGetter }
    ];

    for (const input of inputs) {
      const store = createOsSecretStore(input as Parameters<typeof createOsSecretStore>[0]);
      await expect(store.resolveForExactUse(exactUseRequest())).resolves.toEqual({
        kind: "blocked",
        health: "unverified",
        safeDiagnosticCodes: ["secret-safety-rejection"]
      });
    }
    expect(traps).toBe(0);
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
        async resolve(_request, issueMaterial) {
          backendCalls += 1;
          return resolvedCredentialFreeTestMaterial(issueMaterial);
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
        async resolve(_request, issueMaterial) {
          backendCalls += 1;
          return resolvedCredentialFreeTestMaterial(issueMaterial);
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
        async resolve(_request, issueMaterial) {
          backendCalls += 1;
          return resolvedCredentialFreeTestMaterial(issueMaterial);
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
