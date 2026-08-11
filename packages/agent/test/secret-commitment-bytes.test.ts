import { Buffer } from "node:buffer";
import vm from "node:vm";
import { describe, expect, test, vi } from "vitest";
import {
  snapshotCanonicalSecretCommitmentBytes,
  trustedCanonicalSecretCommitmentByteLength,
  type SecretCommitmentByteLimit
} from "../src/secret-commitment-bytes.js";
import type * as AgentBarrel from "../src/index.js";

type Assert<T extends true> = T;
type DoesNotExport<T, Key extends PropertyKey> = Key extends keyof T ? false : true;

const noBarrelLengthExport: Assert<DoesNotExport<typeof AgentBarrel, "trustedCanonicalSecretCommitmentByteLength">> = true;
const noBarrelSnapshotExport: Assert<DoesNotExport<typeof AgentBarrel, "snapshotCanonicalSecretCommitmentBytes">> = true;
void noBarrelLengthExport;
void noBarrelSnapshotExport;

// @ts-expect-error SecretCommitmentByteLimit must remain package-internal.
type BarrelSecretCommitmentByteLimit = import("../src/index.js").SecretCommitmentByteLimit;
void (undefined as unknown as BarrelSecretCommitmentByteLimit);

const FIXED_LIMIT: SecretCommitmentByteLimit = 32;
const PAYLOAD_LIMIT: SecretCommitmentByteLimit = 8_388_608;
const FRAME_LIMIT: SecretCommitmentByteLimit = 8_454_144;

const constructorCaseNames = [
  "throws", "wrong length", "wrong prototype", "input object alias", "input backing alias",
  "fixed SharedArrayBuffer", "resizable ArrayBuffer", "growable SharedArrayBuffer", "detached backing",
  "extra own string key", "extra symbol key", "transparent output Proxy", "throwing output Proxy",
  "exact canonical output control"
] as const;

const copyCaseNames = [
  "throws", "no-op", "prefix-only partial", "suffix-only partial", "one wrong byte", "all wrong bytes", "exact copy control"
] as const;

const inputShapeCaseNames = [
  "Buffer", "Uint8Array subclass", "altered prototype", "cross-realm prototype", "detached view",
  "transparent Proxy", "throwing Proxy", "length accessor", "buffer accessor", "extra string key",
  "extra symbol key", "shadowed property", "noncanonical descriptor", "fixed SharedArrayBuffer",
  "resizable ArrayBuffer fixed-length view", "resizable ArrayBuffer length-tracking view",
  "growable SharedArrayBuffer fixed-length view", "growable SharedArrayBuffer length-tracking view"
] as const;

const resourceOrderingCaseNames = [
  "exact-32 lower rejection", "exact-32 upper rejection", "payload plus-one rejection",
  "frame plus-one rejection", "exact-32 accepted control", "payload equal-limit control",
  "frame equal-limit control"
] as const;

const backingCaseNames = [
  "fixed SharedArrayBuffer", "resizable ArrayBuffer fixed-length view",
  "resizable ArrayBuffer length-tracking view", "growable SharedArrayBuffer fixed-length view",
  "growable SharedArrayBuffer length-tracking view"
] as const;

const successCaseNames = [
  "exact length", "exact snapshot", "fresh output", "caller mutation isolation", "output mutation isolation",
  "canonical output keys", "canonical output descriptors", "fixed non-shared output backing", "non-aliasing", "every byte equality"
] as const;

function bytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 37 + 11) & 0xff);
}

function expectCanonicalSnapshot(actual: Uint8Array | undefined, input: Uint8Array): readonly string[] {
  const asserted = new Set<string>();
  expect(actual).toBeInstanceOf(Uint8Array);
  asserted.add("exact snapshot");
  expect(actual).not.toBe(input);
  asserted.add("fresh output");
  expect(actual?.buffer).not.toBe(input.buffer);
  asserted.add("non-aliasing");
  expect(actual?.length).toBe(input.length);
  asserted.add("exact length");
  expect(Array.from(actual ?? [])).toEqual(Array.from(input));
  asserted.add("every byte equality");
  expect(Reflect.ownKeys(actual ?? new Uint8Array())).toEqual(
    Array.from({ length: input.length }, (_, index) => String(index))
  );
  asserted.add("canonical output keys");

  expect(actual?.buffer).toBeInstanceOf(ArrayBuffer);
  expect(actual?.buffer).not.toBeInstanceOf(SharedArrayBuffer);
  expect((actual?.buffer as ArrayBuffer & { readonly resizable?: boolean } | undefined)?.resizable).toBe(false);
  asserted.add("fixed non-shared output backing");

  for (let index = 0; index < input.length; index += 1) {
    expect(Object.getOwnPropertyDescriptor(actual as Uint8Array, String(index))).toEqual({
      configurable: true,
      enumerable: true,
      value: input[index],
      writable: true
    });
  }
  asserted.add("canonical output descriptors");
  return [...asserted];
}

