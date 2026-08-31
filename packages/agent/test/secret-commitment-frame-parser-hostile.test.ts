import { describe, expect, test, vi } from "vitest";
import { type ParsedSecretCommitmentFrame } from "../src/secret-commitment-contract.js";
import {
  assertFreshParserBuildersRemainUsable, frameBytes, normalFreshByteSnapshot, parserAlterTag, parserConcat,
  parserEntryLiteralHex, parserExpectedResult, parserLayout, parserLiteralInventories, parserManifestLiteralHex,
  parserObservationLiteralHex, parserReplaceValue, sourceFrameFixture, withFreshParserAmbientSeam, withFreshParserByteSeam,
  type ParserFieldSpan, type ParserLiteralInventory
} from "./secret-commitment-frame-parser.fixtures.js";

describe("secret commitment parser hostile intrinsic behavior", () => {

  test("a fresh parser module fails closed when its complete-frame snapshot fails while builders stay usable", async () => {
    const observationHex = (parserLiteralInventories[0] as ParserLiteralInventory).literalHex;
    const candidate = frameBytes(observationHex);
    const originalLiteral = frameBytes(observationHex);
    let snapshotCalls = 0;
    vi.resetModules();
    vi.doMock("../src/secret-commitment-bytes.js", () => ({
      trustedCanonicalSecretCommitmentByteLength(value: unknown) {
        return value instanceof Uint8Array ? value.length : undefined;
      },
      snapshotCanonicalSecretCommitmentBytes(value: unknown) {
        if (value === candidate) {
          snapshotCalls += 1;
          return undefined;
        }
        return value instanceof Uint8Array ? Uint8Array.from(value) : undefined;
      }
    }));
    try {
      const fresh = await import("../src/secret-commitment-contract.js");
      expect(fresh.parseSecretCommitmentFrame(candidate)).toBeUndefined();
      expect(snapshotCalls).toBe(1);
      expect(fresh.buildSourceObservationFrame(sourceFrameFixture())).toEqual(originalLiteral);
    } finally {
      vi.doUnmock("../src/secret-commitment-bytes.js");
      vi.resetModules();
    }
  });

  test("fresh parser codec capture and construction failures do not disable builders", async () => {
    await withFreshParserAmbientSeam(() => {
      const original = globalThis.TextDecoder;
      class FailingTextDecoder {
        get encoding(): string { return "utf-8"; }
        get fatal(): boolean { return true; }
        get ignoreBOM(): boolean { return true; }
        constructor() { throw new Error("decoder construction seam"); }
        decode(): string { return ""; }
      }
      globalThis.TextDecoder = FailingTextDecoder as unknown as typeof TextDecoder;
      return { restore() { globalThis.TextDecoder = original; } };
    }, (fresh) => {
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeUndefined();
      assertFreshParserBuildersRemainUsable(fresh);
    });

    await withFreshParserAmbientSeam(() => {
      const original = globalThis.TextEncoder;
      const originalEncode = original.prototype.encode;
      const originalEncodeInto = original.prototype.encodeInto;
      let constructions = 0;
      class FirstConstructionFails {
        constructor() {
          constructions += 1;
          if (constructions === 1) {
            throw new Error("encoder construction seam");
          }
          return new original();
        }
        encode(source?: string): Uint8Array { return originalEncode.call(new original(), source); }
        encodeInto(source: string, destination: Uint8Array): TextEncoderEncodeIntoResult {
          return originalEncodeInto.call(new original(), source, destination);
        }
      }
      globalThis.TextEncoder = FirstConstructionFails as unknown as typeof TextEncoder;
      return { restore() { globalThis.TextEncoder = original; } };
    }, (fresh) => {
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeUndefined();
      assertFreshParserBuildersRemainUsable(fresh);
    });

    await withFreshParserAmbientSeam(() => {
      const original = TextDecoder.prototype.decode;
      TextDecoder.prototype.decode = function malformedDecode(): string { return "not-the-probe"; };
      return { restore() { TextDecoder.prototype.decode = original; } };
    }, (fresh) => {
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeUndefined();
      assertFreshParserBuildersRemainUsable(fresh);
    });

    await withFreshParserAmbientSeam(() => {
      const original = TextEncoder.prototype.encode;
      TextEncoder.prototype.encode = function malformedEncode(): Uint8Array<ArrayBuffer> { return Uint8Array.of(0); };
      return { restore() { TextEncoder.prototype.encode = original; } };
    }, (fresh) => {
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeUndefined();
      assertFreshParserBuildersRemainUsable(fresh);
    });
  });

  test("fresh malformed freeze and WeakSet captures fail closed while builders remain usable", async () => {
    await withFreshParserAmbientSeam(() => {
      const original = Object.freeze;
      Object.freeze = ((value: object) => value) as typeof Object.freeze;
      return { restore() { Object.freeze = original; } };
    }, (fresh) => {
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserManifestLiteralHex))).toBeUndefined();
      assertFreshParserBuildersRemainUsable(fresh);
    });

    await withFreshParserAmbientSeam(() => {
      const original = globalThis.WeakSet;
      class ThrowingWeakSet { constructor() { throw new Error("WeakSet construction seam"); } }
      globalThis.WeakSet = ThrowingWeakSet as unknown as WeakSetConstructor;
      return { restore() { globalThis.WeakSet = original; } };
    }, (fresh) => {
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserManifestLiteralHex))).toBeUndefined();
      assertFreshParserBuildersRemainUsable(fresh);
    });

    await withFreshParserAmbientSeam(() => {
      const original = WeakSet.prototype.has;
      WeakSet.prototype.has = function malformedHas(): boolean { return false; };
      return { restore() { WeakSet.prototype.has = original; } };
    }, (fresh) => {
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserManifestLiteralHex))).toBeUndefined();
      assertFreshParserBuildersRemainUsable(fresh);
    });

    await withFreshParserAmbientSeam(() => {
      const original = WeakSet.prototype.add;
      WeakSet.prototype.add = function malformedAdd(): WeakSet<object> { return new WeakSet<object>(); };
      return { restore() { WeakSet.prototype.add = original; } };
    }, (fresh) => {
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserManifestLiteralHex))).toBeUndefined();
      assertFreshParserBuildersRemainUsable(fresh);
    });
  });

  test("captured codec operations and exact re-encoding fail closed at parse time", async () => {
    await withFreshParserAmbientSeam(() => {
      const original = TextDecoder.prototype.decode;
      let active = false;
      TextDecoder.prototype.decode = function decodeSeam(input?: AllowSharedBufferSource, options?: TextDecodeOptions): string {
        if (active) { throw new Error("decoder operation seam"); }
        return original.call(this, input, options);
      };
      return { activate() { active = true; }, restore() { TextDecoder.prototype.decode = original; } };
    }, (fresh, activate) => {
      assertFreshParserBuildersRemainUsable(fresh);
      activate();
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeUndefined();
    });

    await withFreshParserAmbientSeam(() => {
      const original = TextEncoder.prototype.encode;
      let active = false;
      TextEncoder.prototype.encode = function encodeSeam(source?: string): Uint8Array<ArrayBuffer> {
        if (active) { throw new Error("encoder operation seam"); }
        return original.call(this, source);
      };
      return { activate() { active = true; }, restore() { TextEncoder.prototype.encode = original; } };
    }, (fresh, activate) => {
      assertFreshParserBuildersRemainUsable(fresh);
      activate();
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeUndefined();
    });

    await withFreshParserAmbientSeam(() => {
      const original = TextEncoder.prototype.encode;
      let active = false;
      TextEncoder.prototype.encode = function mismatchEncode(source?: string): Uint8Array<ArrayBuffer> {
        const encoded = original.call(this, source);
        if (active && encoded.length > 0) {
          const mismatch = Uint8Array.from(encoded);
          mismatch[0] = (mismatch[0] ?? 0) ^ 1;
          return mismatch;
        }
        return encoded;
      };
      return { activate() { active = true; }, restore() { TextEncoder.prototype.encode = original; } };
    }, (fresh, activate) => {
      activate();
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeUndefined();
    });
  });

  test("captured decoders cannot mutate the private complete-frame snapshot", async () => {
    await withFreshParserAmbientSeam(() => {
      const original = TextDecoder.prototype.decode;
      let active = false;
      TextDecoder.prototype.decode = function mutatingDecode(
        input?: AllowSharedBufferSource,
        options?: TextDecodeOptions
      ): string {
        if (active && input instanceof Uint8Array) {
          const backing = new Uint8Array(input.buffer);
          backing[backing.length - 1] = (backing[backing.length - 1] ?? 0) ^ 0xff;
        }
        return original.call(this, input, options);
      };
      return { activate() { active = true; }, restore() { TextDecoder.prototype.decode = original; } };
    }, (fresh, activate) => {
      activate();
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserManifestLiteralHex))).toBeUndefined();
    });
  });

  test("captured subarray hooks cannot rewrite parsed binary fields", async () => {
    let activeCalls = 0;
    await withFreshParserAmbientSeam(() => {
      const original = Uint8Array.prototype.subarray;
      let active = false;
      Uint8Array.prototype.subarray = function mutatingSubarray(begin?: number, end?: number): Uint8Array {
        if (active && activeCalls === 0 && begin !== undefined && begin < this.length) {
          activeCalls += 1;
          this[begin] = (this[begin] ?? 0) ^ 0xff;
        }
        return original.call(this, begin, end);
      };
      return {
        activate() { active = true; },
        restore() { Uint8Array.prototype.subarray = original; }
      };
    }, (fresh, activate) => {
      const expected = parserExpectedResult(parserLiteralInventories[1] as ParserLiteralInventory);
      activate();
      const parsed = fresh.parseSecretCommitmentFrame(frameBytes(parserManifestLiteralHex));
      expect(parsed).toEqual(expected);
      expect(activeCalls).toBe(0);
    });
  });

  test("numeric Array prototype accessors cannot observe parser scratch inventories", async () => {
    vi.resetModules();
    const fresh = await import("../src/secret-commitment-contract.js");
    const originalZero = Object.getOwnPropertyDescriptor(Array.prototype, "0");
    const originalFour = Object.getOwnPropertyDescriptor(Array.prototype, "4");
    let getterCalls = 0;
    let setterCalls = 0;
    let getterResult: ParsedSecretCommitmentFrame | undefined;
    let setterResult: ParsedSecretCommitmentFrame | undefined;
    try {
      Object.defineProperty(Array.prototype, "0", {
        configurable: true,
        get() { getterCalls += 1; return undefined; }
      });
      getterResult = fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex));
      if (originalZero === undefined) {
        delete (Array.prototype as unknown as Record<string, unknown>)["0"];
      } else {
        Object.defineProperty(Array.prototype, "0", originalZero);
      }

      Object.defineProperty(Array.prototype, "4", {
        configurable: true,
        set(value: unknown) {
          setterCalls += 1;
          Object.defineProperty(this, "4", {
            configurable: true,
            enumerable: true,
            value,
            writable: true
          });
        }
      });
      setterResult = fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex));
    } finally {
      if (originalZero === undefined) {
        delete (Array.prototype as unknown as Record<string, unknown>)["0"];
      } else {
        Object.defineProperty(Array.prototype, "0", originalZero);
      }
      if (originalFour === undefined) {
        delete (Array.prototype as unknown as Record<string, unknown>)["4"];
      } else {
        Object.defineProperty(Array.prototype, "4", originalFour);
      }
      vi.resetModules();
    }
    expect(getterResult).toBeDefined();
    expect(setterResult).toBeDefined();
    expect(getterCalls).toBe(0);
    expect(setterCalls).toBe(0);
  });

  test("captured freeze, reflection, and WeakSet operation tampering cannot publish a result", async () => {
    await withFreshParserAmbientSeam(() => {
      const original = Object.freeze;
      let active = false;
      Object.freeze = ((value: object) => {
        if (active && "profile" in value) {
          const target = value as Record<string, unknown>;
          target.profile = "tampered-profile";
          if ("nonce" in target) {
            target.nonce = Uint8Array.of(0xff);
          }
        }
        return original(value);
      }) as typeof Object.freeze;
      return { activate() { active = true; }, restore() { Object.freeze = original; } };
    }, (fresh, activate) => {
      activate();
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeUndefined();
    });

    await withFreshParserAmbientSeam(() => {
      const original = Object.getOwnPropertyDescriptor;
      let active = false;
      Object.getOwnPropertyDescriptor = ((value: object, key: PropertyKey) => {
        const descriptor = original(value, key);
        return active && key === "profile" && descriptor !== undefined && "value" in descriptor
          ? { ...descriptor, value: "reflection-tamper" }
          : descriptor;
      }) as typeof Object.getOwnPropertyDescriptor;
      return { activate() { active = true; }, restore() { Object.getOwnPropertyDescriptor = original; } };
    }, (fresh, activate) => {
      activate();
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserManifestLiteralHex))).toBeUndefined();
    });

    await withFreshParserAmbientSeam(() => {
      const original = WeakSet.prototype.has;
      let active = false;
      WeakSet.prototype.has = function hasSeam(value: object): boolean {
        return active ? false : original.call(this, value);
      };
      return { activate() { active = true; }, restore() { WeakSet.prototype.has = original; } };
    }, (fresh, activate) => {
      activate();
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserManifestLiteralHex))).toBeUndefined();
    });

    await withFreshParserAmbientSeam(() => {
      const original = WeakSet.prototype.add;
      let active = false;
      WeakSet.prototype.add = function addSeam(value: object): WeakSet<object> {
        return active ? this : original.call(this, value);
      };
      return { activate() { active = true; }, restore() { WeakSet.prototype.add = original; } };
    }, (fresh, activate) => {
      activate();
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserManifestLiteralHex))).toBeUndefined();
    });

    await withFreshParserAmbientSeam(() => {
      const original = WeakSet.prototype.add;
      let active = false;
      let activeCalls = 0;
      WeakSet.prototype.add = function partialAddSeam(value: object): WeakSet<object> {
        if (!active) {
          return original.call(this, value);
        }
        activeCalls += 1;
        return activeCalls === 4 ? this : original.call(this, value);
      };
      return { activate() { active = true; }, restore() { WeakSet.prototype.add = original; } };
    }, (fresh, activate) => {
      activate();
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeUndefined();
    });
  });

  test("a conforming pre-evaluation WeakSet operation cannot mutate publishable bytes after integrity validation", async () => {
    await withFreshParserAmbientSeam(() => {
      const original = WeakSet.prototype.add;
      WeakSet.prototype.add = function mutatingAdd(value: object): WeakSet<object> {
        const result = original.call(this, value);
        if (value instanceof Uint8Array && value.length === 32) {
          value[0] = (value[0] ?? 0) ^ 0xff;
        }
        return result;
      };
      return { restore() { WeakSet.prototype.add = original; } };
    }, (fresh) => {
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeUndefined();
      assertFreshParserBuildersRemainUsable(fresh);
    });
  });

  test("a conforming pre-evaluation WeakSet.has cannot mutate publishable bytes after integrity validation", async () => {
    await withFreshParserAmbientSeam(() => {
      const original = WeakSet.prototype.has;
      WeakSet.prototype.has = function mutatingHas(value: object): boolean {
        const result = original.call(this, value);
        if (value instanceof Uint8Array && value.length === 32) {
          value[0] = (value[0] ?? 0) ^ 0xff;
        }
        return result;
      };
      return { restore() { WeakSet.prototype.has = original; } };
    }, (fresh) => {
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeUndefined();
      assertFreshParserBuildersRemainUsable(fresh);
    });
  });

  test("returned allocation and copy failures, corruption, aliasing, and reuse fail closed", async () => {
    type ByteFailureMode = "occurrence" | "throw" | "corrupt" | "malformed" | "shared" | "reuse" | "published";
    let mode: ByteFailureMode = "occurrence";
    let returnedCalls = 0;
    let failedOccurrence = 1;
    let shared = new ArrayBuffer(96);
    let sharedOffset = 0;
    let reused: Uint8Array | undefined;
    let publishedNonce: Uint8Array | undefined;
    await withFreshParserByteSeam((value, limit) => {
      if (limit === 8_454_144) {
        return normalFreshByteSnapshot(value, limit);
      }
      returnedCalls += 1;
      if (mode === "occurrence" && returnedCalls === failedOccurrence) {
        if (failedOccurrence % 2 === 0) {
          throw new Error("returned snapshot occurrence seam");
        }
        return undefined;
      }
      if (mode === "throw") {
        throw new Error("returned allocation seam");
      }
      if (mode === "malformed") {
        return { length: value instanceof Uint8Array ? value.length : 0 } as unknown as Uint8Array;
      }
      if (!(value instanceof Uint8Array)) {
        return undefined;
      }
      if (mode === "corrupt") {
        const copy = Uint8Array.from(value);
        if (copy.length > 0) {
          copy[copy.length - 1] = (copy[copy.length - 1] ?? 0) ^ 1;
        }
        return copy;
      }
      if (mode === "shared") {
        const copy = new Uint8Array(shared, sharedOffset, value.length);
        sharedOffset += value.length;
        copy.set(value);
        return copy;
      }
      if (mode === "reuse" && limit === 32) {
        reused ??= new Uint8Array(value.length);
        reused.set(value);
        return reused;
      }
      if (mode === "published" && limit === 32) {
        publishedNonce ??= Uint8Array.from(value);
        return publishedNonce;
      }
      return Uint8Array.from(value);
    }, (fresh) => {
      for (const inventory of parserLiteralInventories) {
        const returnedFieldCount = parserLayout(inventory).filter((span) => span.kind === "fixed" || span.kind === "payload").length;
        for (failedOccurrence = 1; failedOccurrence <= returnedFieldCount; failedOccurrence += 1) {
          mode = "occurrence";
          returnedCalls = 0;
          expect(fresh.parseSecretCommitmentFrame(frameBytes(inventory.literalHex))).toBeUndefined();
          expect(returnedCalls).toBe(failedOccurrence);
        }
      }

      for (const failureMode of ["throw", "corrupt", "malformed"] as const) {
        mode = failureMode;
        returnedCalls = 0;
        expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeUndefined();
      }

      mode = "shared";
      returnedCalls = 0;
      shared = new ArrayBuffer(96);
      sharedOffset = 0;
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserManifestLiteralHex))).toBeUndefined();

      mode = "reuse";
      returnedCalls = 0;
      reused = undefined;
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserManifestLiteralHex))).toBeUndefined();

      mode = "published";
      returnedCalls = 0;
      publishedNonce = undefined;
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeDefined();
      expect(fresh.parseSecretCommitmentFrame(frameBytes(parserObservationLiteralHex))).toBeUndefined();
    });
  });

  test("captured backing identity rejects shared allocator views after the live buffer getter is replaced", async () => {
    const shared = new ArrayBuffer(96);
    let offset = 0;
    await withFreshParserByteSeam((value, limit) => {
      if (limit === 8_454_144) {
        return normalFreshByteSnapshot(value, limit);
      }
      if (!(value instanceof Uint8Array)) {
        return undefined;
      }
      const copy = new Uint8Array(shared, offset, value.length);
      offset += value.length;
      copy.set(value);
      return copy;
    }, (fresh) => {
      const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
      const descriptor = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer");
      let liveCalls = 0;
      if (descriptor?.get === undefined) {
        throw new Error("runtime lacks the typed-array buffer getter");
      }
      Object.defineProperty(typedArrayPrototype, "buffer", {
        ...descriptor,
        get() { liveCalls += 1; throw new Error("live buffer getter must not run"); }
      });
      let result: ParsedSecretCommitmentFrame | undefined;
      try {
        result = fresh.parseSecretCommitmentFrame(frameBytes(parserManifestLiteralHex));
      } finally {
        Object.defineProperty(typedArrayPrototype, "buffer", descriptor);
      }
      expect(result).toBeUndefined();
      expect(liveCalls).toBe(0);
    });
  });

  test("post-evaluation replacement of live parser operations receives zero calls", async () => {
    vi.resetModules();
    const fresh = await import("../src/secret-commitment-contract.js");
    const candidate = frameBytes(parserEntryLiteralHex);
    const uint8ArrayPrototype = Uint8Array.prototype;
    const weakSetPrototype = WeakSet.prototype;
    const typedArrayPrototype = Object.getPrototypeOf(uint8ArrayPrototype) as object;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(typedArrayPrototype, "length");
    const bufferDescriptor = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer");
    if (lengthDescriptor?.get === undefined || bufferDescriptor?.get === undefined) {
      throw new Error("runtime lacks typed-array shape getters");
    }
    const originals = {
      uint8Array: globalThis.Uint8Array,
      map: globalThis.Map,
      weakSet: globalThis.WeakSet,
      subarray: uint8ArrayPrototype.subarray,
      arrayEvery: Array.prototype.every,
      arrayIterator: Array.prototype[Symbol.iterator],
      arrayIsArray: Array.isArray,
      safeInteger: Number.isSafeInteger,
      decoderDecode: TextDecoder.prototype.decode,
      encoderEncode: TextEncoder.prototype.encode,
      weakHas: weakSetPrototype.has,
      weakAdd: weakSetPrototype.add,
      freeze: Object.freeze,
      isFrozen: Object.isFrozen,
      getPrototypeOf: Object.getPrototypeOf,
      getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor,
      ownKeys: Reflect.ownKeys,
      apply: Reflect.apply
    };
    let liveCalls = 0;
    function liveFailure(): never {
      liveCalls += 1;
      throw new Error("live parser operation must not run");
    }
    const replacements: readonly (() => () => void)[] = [
      () => {
        Object.defineProperty(typedArrayPrototype, "length", { ...lengthDescriptor, get: liveFailure });
        return () => Object.defineProperty(typedArrayPrototype, "length", lengthDescriptor);
      },
      () => {
        Object.defineProperty(typedArrayPrototype, "buffer", { ...bufferDescriptor, get: liveFailure });
        return () => Object.defineProperty(typedArrayPrototype, "buffer", bufferDescriptor);
      },
      () => { globalThis.Uint8Array = liveFailure as unknown as Uint8ArrayConstructor; return () => { globalThis.Uint8Array = originals.uint8Array; }; },
      () => { globalThis.Map = liveFailure as unknown as MapConstructor; return () => { globalThis.Map = originals.map; }; },
      () => { globalThis.WeakSet = liveFailure as unknown as WeakSetConstructor; return () => { globalThis.WeakSet = originals.weakSet; }; },
      () => { uint8ArrayPrototype.subarray = liveFailure as unknown as typeof Uint8Array.prototype.subarray; return () => { uint8ArrayPrototype.subarray = originals.subarray; }; },
      () => { Array.prototype.every = liveFailure as unknown as typeof Array.prototype.every; return () => { Array.prototype.every = originals.arrayEvery; }; },
      () => { Array.prototype[Symbol.iterator] = liveFailure as unknown as typeof Array.prototype[typeof Symbol.iterator]; return () => { Array.prototype[Symbol.iterator] = originals.arrayIterator; }; },
      () => { Array.isArray = liveFailure as unknown as typeof Array.isArray; return () => { Array.isArray = originals.arrayIsArray; }; },
      () => { Number.isSafeInteger = liveFailure as unknown as typeof Number.isSafeInteger; return () => { Number.isSafeInteger = originals.safeInteger; }; },
      () => { TextDecoder.prototype.decode = liveFailure as unknown as typeof TextDecoder.prototype.decode; return () => { TextDecoder.prototype.decode = originals.decoderDecode; }; },
      () => { TextEncoder.prototype.encode = liveFailure as unknown as typeof TextEncoder.prototype.encode; return () => { TextEncoder.prototype.encode = originals.encoderEncode; }; },
      () => { weakSetPrototype.has = liveFailure as unknown as typeof WeakSet.prototype.has; return () => { weakSetPrototype.has = originals.weakHas; }; },
      () => { weakSetPrototype.add = liveFailure as unknown as typeof WeakSet.prototype.add; return () => { weakSetPrototype.add = originals.weakAdd; }; },
      () => { Object.freeze = liveFailure as unknown as typeof Object.freeze; return () => { Object.freeze = originals.freeze; }; },
      () => { Object.isFrozen = liveFailure as unknown as typeof Object.isFrozen; return () => { Object.isFrozen = originals.isFrozen; }; },
      () => { Object.getPrototypeOf = liveFailure as unknown as typeof Object.getPrototypeOf; return () => { Object.getPrototypeOf = originals.getPrototypeOf; }; },
      () => { Object.getOwnPropertyDescriptor = liveFailure as unknown as typeof Object.getOwnPropertyDescriptor; return () => { Object.getOwnPropertyDescriptor = originals.getOwnPropertyDescriptor; }; },
      () => { Reflect.ownKeys = liveFailure as unknown as typeof Reflect.ownKeys; return () => { Reflect.ownKeys = originals.ownKeys; }; },
      () => { Reflect.apply = liveFailure as unknown as typeof Reflect.apply; return () => { Reflect.apply = originals.apply; }; }
    ];
    for (const install of replacements) {
      const restore = install();
      let result: ParsedSecretCommitmentFrame | undefined;
      let parseError: unknown;
      try {
        result = fresh.parseSecretCommitmentFrame(candidate);
      } catch (error) {
        parseError = error;
      } finally {
        restore();
      }
      expect(parseError).toBeUndefined();
      expect(result).toBeDefined();
    }
    vi.resetModules();
    expect(liveCalls).toBe(0);
  });

  test("structural rejection performs one complete snapshot and zero semantic decode or returned copies", async () => {
    const originalDecode = TextDecoder.prototype.decode;
    const calls = { completeSnapshot: 0, returnedSnapshot: 0, decode: 0 };
    TextDecoder.prototype.decode = function trackedDecode(input?: AllowSharedBufferSource, options?: TextDecodeOptions): string {
      calls.decode += 1;
      return originalDecode.call(this, input, options);
    };
    vi.resetModules();
    vi.doMock("../src/secret-commitment-bytes.js", () => ({
      trustedCanonicalSecretCommitmentByteLength(value: unknown, limit: number) {
        return value instanceof Uint8Array && value.length <= limit ? value.length : undefined;
      },
      snapshotCanonicalSecretCommitmentBytes(value: unknown, limit: number) {
        if (!(value instanceof Uint8Array) || value.length > limit) {
          return undefined;
        }
        if (limit === 8_454_144) {
          calls.completeSnapshot += 1;
        } else {
          calls.returnedSnapshot += 1;
        }
        return Uint8Array.from(value);
      }
    }));
    try {
      const fresh = await import("../src/secret-commitment-contract.js");
      const inventory = parserLiteralInventories[2] as ParserLiteralInventory;
      const literal = frameBytes(inventory.literalHex);
      const spans = parserLayout(inventory, literal);
      const early = Uint8Array.from(literal);
      early[0] = (early[0] ?? 0) ^ 1;
      const middle = parserAlterTag(literal, spans[Math.floor(spans.length / 2)] as ParserFieldSpan);
      const late = parserConcat([literal, Uint8Array.of(0)]);
      calls.completeSnapshot = 0;
      calls.returnedSnapshot = 0;
      calls.decode = 0;
      for (const candidate of [early, middle, late]) {
        expect(fresh.parseSecretCommitmentFrame(candidate)).toBeUndefined();
        expect(calls).toEqual({ completeSnapshot: 1, returnedSnapshot: 0, decode: 0 });
        calls.completeSnapshot = 0;
        calls.returnedSnapshot = 0;
        calls.decode = 0;
      }
    } finally {
      TextDecoder.prototype.decode = originalDecode;
      vi.doUnmock("../src/secret-commitment-bytes.js");
      vi.resetModules();
    }
  });

  test("the maximum complete frame performs one complete snapshot and one returned snapshot per byte field", async () => {
    const inventory = parserLiteralInventories[0] as ParserLiteralInventory;
    const literal = frameBytes(inventory.literalHex);
    const payload = parserLayout(inventory, literal).find((span) => span.kind === "payload") as ParserFieldSpan;
    const withPayload = parserReplaceValue(literal, payload, new Uint8Array(8_388_608));
    const workspace = parserLayout(inventory, withPayload).find((span) => span.name === "workspaceId") as ParserFieldSpan;
    const candidate = parserReplaceValue(withPayload, workspace, new Uint8Array(65_418).fill(0x61));
    expect(candidate.length).toBe(8_454_144);
    const calls = { complete: 0, returned: 0 };
    await withFreshParserByteSeam((value, limit) => {
      if (limit === 8_454_144) {
        calls.complete += 1;
      } else {
        calls.returned += 1;
      }
      return normalFreshByteSnapshot(value, limit);
    }, (fresh) => {
      expect(fresh.parseSecretCommitmentFrame(candidate)).toBeDefined();
      expect(calls).toEqual({ complete: 1, returned: 2 });
    });
  }, 120_000);

});
