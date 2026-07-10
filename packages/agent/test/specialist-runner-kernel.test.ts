import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { serializeSpecialistLocalArtifact, writeSpecialistDerivativeArtifact } from "../src/index.js";

describe("specialist runner artifact serialization", () => {
  it("serializes plain JSON deterministically with sorted object keys", () => {
    expect(serializeSpecialistLocalArtifact({
      beta: 2,
      alpha: ["x", { nested: true }]
    }).toString("utf8")).toBe('{"alpha":["x",{"nested":true}],"beta":2}');
  });

  it("rejects object and array accessors without invoking getters", () => {
    let objectGetterCalls = 0;
    const objectWithGetter = {};
    Object.defineProperty(objectWithGetter, "secret", {
      enumerable: true,
      get() {
        objectGetterCalls += 1;
        return "hidden";
      }
    });
    expect(() => serializeSpecialistLocalArtifact(objectWithGetter)).toThrow(/data properties/i);
    expect(objectGetterCalls).toBe(0);

    let arrayGetterCalls = 0;
    const arrayWithGetter: unknown[] = [];
    Object.defineProperty(arrayWithGetter, "0", {
      enumerable: true,
      get() {
        arrayGetterCalls += 1;
        return "hidden";
      }
    });
    expect(() => serializeSpecialistLocalArtifact(arrayWithGetter)).toThrow(/data properties/i);
    expect(arrayGetterCalls).toBe(0);
  });

  it("rejects sparse arrays and unsupported array properties", () => {
    const sparse: unknown[] = [];
    sparse.length = 2;
    sparse[1] = "value";
    expect(() => serializeSpecialistLocalArtifact(sparse)).toThrow(/sparse/i);

    const custom = ["value"] as string[] & { extra?: string };
    custom.extra = "unsupported";
    expect(() => serializeSpecialistLocalArtifact(custom)).toThrow(/unsupported array property/i);
  });

  it("rejects symbols, non-enumerable fields, unsafe keys, cycles, and non-finite numbers", () => {
    const symbolKey = Symbol("hidden");
    const withSymbol = { visible: true } as Record<PropertyKey, unknown>;
    withSymbol[symbolKey] = "hidden";
    expect(() => serializeSpecialistLocalArtifact(withSymbol)).toThrow(/symbol-keyed/i);

    const nonEnumerable = { visible: true };
    Object.defineProperty(nonEnumerable, "hidden", { enumerable: false, value: true });
    expect(() => serializeSpecialistLocalArtifact(nonEnumerable)).toThrow(/non-enumerable/i);

    const unsafe = {};
    Object.defineProperty(unsafe, "__proto__", { enumerable: true, value: "pollution" });
    expect(() => serializeSpecialistLocalArtifact(unsafe)).toThrow(/unsafe key/i);

    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => serializeSpecialistLocalArtifact(cycle)).toThrow(/cycle/i);

    expect(() => serializeSpecialistLocalArtifact({ value: Number.NaN })).toThrow(/non-finite/i);
    expect(() => serializeSpecialistLocalArtifact({ value: Number.POSITIVE_INFINITY })).toThrow(/non-finite/i);
  });

  it("treats derivative store return values as exact plain data without invoking getters", async () => {
    let getterCalls = 0;
    const hostileResult = {};
    Object.defineProperty(hostileResult, "contentHash", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return hashBytes(serializeSpecialistLocalArtifact({ ok: true }));
      }
    });
    Object.defineProperty(hostileResult, "sizeBytes", {
      enumerable: true,
      value: serializeSpecialistLocalArtifact({ ok: true }).byteLength
    });

    await expect(writeSpecialistDerivativeArtifact({
      derivativeStore: { put: async () => hostileResult as { readonly contentHash: `sha256:${string}`; readonly sizeBytes: number } },
      artifactKind: "hostile-artifact",
      payload: { ok: true }
    })).rejects.toThrow(/data properties/i);
    expect(getterCalls).toBe(0);
  });

  it("rejects derivative store results with prototypes, extra fields, symbols, or stale values", async () => {
    const payload = { ok: true };
    const bytes = serializeSpecialistLocalArtifact(payload);
    const validResult = { contentHash: hashBytes(bytes), sizeBytes: bytes.byteLength };
    const prototypeResult = Object.assign(Object.create({ hidden: true }), validResult);
    await expect(writeSpecialistDerivativeArtifact({
      derivativeStore: { put: async () => prototypeResult },
      artifactKind: "prototype-artifact",
      payload
    })).rejects.toThrow(/plain JSON objects/i);

    await expect(writeSpecialistDerivativeArtifact({
      derivativeStore: { put: async () => ({ ...validResult, extra: "forged" }) },
      artifactKind: "extra-artifact",
      payload
    })).rejects.toThrow(/exactly contentHash and sizeBytes/i);

    const symbol = Symbol("hidden");
    const symbolResult = { ...validResult } as Record<PropertyKey, unknown>;
    symbolResult[symbol] = "forged";
    await expect(writeSpecialistDerivativeArtifact({
      derivativeStore: { put: async () => symbolResult as { readonly contentHash: `sha256:${string}`; readonly sizeBytes: number } },
      artifactKind: "symbol-artifact",
      payload
    })).rejects.toThrow(/symbol-keyed/i);

    await expect(writeSpecialistDerivativeArtifact({
      derivativeStore: { put: async () => ({ contentHash: hashBytes(Buffer.from("forged")), sizeBytes: bytes.byteLength }) },
      artifactKind: "stale-artifact",
      payload
    })).rejects.toThrow(/stale hash/i);
  });
});

function hashBytes(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