function transparentProxy(value: Uint8Array, calls: { count: number }): Uint8Array {
  return new Proxy(value, {
    get(target, property, receiver) {
      calls.count += 1;
      return Reflect.get(target, property, receiver);
    },
    getOwnPropertyDescriptor(target, property) {
      calls.count += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
    getPrototypeOf(target) {
      calls.count += 1;
      return Reflect.getPrototypeOf(target);
    },
    ownKeys(target) {
      calls.count += 1;
      return Reflect.ownKeys(target);
    }
  });
}

function throwingProxy(value: Uint8Array, calls: { count: number }): Uint8Array {
  return new Proxy(value, {
    get() {
      calls.count += 1;
      throw new Error("input Proxy trap must not run");
    },
    getOwnPropertyDescriptor() {
      calls.count += 1;
      throw new Error("input Proxy trap must not run");
    },
    getPrototypeOf() {
      calls.count += 1;
      throw new Error("input Proxy trap must not run");
    },
    ownKeys() {
      calls.count += 1;
      throw new Error("input Proxy trap must not run");
    }
  });
}

function detachedView(): Uint8Array {
  const backing = new ArrayBuffer(4);
  const view = new Uint8Array(backing);
  structuredClone(backing, { transfer: [backing] });
  return view;
}

function resizableArrayBufferView(lengthTracking: boolean): Uint8Array | undefined {
  try {
    const Constructor = ArrayBuffer as unknown as new (length: number, options: { maxByteLength: number }) => ArrayBuffer;
    const backing = new Constructor(4, { maxByteLength: 8 });
    return lengthTracking ? new Uint8Array(backing) : new Uint8Array(backing, 0, 4);
  } catch {
    return undefined;
  }
}

function growableSharedArrayBufferView(lengthTracking: boolean): Uint8Array | undefined {
  try {
    const Constructor = SharedArrayBuffer as unknown as new (length: number, options: { maxByteLength: number }) => SharedArrayBuffer;
    const backing = new Constructor(4, { maxByteLength: 8 });
    return lengthTracking ? new Uint8Array(backing) : new Uint8Array(backing, 0, 4);
  } catch {
    return undefined;
  }
}

function noncanonicalDescriptorShape(): Uint8Array {
  const shape = Object.create(Uint8Array.prototype) as Uint8Array;
  Object.defineProperty(shape, "0", { configurable: true, enumerable: false, value: 11, writable: false });
  return shape;
}

interface TestSeam {
  readonly ownKeys?: (value: unknown) => readonly PropertyKey[];
  readonly allocate?: () => unknown;
  readonly copy?: (output: unknown, input: unknown) => void;
}

type TestGlobal = typeof globalThis & { __cestusSecretCommitmentBytesTestSeam: TestSeam | undefined };

function testGlobal(): TestGlobal {
  return globalThis as TestGlobal;
}

function resourceSeam(calls: { ownKeys: number; allocation: number; copy: number }): TestSeam {
  return {
    ownKeys(value) {
      calls.ownKeys += 1;
      return Reflect.ownKeys(value as object);
    },
    allocate() {
      calls.allocation += 1;
      return new Uint8Array(0);
    },
    copy() {
      calls.copy += 1;
    }
  };
}

function allocationSeam(
  name: (typeof constructorCaseNames)[number],
  input: Uint8Array,
  calls: { allocation: number; proxyTraps: number }
): TestSeam {
  return {
    allocate() {
      calls.allocation += 1;
      switch (name) {
        case "throws":
          throw new Error("test-owned allocation failure");
        case "wrong length":
          return new Uint8Array(Math.max(0, input.length - 1));
        case "wrong prototype":
          return Object.create(Uint8Array.prototype);
        case "input object alias":
          return input;
        case "input backing alias":
          return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        case "fixed SharedArrayBuffer":
          return new Uint8Array(new SharedArrayBuffer(input.length));
        case "resizable ArrayBuffer":
          return resizableArrayBufferView(false) ?? Object.create(Uint8Array.prototype);
        case "growable SharedArrayBuffer":
          return growableSharedArrayBufferView(false) ?? Object.create(Uint8Array.prototype);
        case "detached backing":
          return detachedView();
        case "extra own string key": {
          const output = new Uint8Array(input.length) as Uint8Array & { extra?: true };
          output.extra = true;
          return output;
        }
        case "extra symbol key": {
          const output = new Uint8Array(input.length);
          Object.defineProperty(output, Symbol("extra"), { enumerable: true, value: true });
          return output;
        }
        case "transparent output Proxy":
          return new Proxy(new Uint8Array(input.length), {
            get(target, property, receiver) {
              calls.proxyTraps += 1;
              return Reflect.get(target, property, receiver);
            },
            getOwnPropertyDescriptor(target, property) {
              calls.proxyTraps += 1;
              return Reflect.getOwnPropertyDescriptor(target, property);
            },
            getPrototypeOf(target) {
              calls.proxyTraps += 1;
              return Reflect.getPrototypeOf(target);
            },
            ownKeys(target) {
              calls.proxyTraps += 1;
              return Reflect.ownKeys(target);
            }
          });
        case "throwing output Proxy":
          return new Proxy(new Uint8Array(input.length), {
            get() {
              calls.proxyTraps += 1;
              throw new Error("output Proxy trap must not run");
            },
            getOwnPropertyDescriptor() {
              calls.proxyTraps += 1;
              throw new Error("output Proxy trap must not run");
            },
            getPrototypeOf() {
              calls.proxyTraps += 1;
              throw new Error("output Proxy trap must not run");
            },
            ownKeys() {
              calls.proxyTraps += 1;
              throw new Error("output Proxy trap must not run");
            }
          });
        case "exact canonical output control":
          return new Uint8Array(input.length);
      }
    }
  };
}

function copySeam(name: (typeof copyCaseNames)[number], calls: { allocation: number; copy: number }): TestSeam {
  return {
    allocate() {
      calls.allocation += 1;
      return new Uint8Array(6);
    },
    copy(output, input) {
      calls.copy += 1;
      if (!(output instanceof Uint8Array) || !(input instanceof Uint8Array)) {
        throw new Error("checkpoint seam received malformed copy values");
      }
      switch (name) {
        case "throws":
          throw new Error("test-owned copy failure");
        case "no-op":
          return;
        case "prefix-only partial":
          output.set(input.subarray(0, 3));
          return;
        case "suffix-only partial":
          output.set(input.subarray(3), 3);
          return;
        case "one wrong byte":
          output.set(input);
          output[2] = 0;
          return;
        case "all wrong bytes":
          output.fill(0);
          return;
        case "exact copy control":
          output.set(input);
      }
    }
  };
}

function tryNoncanonicalOutput(): Uint8Array | undefined {
  const output = new Uint8Array([11]);
  try {
    Object.defineProperty(output, "0", { configurable: false, enumerable: false, value: 11, writable: false });
    const descriptor = Object.getOwnPropertyDescriptor(output, "0");
    return descriptor?.configurable === false || descriptor?.enumerable === false || descriptor?.writable === false
      ? output
      : undefined;
  } catch {
    return undefined;
  }
}

async function withFreshModule<Result>(
  seam: TestSeam,
  testGateEnabled: boolean,
  run: (module: typeof import("../src/secret-commitment-bytes.js")) => Promise<Result> | Result
): Promise<Result> {
  const global = testGlobal();
  const previousSeam = Object.getOwnPropertyDescriptor(global, "__cestusSecretCommitmentBytesTestSeam");
  const previousVitest = Object.getOwnPropertyDescriptor(process.env, "VITEST");
  Object.defineProperty(global, "__cestusSecretCommitmentBytesTestSeam", {
    configurable: true,
    enumerable: false,
    value: seam,
    writable: true
  });
  process.env.VITEST = testGateEnabled ? "true" : "false";
  vi.resetModules();
  try {
    return await run(await import("../src/secret-commitment-bytes.js"));
  } finally {
    if (previousSeam === undefined) {
      Reflect.deleteProperty(global, "__cestusSecretCommitmentBytesTestSeam");
      if (Object.hasOwn(global, "__cestusSecretCommitmentBytesTestSeam")) {
        throw new Error("test seam property was not removed");
      }
    } else {
      Object.defineProperty(global, "__cestusSecretCommitmentBytesTestSeam", previousSeam);
    }
    if (previousVitest === undefined) {
      delete process.env.VITEST;
      if (Object.hasOwn(process.env, "VITEST")) {
        throw new Error("VITEST environment state was not removed");
      }
    } else {
      Object.defineProperty(process.env, "VITEST", previousVitest);
    }
    vi.resetModules();
  }
}

describe("secret commitment canonical bytes red checkpoint", () => {
  test("observes the actual module namespace and keeps byte helpers out of the barrel", async () => {
    const module = await import("../src/secret-commitment-bytes.js");
    const barrel = await import("../src/index.js");

    expect(Object.keys(module).sort()).toEqual([
      "snapshotCanonicalSecretCommitmentBytes",
      "trustedCanonicalSecretCommitmentByteLength"
    ]);
    expect("snapshotCanonicalSecretCommitmentBytes" in barrel).toBe(false);
    expect("trustedCanonicalSecretCommitmentByteLength" in barrel).toBe(false);
    expect("SecretCommitmentByteLimit" in barrel).toBe(false);
  });

  test("asserts the complete named checkpoint inventory", () => {
    expect(constructorCaseNames).toHaveLength(14);
    expect(copyCaseNames).toHaveLength(7);
    expect(inputShapeCaseNames).toHaveLength(18);
    expect(resourceOrderingCaseNames).toHaveLength(7);
    expect(backingCaseNames).toHaveLength(5);
    expect(successCaseNames).toHaveLength(10);
    expect(new Set(constructorCaseNames).size).toBe(constructorCaseNames.length);
    expect(new Set(copyCaseNames).size).toBe(copyCaseNames.length);
    expect(new Set(inputShapeCaseNames).size).toBe(inputShapeCaseNames.length);
  });

  test.each([0, 1, 31, 32])("accepts canonical length %i under the payload rule", (length) => {
    const input = bytes(length);
    expect(trustedCanonicalSecretCommitmentByteLength(input, PAYLOAD_LIMIT)).toBe(length);
    expectCanonicalSnapshot(snapshotCanonicalSecretCommitmentBytes(input, PAYLOAD_LIMIT), input);
  });

  test.each([0, 1, 31, 33])("rejects length %i under the exact-32 rule before resources", async (length) => {
    const resourceCalls = { ownKeys: 0, allocation: 0, copy: 0 };
    await withFreshModule(resourceSeam(resourceCalls), true, (module) => {
      const input = bytes(length);
      expect(module.trustedCanonicalSecretCommitmentByteLength(input, FIXED_LIMIT)).toBeUndefined();
      expect(module.snapshotCanonicalSecretCommitmentBytes(input, FIXED_LIMIT)).toBeUndefined();
      expect(resourceCalls).toEqual({ ownKeys: 0, allocation: 0, copy: 0 });
    });
  });

  test("accepts exact-32 inputs and reaches every accepted-resource seam", async () => {
    const exact = bytes(32);
    const resourceCalls = { ownKeys: 0, allocation: 0, copy: 0 };
    await withFreshModule(resourceSeam(resourceCalls), true, (module) => {
      const length = module.trustedCanonicalSecretCommitmentByteLength(exact, FIXED_LIMIT);
      const result = module.snapshotCanonicalSecretCommitmentBytes(exact, FIXED_LIMIT);
      expect(resourceCalls.ownKeys).toBeGreaterThan(0);
      expect(resourceCalls.allocation).toBeGreaterThan(0);
      expect(resourceCalls.copy).toBeGreaterThan(0);
      expect(length).toBe(32);
      expectCanonicalSnapshot(result, exact);
    });
  });

  test.each([
    ["payload", PAYLOAD_LIMIT],
    ["frame", FRAME_LIMIT]
  ] as const)("accepts %s minus-one and equal inclusive limits", (_name, limit) => {
    const minusOne = bytes(limit - 1);
    const equal = bytes(limit);
    expect(trustedCanonicalSecretCommitmentByteLength(minusOne, limit)).toBe(limit - 1);
    expect(trustedCanonicalSecretCommitmentByteLength(equal, limit)).toBe(limit);
    expectCanonicalSnapshot(snapshotCanonicalSecretCommitmentBytes(equal, limit), equal);
  });

  test.each([
    ["payload", PAYLOAD_LIMIT],
    ["frame", FRAME_LIMIT]
  ] as const)("rejects %s plus-one before reflection, allocation, and copy", async (_name, limit) => {
    const plusOne = bytes(limit + 1);
    const resourceCalls = { ownKeys: 0, allocation: 0, copy: 0 };
    await withFreshModule(resourceSeam(resourceCalls), true, (module) => {
      expect(module.trustedCanonicalSecretCommitmentByteLength(plusOne, limit)).toBeUndefined();
      expect(module.snapshotCanonicalSecretCommitmentBytes(plusOne, limit)).toBeUndefined();
      expect(resourceCalls).toEqual({ ownKeys: 0, allocation: 0, copy: 0 });
    });
  });

  test.each([
    ["payload", PAYLOAD_LIMIT],
    ["frame", FRAME_LIMIT]
  ] as const)("reaches reflection, allocation, and copy for accepted %s equal limits", async (_name, limit) => {
    const resourceCalls = { ownKeys: 0, allocation: 0, copy: 0 };
    const input = bytes(limit);
    await withFreshModule(resourceSeam(resourceCalls), true, (module) => {
      const result = module.snapshotCanonicalSecretCommitmentBytes(input, limit);
      expect(resourceCalls.ownKeys).toBeGreaterThan(0);
      expect(resourceCalls.allocation).toBeGreaterThan(0);
      expect(resourceCalls.copy).toBeGreaterThan(0);
      expectCanonicalSnapshot(result, input);
    });
  });

  test("keeps a installed seam inactive when its explicit test gate is disabled", async () => {
    const resourceCalls = { ownKeys: 0, allocation: 0, copy: 0 };
    const input = bytes(32);
    await withFreshModule(resourceSeam(resourceCalls), false, (module) => {
      const result = module.snapshotCanonicalSecretCommitmentBytes(input, FIXED_LIMIT);
      expect(resourceCalls).toEqual({ ownKeys: 0, allocation: 0, copy: 0 });
      expectCanonicalSnapshot(result, input);
    });
  });

  test("count-asserts available backing forms and rejects every supported noncanonical backing", () => {
    const cases: readonly [string, Uint8Array | undefined][] = [
      ["fixed SharedArrayBuffer", new Uint8Array(new SharedArrayBuffer(4))],
      ["resizable ArrayBuffer fixed-length view", resizableArrayBufferView(false)],
      ["resizable ArrayBuffer length-tracking view", resizableArrayBufferView(true)],
      ["growable SharedArrayBuffer fixed-length view", growableSharedArrayBufferView(false)],
      ["growable SharedArrayBuffer length-tracking view", growableSharedArrayBufferView(true)]
    ];
    expect(cases.map(([name]) => name)).toEqual(backingCaseNames);
    const supported = cases.filter((entry): entry is [string, Uint8Array] => entry[1] !== undefined);
    expect(supported.map(([name]) => name)).toContain("fixed SharedArrayBuffer");
    expect(new Set(supported.map(([name]) => name)).size).toBe(supported.length);
    for (const [_name, input] of supported) {
      expect(trustedCanonicalSecretCommitmentByteLength(input, PAYLOAD_LIMIT)).toBeUndefined();
      expect(snapshotCanonicalSecretCommitmentBytes(input, PAYLOAD_LIMIT)).toBeUndefined();
    }
  });

  test("rejects the complete hostile input-shape matrix without Proxy traps or accessors", () => {
    const base = bytes(4);
    const transparentCalls = { count: 0 };
    const throwingCalls = { count: 0 };
    const lengthAccessorCalls = { count: 0 };
    const bufferAccessorCalls = { count: 0 };
    class BytesSubclass extends Uint8Array {}
    const alteredPrototype = bytes(4);
    Object.setPrototypeOf(alteredPrototype, {});
    const lengthAccessor = bytes(4);
    Object.defineProperty(lengthAccessor, "length", { get() { lengthAccessorCalls.count += 1; throw new Error("length accessor"); } });
    const bufferAccessor = bytes(4);
    Object.defineProperty(bufferAccessor, "buffer", { get() { bufferAccessorCalls.count += 1; throw new Error("buffer accessor"); } });
    const extraString = bytes(4) as Uint8Array & { unexpected?: string };
    extraString.unexpected = "unexpected";
    const extraSymbol = bytes(4);
    Object.defineProperty(extraSymbol, Symbol("unexpected"), { enumerable: true, value: true });
    const shadowed = bytes(4);
    Object.defineProperty(shadowed, "constructor", { value: Uint8Array });
    const shared = new Uint8Array(new SharedArrayBuffer(4));
    const crossRealm = vm.runInNewContext("new Uint8Array([1, 2, 3, 4])") as Uint8Array;
    const cases: readonly [string, Uint8Array | undefined][] = [
      ["Buffer", Buffer.from(base)], ["Uint8Array subclass", new BytesSubclass(base)], ["altered prototype", alteredPrototype],
      ["cross-realm prototype", crossRealm], ["detached view", detachedView()],
      ["transparent Proxy", transparentProxy(bytes(4), transparentCalls)], ["throwing Proxy", throwingProxy(bytes(4), throwingCalls)],
      ["length accessor", lengthAccessor], ["buffer accessor", bufferAccessor], ["extra string key", extraString],
      ["extra symbol key", extraSymbol], ["shadowed property", shadowed], ["noncanonical descriptor", noncanonicalDescriptorShape()],
      ["fixed SharedArrayBuffer", shared], ["resizable ArrayBuffer fixed-length view", resizableArrayBufferView(false)],
      ["resizable ArrayBuffer length-tracking view", resizableArrayBufferView(true)],
      ["growable SharedArrayBuffer fixed-length view", growableSharedArrayBufferView(false)],
      ["growable SharedArrayBuffer length-tracking view", growableSharedArrayBufferView(true)]
    ];

    expect(cases.map(([name]) => name)).toEqual(inputShapeCaseNames);
    for (const [_name, input] of cases) {
      if (input !== undefined) {
        expect(trustedCanonicalSecretCommitmentByteLength(input, PAYLOAD_LIMIT)).toBeUndefined();
        expect(snapshotCanonicalSecretCommitmentBytes(input, PAYLOAD_LIMIT)).toBeUndefined();
      }
    }
    expect(transparentCalls.count).toBe(0);
    expect(throwingCalls.count).toBe(0);
    expect(lengthAccessorCalls.count).toBe(0);
    expect(bufferAccessorCalls.count).toBe(0);
  });

  test.each(constructorCaseNames)("fresh allocation checkpoint case: %s", async (name) => {
    const input = bytes(32);
    const calls = { allocation: 0, proxyTraps: 0 };
    await withFreshModule(allocationSeam(name, input, calls), true, (module) => {
      const result = module.snapshotCanonicalSecretCommitmentBytes(input, FIXED_LIMIT);
      expect(calls.allocation).toBe(1);
      if (name === "exact canonical output control") {
        expectCanonicalSnapshot(result, input);
      } else {
        expect(result).toBeUndefined();
      }
    });
    expect(calls.proxyTraps).toBe(0);
  });

  test("records the supported-runtime noncanonical output descriptor allocation case", async () => {
    const malformedOutput = tryNoncanonicalOutput();
    if (malformedOutput === undefined) {
      expect(malformedOutput).toBeUndefined();
      return;
    }
    const calls = { allocation: 0 };
    await withFreshModule({
      allocate() {
        calls.allocation += 1;
        return malformedOutput;
      }
    }, true, (module) => {
      expect(module.snapshotCanonicalSecretCommitmentBytes(bytes(32), FIXED_LIMIT)).toBeUndefined();
      expect(calls.allocation).toBe(1);
    });
  });

  test.each(copyCaseNames)("fresh copy checkpoint case: %s", async (name) => {
    const calls = { allocation: 0, copy: 0 };
    await withFreshModule(copySeam(name, calls), true, (module) => {
      const input = Uint8Array.of(11, 48, 93, 157, 201, 254);
      const result = module.snapshotCanonicalSecretCommitmentBytes(input, PAYLOAD_LIMIT);
      expect(calls.allocation).toBe(1);
      expect(calls.copy).toBe(1);
      if (name === "exact copy control") {
        expectCanonicalSnapshot(result, input);
      } else {
        expect(result).toBeUndefined();
      }
    });
  });

  test("requires an exact fresh snapshot with independent mutations and canonical postconditions", () => {
    const input = Uint8Array.of(11, 48, 93, 157, 201, 254);
    const output = snapshotCanonicalSecretCommitmentBytes(input, PAYLOAD_LIMIT);
    const asserted = new Set(expectCanonicalSnapshot(output, input));
    input[0] = 0;
    expect(output?.[0]).toBe(11);
    asserted.add("caller mutation isolation");
    (output as Uint8Array)[1] = 0;
    expect(input[1]).toBe(48);
    asserted.add("output mutation isolation");
    expect([...asserted].sort()).toEqual([...successCaseNames].sort());
  });
});
