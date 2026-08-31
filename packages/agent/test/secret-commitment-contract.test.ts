import { Buffer } from "node:buffer";
import vm from "node:vm";
import { describe, expect, test, vi } from "vitest";
import {
  buildEntryAuthorityFrame,
  buildManifestAuthorityFrame,
  buildSourceObservationFrame,
  normalizeSecretCommitmentPublicRecord,
  type ComputeCommitmentResult,
  type EntryAuthorityCommitmentRecord,
  type ManifestAuthorityCommitmentRecord,
  type SecretCommitmentComputePort,
  type SecretCommitmentProfile,
  type SecretCommitmentPublicRecord,
  type SourceObservationCommitmentRecord,
  type VerifyCommitmentResult,
  type EntryAuthorityFrameInput,
  type ManifestAuthorityFrameInput,
  type SourceObservationFrameInput
} from "../src/secret-commitment-contract.js";

const hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const uppercaseHex = "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF";
const oddHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde";
const shortHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd";
const longHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef00";
const nonHex = "g123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const idValidValues = ["ascii-id", "nul\u0000id", "non-bmp-\u{1F680}", "café", "cafe\u0301"];
const idInvalidValues = ["", "lone-high-\uD800", "lone-low-\uDC00"];
const invalidHexValues = [uppercaseHex, oddHex, shortHex, longHex, nonHex];
const invalidKeyVersions = [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, Number.NaN];
const nonStringRuntimeValues: readonly unknown[] = [undefined, null, 1, false, {}, []];
const nonNumberRuntimeValues: readonly unknown[] = [undefined, null, "1", 1n, {}, []];

function observationFixture(): SourceObservationCommitmentRecord {
  return {
    profile: "cestus.source-observation.v1",
    contractVersion: 1,
    workspaceId: "workspace",
    sourceCollectionId: "collection",
    sourceBoundaryRevision: "revision",
    manifestEntryId: "entry",
    nonceHex: hex,
    hmacHex: hex,
    backendId: "backend",
    keyId: "key",
    keyVersion: 1
  };
}

function manifestFixture(): ManifestAuthorityCommitmentRecord {
  return {
    profile: "source-manifest-authority.v1",
    contractVersion: 1,
    recordClass: "manifest",
    workspaceId: "workspace",
    sourceCollectionId: "collection",
    sourceBoundaryRevision: "revision",
    classificationPolicyHashHex: hex,
    publicManifestIdHex: hex,
    hmacHex: hex,
    backendId: "backend",
    keyId: "key",
    keyVersion: 1
  };
}

function entryFixture(): EntryAuthorityCommitmentRecord {
  return {
    profile: "source-manifest-authority.v1",
    contractVersion: 1,
    recordClass: "entry",
    workspaceId: "workspace",
    sourceCollectionId: "collection",
    sourceBoundaryRevision: "revision",
    classificationPolicyHashHex: hex,
    publicManifestIdHex: hex,
    publicEntryIdHex: hex,
    hmacHex: hex,
    backendId: "backend",
    keyId: "key",
    keyVersion: 1
  };
}

interface RecordInventory {
  readonly name: string;
  readonly fixture: () => SecretCommitmentPublicRecord;
  readonly fields: readonly string[];
  readonly idFields: readonly string[];
  readonly hexFields: readonly string[];
  readonly forbiddenFields: readonly string[];
  readonly replacementProfile: SecretCommitmentProfile;
  readonly replacementRecordClass?: "manifest" | "entry";
  readonly hasAuthorityRecordClass: boolean;
}

const inventories: readonly RecordInventory[] = [
  {
    name: "source observation",
    fixture: observationFixture,
    fields: [
      "profile", "contractVersion", "workspaceId", "sourceCollectionId",
      "sourceBoundaryRevision", "manifestEntryId", "nonceHex", "hmacHex",
      "backendId", "keyId", "keyVersion"
    ],
    idFields: ["workspaceId", "sourceCollectionId", "sourceBoundaryRevision", "manifestEntryId", "backendId", "keyId"],
    hexFields: ["nonceHex", "hmacHex"],
    forbiddenFields: ["recordClass", "classificationPolicyHashHex", "publicManifestIdHex", "publicEntryIdHex", "unexpectedField"],
    replacementProfile: "source-manifest-authority.v1",
    replacementRecordClass: "manifest",
    hasAuthorityRecordClass: false
  },
  {
    name: "manifest authority",
    fixture: manifestFixture,
    fields: [
      "profile", "contractVersion", "recordClass", "workspaceId",
      "sourceCollectionId", "sourceBoundaryRevision", "classificationPolicyHashHex",
      "publicManifestIdHex", "hmacHex", "backendId", "keyId", "keyVersion"
    ],
    idFields: ["workspaceId", "sourceCollectionId", "sourceBoundaryRevision", "backendId", "keyId"],
    hexFields: ["classificationPolicyHashHex", "publicManifestIdHex", "hmacHex"],
    forbiddenFields: ["manifestEntryId", "nonceHex", "publicEntryIdHex", "unexpectedField"],
    replacementProfile: "cestus.source-observation.v1",
    replacementRecordClass: "entry",
    hasAuthorityRecordClass: true
  },
  {
    name: "entry authority",
    fixture: entryFixture,
    fields: [
      "profile", "contractVersion", "recordClass", "workspaceId",
      "sourceCollectionId", "sourceBoundaryRevision", "classificationPolicyHashHex",
      "publicManifestIdHex", "publicEntryIdHex", "hmacHex", "backendId", "keyId",
      "keyVersion"
    ],
    idFields: ["workspaceId", "sourceCollectionId", "sourceBoundaryRevision", "backendId", "keyId"],
    hexFields: ["classificationPolicyHashHex", "publicManifestIdHex", "publicEntryIdHex", "hmacHex"],
    forbiddenFields: ["manifestEntryId", "nonceHex", "unexpectedField"],
    replacementProfile: "cestus.source-observation.v1",
    replacementRecordClass: "manifest",
    hasAuthorityRecordClass: true
  }
];

function withoutOwnField(record: object, field: string): object {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== field));
}

function withDataField(record: object, field: string, value: unknown): object {
  const copy = Object.assign({}, record);
  Object.defineProperty(copy, field, { configurable: true, enumerable: true, value, writable: true });
  return copy;
}

function withNonEnumerableField(record: object, field: string): object {
  const descriptor = Object.getOwnPropertyDescriptor(record, field);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new Error(`fixture field ${field} is not an own data property`);
  }
  const copy = Object.assign({}, record);
  Object.defineProperty(copy, field, { configurable: true, enumerable: false, value: descriptor.value, writable: true });
  return copy;
}

function withAccessorField(record: object, field: string, counter: { calls: number }): object {
  const copy = Object.assign({}, record);
  Object.defineProperty(copy, field, {
    configurable: true,
    enumerable: true,
    get() {
      counter.calls += 1;
      throw new Error("normalizer must not invoke accessors");
    }
  });
  return copy;
}

function withInheritedField(record: object, field: string): object {
  const descriptor = Object.getOwnPropertyDescriptor(record, field);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new Error(`fixture field ${field} is not an own data property`);
  }
  const prototype = {};
  Object.defineProperty(prototype, field, { configurable: true, enumerable: true, value: descriptor.value, writable: true });
  return Object.assign(Object.create(prototype), withoutOwnField(record, field));
}

function throwingProxy(record: object, counter: { calls: number }): object {
  return new Proxy(record, {
    get() {
      counter.calls += 1;
      throw new Error("normalizer must detect proxy before get");
    },
    getOwnPropertyDescriptor() {
      counter.calls += 1;
      throw new Error("normalizer must detect proxy before descriptors");
    },
    getPrototypeOf() {
      counter.calls += 1;
      throw new Error("normalizer must detect proxy before prototype inspection");
    },
    ownKeys() {
      counter.calls += 1;
      throw new Error("normalizer must detect proxy before keys");
    }
  });
}

function countingTransparentProxy(record: object, counter: { calls: number }): object {
  return new Proxy(record, {
    get(target, property, receiver) {
      counter.calls += 1;
      return Reflect.get(target, property, receiver);
    },
    getOwnPropertyDescriptor(target, property) {
      counter.calls += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
    getPrototypeOf(target) {
      counter.calls += 1;
      return Reflect.getPrototypeOf(target);
    },
    ownKeys(target) {
      counter.calls += 1;
      return Reflect.ownKeys(target);
    }
  });
}

const compilationComputeResult: ComputeCommitmentResult = { status: "computed", record: observationFixture() };
const compilationVerifyResult: VerifyCommitmentResult = { status: "valid" };
const compilationPort: SecretCommitmentComputePort = {
  async computeCommitment(
    profile: SecretCommitmentProfile,
    frame: Uint8Array
  ): Promise<ComputeCommitmentResult> {
    void profile;
    void frame;
    return compilationComputeResult;
  },
  async verifyCommitment(
    profile: SecretCommitmentProfile,
    frame: Uint8Array,
    publicRecord: SecretCommitmentPublicRecord
  ): Promise<VerifyCommitmentResult> {
    void profile;
    void frame;
    void publicRecord;
    return compilationVerifyResult;
  }
};

describe("secret commitment public record normalization contract", () => {
  test("keeps the direct compute and verify port contracts assignable", async () => {
    await expect(compilationPort.computeCommitment("cestus.source-observation.v1", new Uint8Array())).resolves.toBe(compilationComputeResult);
    await expect(compilationPort.verifyCommitment("source-manifest-authority.v1", new Uint8Array(), observationFixture())).resolves.toBe(compilationVerifyResult);
  });

  test("asserts the complete requirement-to-generator case inventory", () => {
    const requiredFields = inventories.reduce((total, inventory) => total + inventory.fields.length, 0);
    const forbiddenFields = inventories.reduce((total, inventory) => total + inventory.forbiddenFields.length, 0);
    const idFieldCount = inventories.reduce((total, inventory) => total + inventory.idFields.length, 0);
    const hexFieldCount = inventories.reduce((total, inventory) => total + inventory.hexFields.length, 0);
    const authorityRecordClassCount = inventories.filter((inventory) => inventory.hasAuthorityRecordClass).length;

    expect(inventories).toHaveLength(3);
    expect(requiredFields).toBe(36);
    expect(forbiddenFields).toBe(12);
    expect(idFieldCount).toBe(16);
    expect(hexFieldCount).toBe(9);
    expect(requiredFields).toBe(11 + 12 + 13);
    expect(forbiddenFields).toBe(5 + 4 + 3);
    expect(idFieldCount * idValidValues.length).toBe(80);
    expect(idFieldCount * idInvalidValues.length).toBe(48);
    expect(idFieldCount * nonStringRuntimeValues.length).toBe(96);
    expect(hexFieldCount * invalidHexValues.length).toBe(45);
    expect(hexFieldCount * nonStringRuntimeValues.length).toBe(54);
    expect(inventories.length * invalidKeyVersions.length).toBe(18);
    expect(inventories.length * nonNumberRuntimeValues.length).toBe(18);
    expect(inventories.length * nonStringRuntimeValues.length).toBe(18);
    expect(inventories.length * nonNumberRuntimeValues.length).toBe(18);
    expect(authorityRecordClassCount * nonStringRuntimeValues.length).toBe(12);
    expect(inventories.length * 2).toBe(6);
    expect(inventories.filter((inventory) => inventory.replacementRecordClass !== undefined)).toHaveLength(3);
  });

  test("rejects every hostile outer runtime shape without throwing", () => {
    const cases: { readonly label: string; readonly value: unknown }[] = [
      { label: "undefined", value: undefined },
      { label: "null", value: null },
      { label: "boolean", value: true },
      { label: "number", value: 1 },
      { label: "string", value: "record" },
      { label: "bigint", value: 1n },
      { label: "symbol", value: Symbol("record") },
      { label: "function", value: () => undefined },
      { label: "plain array", value: [] },
      { label: "populated array", value: [observationFixture()] }
    ];

    expect(cases).toHaveLength(10);
    for (const testCase of cases) {
      expect(() => normalizeSecretCommitmentPublicRecord(testCase.value), testCase.label).not.toThrow();
      expect(normalizeSecretCommitmentPublicRecord(testCase.value), testCase.label).toBeUndefined();
    }
  });

  for (const inventory of inventories) {
    test(`${inventory.name}: normalizes an equal, distinct frozen record`, () => {
      const input = inventory.fixture();
      const normalized = normalizeSecretCommitmentPublicRecord(input);

      expect(normalized).toEqual(input);
      expect(normalized).not.toBe(input);
      expect(Object.isFrozen(normalized)).toBe(true);
      expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
    });

    test(`${inventory.name}: caller mutation cannot affect normalized output`, () => {
      const input = { ...inventory.fixture() };
      const normalized = normalizeSecretCommitmentPublicRecord(input);
      const originalWorkspaceId = input.workspaceId;
      input.workspaceId = "changed-after-normalization";

      expect(normalized).toMatchObject({ workspaceId: originalWorkspaceId });
      expect(normalized).not.toBe(input);
    });

    test(`${inventory.name}: rejects every missing, forbidden, non-enumerable, accessor, and inherited field`, () => {
      const cases: { readonly label: string; readonly value: object; readonly counter?: { calls: number } }[] = [];
      for (const field of inventory.fields) {
        cases.push({ label: `missing ${field}`, value: withoutOwnField(inventory.fixture(), field) });
        cases.push({ label: `non-enumerable ${field}`, value: withNonEnumerableField(inventory.fixture(), field) });
        const counter = { calls: 0 };
        cases.push({ label: `accessor ${field}`, value: withAccessorField(inventory.fixture(), field, counter), counter });
        cases.push({ label: `inherited ${field}`, value: withInheritedField(inventory.fixture(), field) });
      }
      for (const field of inventory.forbiddenFields) {
        cases.push({ label: `forbidden ${field}`, value: withDataField(inventory.fixture(), field, "forbidden") });
      }

      expect(cases).toHaveLength(inventory.fields.length * 4 + inventory.forbiddenFields.length);
      for (const testCase of cases) {
        expect(() => normalizeSecretCommitmentPublicRecord(testCase.value), testCase.label).not.toThrow();
        expect(normalizeSecretCommitmentPublicRecord(testCase.value), testCase.label).toBeUndefined();
        expect(testCase.counter?.calls ?? 0, testCase.label).toBe(0);
      }
    });

    test(`${inventory.name}: rejects symbols, prototype changes, and outer proxies without traps`, () => {
      const enumerableSymbol = Symbol("enumerable");
      const nonEnumerableSymbol = Symbol("non-enumerable");
      const withEnumerableSymbol = Object.assign({}, inventory.fixture());
      const withNonEnumerableSymbol = Object.assign({}, inventory.fixture());
      Object.defineProperty(withEnumerableSymbol, enumerableSymbol, { enumerable: true, value: "symbol" });
      Object.defineProperty(withNonEnumerableSymbol, nonEnumerableSymbol, { enumerable: false, value: "symbol" });
      const wrongPrototype = Object.assign(Object.create(null), inventory.fixture());
      const transparentCounter = { calls: 0 };
      const transparentProxy = countingTransparentProxy(inventory.fixture(), transparentCounter);
      const throwingCounter = { calls: 0 };
      const hostileProxy = throwingProxy(inventory.fixture(), throwingCounter);
      const cases = [
        { label: "enumerable symbol", value: withEnumerableSymbol },
        { label: "non-enumerable symbol", value: withNonEnumerableSymbol },
        { label: "wrong prototype", value: wrongPrototype },
        { label: "transparent proxy", value: transparentProxy },
        { label: "throwing proxy", value: hostileProxy }
      ];

      expect(cases).toHaveLength(5);
      for (const testCase of cases) {
        expect(() => normalizeSecretCommitmentPublicRecord(testCase.value), testCase.label).not.toThrow();
        expect(normalizeSecretCommitmentPublicRecord(testCase.value), testCase.label).toBeUndefined();
      }
      expect(transparentCounter.calls).toBe(0);
      expect(throwingCounter.calls).toBe(0);
    });

    test(`${inventory.name}: accepts every exact ID scalar-value spelling`, () => {
      const cases: { readonly field: string; readonly value: string }[] = [];
      for (const field of inventory.idFields) {
        for (const value of idValidValues) {
          cases.push({ field, value });
        }
      }

      expect(cases).toHaveLength(inventory.idFields.length * 5);
      for (const testCase of cases) {
        const normalized = normalizeSecretCommitmentPublicRecord(
          withDataField(inventory.fixture(), testCase.field, testCase.value)
        );
        expect(normalized, `${testCase.field} accepts ${JSON.stringify(testCase.value)}`).toMatchObject({ [testCase.field]: testCase.value });
      }
    });

    test(`${inventory.name}: rejects invalid ID, hex, and key-version values`, () => {
      const cases: { readonly label: string; readonly value: object }[] = [];
      for (const field of inventory.idFields) {
        for (const value of idInvalidValues) {
          cases.push({ label: `${field} rejects invalid ID`, value: withDataField(inventory.fixture(), field, value) });
        }
        for (const value of nonStringRuntimeValues) {
          cases.push({ label: `${field} rejects non-string ID`, value: withDataField(inventory.fixture(), field, value) });
        }
      }
      for (const field of inventory.hexFields) {
        for (const value of invalidHexValues) {
          cases.push({ label: `${field} rejects invalid hex`, value: withDataField(inventory.fixture(), field, value) });
        }
        for (const value of nonStringRuntimeValues) {
          cases.push({ label: `${field} rejects non-string hex`, value: withDataField(inventory.fixture(), field, value) });
        }
      }
      for (const value of invalidKeyVersions) {
        cases.push({ label: "keyVersion rejects invalid number", value: withDataField(inventory.fixture(), "keyVersion", value) });
      }
      for (const value of nonNumberRuntimeValues) {
        cases.push({ label: "keyVersion rejects non-number", value: withDataField(inventory.fixture(), "keyVersion", value) });
      }

      expect(cases).toHaveLength(
        inventory.idFields.length * (idInvalidValues.length + nonStringRuntimeValues.length)
          + inventory.hexFields.length * (invalidHexValues.length + nonStringRuntimeValues.length)
          + invalidKeyVersions.length
          + nonNumberRuntimeValues.length
      );
      for (const testCase of cases) {
        expect(normalizeSecretCommitmentPublicRecord(testCase.value), testCase.label).toBeUndefined();
      }
    });

    test(`${inventory.name}: rejects profile, contract version, and record-class substitutions`, () => {
      const cases = [
        { label: "profile substitution", value: withDataField(inventory.fixture(), "profile", inventory.replacementProfile) },
        { label: "contract version substitution", value: withDataField(inventory.fixture(), "contractVersion", 2) },
        { label: "record class substitution", value: withDataField(inventory.fixture(), "recordClass", inventory.replacementRecordClass) }
      ];

      expect(cases).toHaveLength(3);
      for (const testCase of cases) {
        expect(normalizeSecretCommitmentPublicRecord(testCase.value), testCase.label).toBeUndefined();
      }
    });

    test(`${inventory.name}: rejects wrong runtime discriminant types`, () => {
      const cases: { readonly label: string; readonly value: object }[] = [];
      for (const value of nonStringRuntimeValues) {
        cases.push({ label: "profile rejects non-string", value: withDataField(inventory.fixture(), "profile", value) });
      }
      for (const value of nonNumberRuntimeValues) {
        cases.push({ label: "contractVersion rejects non-number", value: withDataField(inventory.fixture(), "contractVersion", value) });
      }
      if (inventory.hasAuthorityRecordClass) {
        for (const value of nonStringRuntimeValues) {
          cases.push({ label: "recordClass rejects non-string", value: withDataField(inventory.fixture(), "recordClass", value) });
        }
      }

      const expectedCaseCount = nonStringRuntimeValues.length + nonNumberRuntimeValues.length
        + (inventory.hasAuthorityRecordClass ? nonStringRuntimeValues.length : 0);
      expect(cases).toHaveLength(expectedCaseCount);
      for (const testCase of cases) {
        expect(normalizeSecretCommitmentPublicRecord(testCase.value), testCase.label).toBeUndefined();
      }
    });
  }
});

type FrameBuilder = (input: unknown) => Uint8Array | undefined;
type FrameInput = SourceObservationFrameInput | ManifestAuthorityFrameInput | EntryAuthorityFrameInput;

const observationFrameHex = "6365737475732e736f757263652d6f62736572766174696f6e2e76310001000000000000000157020000000000000001530300000000000000015204000000000000000145050000000000000020000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f060000000000000003610062";
const manifestFrameHex = "736f757263652d6d616e69666573742d617574686f726974792e7631000100000000000000086d616e6966657374020000000000000001570300000000000000015304000000000000000152050000000000000020202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f060000000000000020404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f0800000000000000024d00";
const entryFrameHex = "736f757263652d6d616e69666573742d617574686f726974792e763100010000000000000005656e747279020000000000000001570300000000000000015304000000000000000152050000000000000020202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f060000000000000020404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f070000000000000020606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f0800000000000000024500";

function frameBytes(hexValue: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hexValue, "hex"));
}

function sequence(start: number, length = 32): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
}

function sourceFrameFixture(): SourceObservationFrameInput {
  return {
    workspaceId: "W",
    sourceCollectionId: "S",
    sourceBoundaryRevision: "R",
    manifestEntryId: "E",
    nonce: sequence(0),
    observedBytes: Uint8Array.of(0x61, 0, 0x62)
  };
}

function manifestFrameFixture(): ManifestAuthorityFrameInput {
  return {
    workspaceId: "W",
    sourceCollectionId: "S",
    sourceBoundaryRevision: "R",
    classificationPolicyHash: sequence(0x20),
    publicManifestId: sequence(0x40),
    protectedCanonicalManifestBytes: Uint8Array.of(0x4d, 0)
  };
}

function entryFrameFixture(): EntryAuthorityFrameInput {
  return {
    workspaceId: "W",
    sourceCollectionId: "S",
    sourceBoundaryRevision: "R",
    classificationPolicyHash: sequence(0x20),
    publicManifestId: sequence(0x40),
    publicEntryId: sequence(0x60),
    protectedCanonicalEntryBytes: Uint8Array.of(0x45, 0)
  };
}

interface FrameInventory {
  readonly name: string;
  readonly builder: FrameBuilder;
  readonly fixture: () => FrameInput;
  readonly expectedHex: string;
  readonly expectedLength: number;
  readonly prefixLength: number;
  readonly classLength: number;
  readonly idFields: readonly string[];
  readonly fixedByteFields: readonly string[];
  readonly payloadField: string;
}

type FrameValues = Record<string, unknown>;

function frameValues(input: FrameInput): FrameValues {
  return input as unknown as FrameValues;
}

function requiredFrameIdField(inventory: FrameInventory): string {
  const field = inventory.idFields[0];
  if (field === undefined) {
    throw new Error(`${inventory.name} requires an ID field`);
  }
  return field;
}

const frameInventories: readonly FrameInventory[] = [
  {
    name: "source observation",
    builder: buildSourceObservationFrame,
    fixture: sourceFrameFixture,
    expectedHex: observationFrameHex,
    expectedLength: 122,
    prefixLength: 29,
    classLength: 0,
    idFields: ["workspaceId", "sourceCollectionId", "sourceBoundaryRevision", "manifestEntryId"],
    fixedByteFields: ["nonce"],
    payloadField: "observedBytes"
  },
  {
    name: "manifest authority",
    builder: buildManifestAuthorityFrame,
    fixture: manifestFrameFixture,
    expectedHex: manifestFrameHex,
    expectedLength: 169,
    prefixLength: 29,
    classLength: 17,
    idFields: ["workspaceId", "sourceCollectionId", "sourceBoundaryRevision"],
    fixedByteFields: ["classificationPolicyHash", "publicManifestId"],
    payloadField: "protectedCanonicalManifestBytes"
  },
  {
    name: "entry authority",
    builder: buildEntryAuthorityFrame,
    fixture: entryFrameFixture,
    expectedHex: entryFrameHex,
    expectedLength: 207,
    prefixLength: 29,
    classLength: 14,
    idFields: ["workspaceId", "sourceCollectionId", "sourceBoundaryRevision"],
    fixedByteFields: ["classificationPolicyHash", "publicManifestId", "publicEntryId"],
    payloadField: "protectedCanonicalEntryBytes"
  }
];

const exactOuterCaseNames = [
  "missing", "extra", "inherited", "non-enumerable", "accessor", "enumerable symbol",
  "non-enumerable symbol", "wrong type", "Proxy"
] as const;
const acceptedIdCases = ["ASCII", "embedded NUL", "non-BMP", "NFC", "distinct NFD"] as const;
const rejectedIdCases = ["empty", "lone high surrogate", "lone low surrogate", "non-string"] as const;
const byteShapeCaseNames = [
  "Buffer", "Uint8Array subclass", "altered prototype", "cross-realm prototype", "detached backing",
  "transparent Proxy", "throwing Proxy", "fixed SharedArrayBuffer", "resizable fixed-length view",
  "resizable length-tracking view", "growable fixed-length view", "growable length-tracking view"
] as const;

function independentlyCalculatedLength(inventory: FrameInventory, input: Record<string, unknown>): number {
  const ids = inventory.idFields.reduce((total, field) => total + 9 + new TextEncoder().encode(input[field] as string).length, 0);
  const fixed = inventory.fixedByteFields.length * (9 + 32);
  const payload = input[inventory.payloadField] as Uint8Array;
  return inventory.prefixLength + inventory.classLength + ids + fixed + 9 + payload.length;
}

function independentlyEncodedFrame(inventory: FrameInventory, input: FrameInput): Uint8Array {
  const values = frameValues(input);
  const prefix = inventory.name === "source observation"
    ? "cestus.source-observation.v1\0"
    : "source-manifest-authority.v1\0";
  const fields: readonly (readonly [number, Uint8Array])[] = [
    ...(inventory.name === "source observation" ? [] : [[1, new TextEncoder().encode(inventory.name === "manifest authority" ? "manifest" : "entry")] as const]),
    ...inventory.idFields.map((field, index) => [index + (inventory.name === "source observation" ? 1 : 2), new TextEncoder().encode(values[field] as string)] as const),
    ...inventory.fixedByteFields.map((field, index) => [index + 5, values[field] as Uint8Array] as const),
    [inventory.name === "source observation" ? 6 : 8, values[inventory.payloadField] as Uint8Array]
  ];
  const length = new TextEncoder().encode(prefix).length + fields.reduce((total, [, value]) => total + 9 + value.length, 0);
  const output = new Uint8Array(length);
  output.set(new TextEncoder().encode(prefix));
  let offset = new TextEncoder().encode(prefix).length;
  for (const [tag, value] of fields) {
    output[offset] = tag;
    new DataView(output.buffer).setBigUint64(offset + 1, BigInt(value.length));
    output.set(value, offset + 9);
    offset += 9 + value.length;
  }
  return output;
}

function withFrameField(input: FrameInput, field: string, value: unknown): FrameInput {
  return { ...frameValues(input), [field]: value } as unknown as FrameInput;
}

function fullFrameFields(inventory: FrameInventory): readonly string[] {
  return [...inventory.idFields, ...inventory.fixedByteFields, inventory.payloadField];
}

function exactOuterCase(input: FrameInput, field: string, name: (typeof exactOuterCaseNames)[number], calls: { accessor: number; proxy: number }): unknown {
  const base = frameValues(input);
  switch (name) {
    case "missing": {
      const { [field]: _omitted, ...rest } = base;
      return rest;
    }
    case "extra":
      return { ...base, unexpected: true };
    case "inherited": {
      const { [field]: value, ...rest } = base;
      return Object.assign(Object.create({ [field]: value }), rest);
    }
    case "non-enumerable": {
      const output = { ...base };
      Object.defineProperty(output, field, { configurable: true, enumerable: false, value: base[field] });
      return output;
    }
    case "accessor": {
      const output = { ...base };
      Object.defineProperty(output, field, {
        configurable: true,
        enumerable: true,
        get() {
          calls.accessor += 1;
          throw new Error("frame classifier must use descriptors");
        }
      });
      return output;
    }
    case "enumerable symbol":
      return { ...base, [Symbol("unexpected")]: true };
    case "non-enumerable symbol": {
      const output = { ...base };
      Object.defineProperty(output, Symbol("unexpected"), { enumerable: false, value: true });
      return output;
    }
    case "wrong type":
      return { ...base, [field]: { wrong: true } };
    case "Proxy":
      return new Proxy({ ...base }, {
        get() {
          calls.proxy += 1;
          throw new Error("frame classifier must reject Proxy before traps");
        },
        getPrototypeOf() {
          calls.proxy += 1;
          throw new Error("frame classifier must reject Proxy before traps");
        },
        ownKeys() {
          calls.proxy += 1;
          throw new Error("frame classifier must reject Proxy before traps");
        },
        getOwnPropertyDescriptor() {
          calls.proxy += 1;
          throw new Error("frame classifier must reject Proxy before traps");
        }
      });
  }
}

function detachedView(length: number): Uint8Array {
  const backing = new ArrayBuffer(length);
  const value = new Uint8Array(backing);
  structuredClone(backing, { transfer: [backing] });
  return value;
}

function resizableView(lengthTracking: boolean): Uint8Array | undefined {
  try {
    const Constructor = ArrayBuffer as unknown as new (length: number, options: { maxByteLength: number }) => ArrayBuffer;
    const backing = new Constructor(32, { maxByteLength: 64 });
    return lengthTracking ? new Uint8Array(backing) : new Uint8Array(backing, 0, 32);
  } catch {
    return undefined;
  }
}

function growableView(lengthTracking: boolean): Uint8Array | undefined {
  try {
    const Constructor = SharedArrayBuffer as unknown as new (length: number, options: { maxByteLength: number }) => SharedArrayBuffer;
    const backing = new Constructor(32, { maxByteLength: 64 });
    return lengthTracking ? new Uint8Array(backing) : new Uint8Array(backing, 0, 32);
  } catch {
    return undefined;
  }
}

type FreshSecretCommitmentContractModule = typeof import("../src/secret-commitment-contract.js");

function normalFreshByteSnapshot(value: unknown, limit: number): Uint8Array | undefined {
  return value instanceof Uint8Array && value.length <= limit && (limit !== 32 || value.length === 32)
    ? Uint8Array.from(value)
    : undefined;
}

async function withFreshParserByteSeam(
  snapshot: (value: unknown, limit: number) => Uint8Array | undefined,
  check: (module: FreshSecretCommitmentContractModule) => void | Promise<void>
): Promise<void> {
  vi.resetModules();
  vi.doMock("../src/secret-commitment-bytes.js", () => ({
    trustedCanonicalSecretCommitmentByteLength(value: unknown, limit: number) {
      return value instanceof Uint8Array && value.length <= limit && (limit !== 32 || value.length === 32)
        ? value.length
        : undefined;
    },
    snapshotCanonicalSecretCommitmentBytes: snapshot
  }));
  try {
    await check(await import("../src/secret-commitment-contract.js"));
  } finally {
    vi.doUnmock("../src/secret-commitment-bytes.js");
    vi.resetModules();
  }
}

interface HostileByteShape {
  readonly name: (typeof byteShapeCaseNames)[number];
  readonly value: Uint8Array | undefined;
  readonly supported: boolean;
}

function hostileByteShapes(): readonly HostileByteShape[] {
  class Subclass extends Uint8Array {}
  const transparentProxy = new Proxy(sequence(0), {});
  const throwingProxy = new Proxy(sequence(0), { get() { throw new Error("byte Proxy must not trap"); } });
  const altered = sequence(0);
  Object.setPrototypeOf(altered, {});
  const resizableFixed = resizableView(false);
  const resizableTracking = resizableView(true);
  const growableFixed = growableView(false);
  const growableTracking = growableView(true);
  return [
    { name: "Buffer", value: Buffer.from(sequence(0)), supported: true },
    { name: "Uint8Array subclass", value: new Subclass(sequence(0)), supported: true },
    { name: "altered prototype", value: altered, supported: true },
    { name: "cross-realm prototype", value: vm.runInNewContext("new Uint8Array(32)") as Uint8Array, supported: true },
    { name: "detached backing", value: detachedView(32), supported: true },
    { name: "transparent Proxy", value: transparentProxy, supported: true },
    { name: "throwing Proxy", value: throwingProxy, supported: true },
    { name: "fixed SharedArrayBuffer", value: new Uint8Array(new SharedArrayBuffer(32)), supported: true },
    { name: "resizable fixed-length view", value: resizableFixed, supported: resizableFixed !== undefined },
    { name: "resizable length-tracking view", value: resizableTracking, supported: resizableTracking !== undefined },
    { name: "growable fixed-length view", value: growableFixed, supported: growableFixed !== undefined },
    { name: "growable length-tracking view", value: growableTracking, supported: growableTracking !== undefined }
  ];
}

describe("secret commitment frame-builder checkpoint inventory", () => {
  test("keeps the exact public input contracts and undefined-return builder signatures assignable", () => {
    const source: SourceObservationFrameInput = sourceFrameFixture();
    const manifest: ManifestAuthorityFrameInput = manifestFrameFixture();
    const entry: EntryAuthorityFrameInput = entryFrameFixture();
    const sourceResult: Uint8Array | undefined = buildSourceObservationFrame(source);
    const manifestResult: Uint8Array | undefined = buildManifestAuthorityFrame(manifest);
    const entryResult: Uint8Array | undefined = buildEntryAuthorityFrame(entry);
    void [sourceResult, manifestResult, entryResult];
  });

  test("asserts the complete count-asserted frame requirement inventory", () => {
    const outerMembers = frameInventories.reduce((total, inventory) => total + fullFrameFields(inventory).length, 0);
    const idOccurrences = frameInventories.reduce((total, inventory) => total + inventory.idFields.length, 0);
    const byteOccurrences = frameInventories.reduce((total, inventory) => total + inventory.fixedByteFields.length + 1, 0);
    const validIdCases = idOccurrences * acceptedIdCases.length;
    const rejectedIdCaseCount = idOccurrences * rejectedIdCases.length;
    const outerCases = outerMembers * exactOuterCaseNames.length;
    const byteShapeCases = byteOccurrences * byteShapeCaseNames.length;
    expect(frameInventories).toHaveLength(3);
    expect(frameInventories.map((inventory) => fullFrameFields(inventory).length)).toEqual([6, 6, 7]);
    expect(outerMembers).toBe(19);
    expect(idOccurrences).toBe(10);
    expect(byteOccurrences).toBe(9);
    expect(validIdCases).toBe(50);
    expect(rejectedIdCaseCount).toBe(40);
    expect(outerCases).toBe(171);
    expect(byteShapeCases).toBe(108);
    expect(frameInventories.map((inventory) => inventory.expectedLength)).toEqual([122, 169, 207]);
    expect(frameInventories.map((inventory) => frameBytes(inventory.expectedHex).length)).toEqual([122, 169, 207]);
  });

  for (const inventory of frameInventories) {
    test(`${inventory.name}: exact independent literal frame and size control`, () => {
      const input = inventory.fixture();
      const expected = frameBytes(inventory.expectedHex);
      expect(independentlyCalculatedLength(inventory, frameValues(input))).toBe(inventory.expectedLength);
      expect(expected).toHaveLength(inventory.expectedLength);
      expect(inventory.builder(input)).toEqual(expected);
    });

    test(`${inventory.name}: outer classifier rejects every exact-object violation without traps or accessor calls`, () => {
      const cases: unknown[] = [];
      for (const field of fullFrameFields(inventory)) {
        for (const name of exactOuterCaseNames) {
          const calls = { accessor: 0, proxy: 0 };
          const value = exactOuterCase(inventory.fixture(), field, name, calls);
          expect(inventory.builder(value), `${field} ${name}`).toBeUndefined();
          expect(calls, `${field} ${name}`).toEqual({ accessor: 0, proxy: 0 });
          cases.push(value);
        }
      }
      expect(cases).toHaveLength(fullFrameFields(inventory).length * exactOuterCaseNames.length);
    });

    test(`${inventory.name}: outer classifier rejects non-object and wrong-prototype shapes without Proxy traps`, () => {
      const calls = { transparent: 0, throwing: 0 };
      const transparent = new Proxy(inventory.fixture(), {
        get(target, property, receiver) {
          calls.transparent += 1;
          return Reflect.get(target, property, receiver);
        },
        ownKeys(target) {
          calls.transparent += 1;
          return Reflect.ownKeys(target);
        }
      });
      const throwing = new Proxy(inventory.fixture(), {
        get() {
          calls.throwing += 1;
          throw new Error("outer Proxy trap must not run");
        },
        ownKeys() {
          calls.throwing += 1;
          throw new Error("outer Proxy trap must not run");
        }
      });
      const shapes: readonly unknown[] = [null, undefined, 1, "input", true, () => undefined, [], {}, new Date(), new Map(), Object.create(null), transparent, throwing];
      expect(shapes).toHaveLength(13);
      for (const shape of shapes) {
        expect(inventory.builder(shape)).toBeUndefined();
      }
      expect(calls).toEqual({ transparent: 0, throwing: 0 });
    });

    test(`${inventory.name}: outer classifier rejects complete custom and null-prototype objects`, () => {
      const fixture = frameValues(inventory.fixture());
      const customPrototype = Object.assign(Object.create({}), fixture);
      const nullPrototype = Object.assign(Object.create(null), fixture);
      expect(Reflect.ownKeys(customPrototype)).toHaveLength(fullFrameFields(inventory).length);
      expect(Reflect.ownKeys(nullPrototype)).toHaveLength(fullFrameFields(inventory).length);
      expect(inventory.builder(customPrototype)).toBeUndefined();
      expect(inventory.builder(nullPrototype)).toBeUndefined();
    });

    test(`${inventory.name}: outer classifier rejects a complete cross-realm plain Object.prototype input`, () => {
      const fixture = frameValues(inventory.fixture());
      const crossRealm = vm.runInNewContext("({})") as Record<string, unknown>;
      Object.assign(crossRealm, fixture);
      expect(Reflect.ownKeys(crossRealm)).toHaveLength(fullFrameFields(inventory).length);
      expect(Object.getPrototypeOf(crossRealm)).not.toBe(Object.prototype);
      expect(inventory.builder(crossRealm)).toBeUndefined();
    });

    test(`${inventory.name}: every ID occurrence accepts scalar Unicode exactly and rejects malformed IDs`, () => {
      const accepted = ["ascii", "nul\u0000id", "non-bmp-\u{1F680}", "café", "cafe\u0301"];
      const rejected: readonly unknown[] = ["", "high-\uD800", "low-\uDC00", 1];
      const acceptedResults: { readonly actual: Uint8Array | undefined; readonly expected: Uint8Array }[] = [];
      const rejectedResults: unknown[] = [];
      for (const field of inventory.idFields) {
        for (const value of accepted) {
          const candidate = withFrameField(inventory.fixture(), field, value);
          acceptedResults.push({ actual: inventory.builder(candidate), expected: independentlyEncodedFrame(inventory, candidate) });
        }
        for (const value of rejected) {
          rejectedResults.push(inventory.builder(withFrameField(inventory.fixture(), field, value)));
        }
      }
      expect(acceptedResults).toHaveLength(inventory.idFields.length * acceptedIdCases.length);
      expect(rejectedResults).toHaveLength(inventory.idFields.length * rejectedIdCases.length);
      for (const result of acceptedResults) {
        expect(result.actual, "valid scalar ID inputs must preserve exact scalar UTF-8 bytes").toEqual(result.expected);
      }
      const primaryIdField = requiredFrameIdField(inventory);
      const nfc = withFrameField(inventory.fixture(), primaryIdField, "café");
      const nfd = withFrameField(inventory.fixture(), primaryIdField, "cafe\u0301");
      expect(independentlyEncodedFrame(inventory, nfc)).not.toEqual(independentlyEncodedFrame(inventory, nfd));
      expect(rejectedResults, "empty, surrogate, and non-string IDs must reject").toEqual(rejectedResults.map(() => undefined));
    });

    test(`${inventory.name}: rejects every hostile byte shape for every byte-field occurrence`, () => {
      const shapes = hostileByteShapes();
      const supported = shapes.filter((shape): shape is HostileByteShape & { readonly value: Uint8Array; readonly supported: true } => shape.supported);
      const resizable = supported.filter((shape) => shape.name.startsWith("resizable"));
      const growable = supported.filter((shape) => shape.name.startsWith("growable"));
      expect(byteShapeCaseNames).toHaveLength(12);
      expect(shapes).toHaveLength(12);
      expect(shapes.map((shape) => shape.name)).toEqual(byteShapeCaseNames);
      expect([0, 2]).toContain(resizable.length);
      expect([0, 2]).toContain(growable.length);
      expect(supported.map((shape) => shape.name)).toEqual(byteShapeCaseNames.filter((name) => shapes.find((shape) => shape.name === name)?.supported));
      expect(supported).toHaveLength(8 + resizable.length + growable.length);
      const results: unknown[] = [];
      for (const field of [...inventory.fixedByteFields, inventory.payloadField]) {
        for (const shape of supported) {
          results.push(inventory.builder(withFrameField(inventory.fixture(), field, shape.value)));
        }
      }
      expect(results).toHaveLength((inventory.fixedByteFields.length + 1) * supported.length);
      expect(results).toEqual(results.map(() => undefined));
    });

    test(`${inventory.name}: fixed, payload, and complete-frame size-boundary inventory`, async () => {
      await withFreshParserByteSeam(normalFreshByteSnapshot, (fresh) => {
        const build = (input: FrameInput): Uint8Array | undefined => invokeFreshBuilder(fresh, inventory, input);
        const fixedLengths = [0, 31, 32, 33];
        const payloadLengths = [0, 2, 8_388_607, 8_388_608, 8_388_609];
        const completeLengths = [8_454_143, 8_454_144, 8_454_145];
        const fixedAccepted: boolean[] = [];
        const payloadAccepted: boolean[] = [];
        const completeAccepted: boolean[] = [];
        for (const field of inventory.fixedByteFields) {
          for (const length of fixedLengths) {
            fixedAccepted.push(build(withFrameField(inventory.fixture(), field, sequence(0, length))) !== undefined);
          }
        }
        for (const length of payloadLengths) {
          payloadAccepted.push(build(withFrameField(inventory.fixture(), inventory.payloadField, sequence(0, length))) !== undefined);
        }
        for (const length of completeLengths) {
          const input = inventory.fixture();
          const currentLength = independentlyCalculatedLength(inventory, frameValues(input));
          const idLength = length - currentLength + 1;
          completeAccepted.push(build(withFrameField(input, requiredFrameIdField(inventory), "x".repeat(idLength))) !== undefined);
        }
        expect(fixedAccepted).toHaveLength(inventory.fixedByteFields.length * fixedLengths.length);
        expect(payloadAccepted).toHaveLength(payloadLengths.length);
        expect(completeAccepted).toHaveLength(completeLengths.length);
        const rejectedFixed = fixedAccepted.filter((_, index) => fixedLengths[index % fixedLengths.length] !== 32);
        const acceptedFixed = fixedAccepted.filter((_, index) => fixedLengths[index % fixedLengths.length] === 32);
        expect(fixedLengths).toEqual([0, 31, 32, 33]);
        expect(payloadLengths).toEqual([0, 2, 8_388_607, 8_388_608, 8_388_609]);
        expect(completeLengths).toEqual([8_454_143, 8_454_144, 8_454_145]);
        expect(rejectedFixed).toHaveLength(inventory.fixedByteFields.length * 3);
        expect(acceptedFixed).toHaveLength(inventory.fixedByteFields.length);
        expect(rejectedFixed).toEqual(rejectedFixed.map(() => false));
        expect(acceptedFixed, "exact 32-byte fixed fields must build").toEqual(acceptedFixed.map(() => true));
        expect(payloadAccepted, "payload zero, limit-minus-one, equal, and plus-one controls").toEqual([true, true, true, true, false]);
        expect(completeAccepted, "complete-frame lower, equal, and plus-one controls").toEqual([true, true, false]);
      });
    }, 180_000);

    test(`${inventory.name}: synchronous post-return snapshot isolates every caller byte, string, and object mutation`, () => {
      const frames: (Uint8Array | undefined)[] = [];
      for (const field of [...inventory.fixedByteFields, inventory.payloadField]) {
        const input = frameValues(inventory.fixture());
        const before = inventory.builder(input);
        (input[field] as Uint8Array).fill(0xff);
        input[requiredFrameIdField(inventory)] = "later-string-mutation";
        Object.setPrototypeOf(input, { replacement: true });
        frames.push(before);
      }
      expect(frames).toHaveLength(inventory.fixedByteFields.length + 1);
      expect(frames, "valid input must create synchronous frame snapshots before every caller mutation").not.toContain(undefined);
      for (const frame of frames) {
        expect(frame).toEqual(frameBytes(inventory.expectedHex));
      }
    });
  }
});

interface FreshFrameModule {
  readonly buildSourceObservationFrame: FrameBuilder;
  readonly buildManifestAuthorityFrame: FrameBuilder;
  readonly buildEntryAuthorityFrame: FrameBuilder;
}

function invokeFreshBuilder(module: FreshFrameModule, inventory: FrameInventory, input: unknown): Uint8Array | undefined {
  return inventory.name === "source observation"
    ? module.buildSourceObservationFrame(input)
    : inventory.name === "manifest authority"
      ? module.buildManifestAuthorityFrame(input)
      : module.buildEntryAuthorityFrame(input);
}

async function withBoundByteHelper<Result>(
  inventory: FrameInventory,
  run: (module: FreshFrameModule, calls: {
    readonly lengths: { readonly value: unknown; readonly limit: unknown }[];
    readonly snapshots: { readonly value: unknown; readonly limit: unknown }[];
    readonly events: { readonly phase: "length" | "snapshot"; readonly value: unknown; readonly limit: unknown }[];
  }) => Promise<Result> | Result
): Promise<Result> {
  const calls = {
    lengths: [] as { value: unknown; limit: unknown }[],
    snapshots: [] as { value: unknown; limit: unknown }[],
    events: [] as { phase: "length" | "snapshot"; value: unknown; limit: unknown }[]
  };
  const module = await sharedBoundByteFrameModule();
  sharedBoundByteRun = calls;
  try {
    return await run(module, calls);
  } finally {
    sharedBoundByteRun = undefined;
  }
}

let sharedBoundByteRun: {
  readonly lengths: { readonly value: unknown; readonly limit: unknown }[];
  readonly snapshots: { readonly value: unknown; readonly limit: unknown }[];
  readonly events: { readonly phase: "length" | "snapshot"; readonly value: unknown; readonly limit: unknown }[];
} | undefined;
let sharedBoundByteModulePromise: Promise<FreshFrameModule> | undefined;

function sharedBoundByteFrameModule(): Promise<FreshFrameModule> {
  sharedBoundByteModulePromise ??= (async () => {
    vi.resetModules();
    vi.doMock("../src/secret-commitment-bytes.js", () => ({
      trustedCanonicalSecretCommitmentByteLength(value: unknown, limit: unknown) {
        const active = sharedBoundByteRun;
        active?.lengths.push({ value, limit });
        active?.events.push({ phase: "length", value, limit });
        return value instanceof Uint8Array ? value.length : undefined;
      },
      snapshotCanonicalSecretCommitmentBytes(value: unknown, limit: unknown) {
        const active = sharedBoundByteRun;
        active?.snapshots.push({ value, limit });
        active?.events.push({ phase: "snapshot", value, limit });
        return value instanceof Uint8Array ? Uint8Array.from(value) : undefined;
      }
    }));
    try {
      return await import("../src/secret-commitment-contract.js");
    } finally {
      vi.doUnmock("../src/secret-commitment-bytes.js");
      vi.resetModules();
    }
  })();
  return sharedBoundByteModulePromise;
}

async function withFreshFrameModule<Result>(
  mock: {
    readonly isProxy?: ((value: object) => boolean) | null;
    readonly byteFailure?: { readonly phase: "length" | "snapshot"; readonly occurrence: number; readonly outcome: "throw" | "undefined" };
  },
  run: (module: FreshFrameModule, byteCalls: { length: number; snapshot: number }) => Promise<Result> | Result
): Promise<Result> {
  if (mock.isProxy === undefined && mock.byteFailure !== undefined) {
    const byteCalls = { length: 0, snapshot: 0 };
    const module = await sharedByteFailureFrameModule();
    sharedByteFailureRun = { failure: mock.byteFailure, calls: byteCalls };
    try {
      return await run(module, byteCalls);
    } finally {
      sharedByteFailureRun = undefined;
    }
  }
  const byteCalls = { length: 0, snapshot: 0 };
  vi.resetModules();
  vi.doMock("node:util/types", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:util/types")>();
    return { ...actual, ...(mock.isProxy === undefined ? {} : { isProxy: mock.isProxy }) };
  });
  vi.doMock("../src/secret-commitment-bytes.js", () => ({
    trustedCanonicalSecretCommitmentByteLength(value: unknown) {
      byteCalls.length += 1;
      if (mock.byteFailure?.phase === "length" && byteCalls.length === mock.byteFailure.occurrence) {
        if (mock.byteFailure.outcome === "throw") {
          throw new Error("test-owned trusted-length failure");
        }
        return undefined;
      }
      return value instanceof Uint8Array ? value.length : undefined;
    },
    snapshotCanonicalSecretCommitmentBytes(value: unknown) {
      byteCalls.snapshot += 1;
      if (mock.byteFailure?.phase === "snapshot" && byteCalls.snapshot === mock.byteFailure.occurrence) {
        if (mock.byteFailure.outcome === "throw") {
          throw new Error("test-owned snapshot failure");
        }
        return undefined;
      }
      return value instanceof Uint8Array ? Uint8Array.from(value) : undefined;
    }
  }));
  try {
    return await run(await import("../src/secret-commitment-contract.js"), byteCalls);
  } finally {
    vi.doUnmock("node:util/types");
    vi.doUnmock("../src/secret-commitment-bytes.js");
    vi.resetModules();
  }
}

let sharedByteFailureRun: {
  readonly failure: { readonly phase: "length" | "snapshot"; readonly occurrence: number; readonly outcome: "throw" | "undefined" };
  readonly calls: { length: number; snapshot: number };
} | undefined;
let sharedByteFailureModulePromise: Promise<FreshFrameModule> | undefined;

function sharedByteFailureFrameModule(): Promise<FreshFrameModule> {
  sharedByteFailureModulePromise ??= (async () => {
    vi.resetModules();
    vi.doMock("../src/secret-commitment-bytes.js", () => ({
      trustedCanonicalSecretCommitmentByteLength(value: unknown) {
        const active = sharedByteFailureRun;
        if (active === undefined) {
          return value instanceof Uint8Array ? value.length : undefined;
        }
        active.calls.length += 1;
        if (active.failure.phase === "length" && active.calls.length === active.failure.occurrence) {
          if (active.failure.outcome === "throw") {
            throw new Error("test-owned trusted-length failure");
          }
          return undefined;
        }
        return value instanceof Uint8Array ? value.length : undefined;
      },
      snapshotCanonicalSecretCommitmentBytes(value: unknown) {
        const active = sharedByteFailureRun;
        if (active === undefined) {
          return value instanceof Uint8Array ? Uint8Array.from(value) : undefined;
        }
        active.calls.snapshot += 1;
        if (active.failure.phase === "snapshot" && active.calls.snapshot === active.failure.occurrence) {
          if (active.failure.outcome === "throw") {
            throw new Error("test-owned snapshot failure");
          }
          return undefined;
        }
        return value instanceof Uint8Array ? Uint8Array.from(value) : undefined;
      }
    }));
    try {
      return await import("../src/secret-commitment-contract.js");
    } finally {
      vi.doUnmock("../src/secret-commitment-bytes.js");
      vi.resetModules();
    }
  })();
  return sharedByteFailureModulePromise;
}

describe("secret commitment frame-builder production-bound failure seams", () => {
  for (const inventory of frameInventories) {
    test(`${inventory.name}: trusted byte helpers receive every exact field identity, limit, and phase order`, async () => {
      const input = inventory.fixture();
      const values = frameValues(input);
      const fields = [...inventory.fixedByteFields, inventory.payloadField];
      await withBoundByteHelper(inventory, (module, calls) => {
        expect(invokeFreshBuilder(module, inventory, input)).toBeDefined();
        expect(calls.lengths).toHaveLength(fields.length);
        expect(calls.snapshots).toHaveLength(fields.length);
        for (const [index, field] of fields.entries()) {
          expect(calls.lengths[index]).toEqual({ value: values[field], limit: field === inventory.payloadField ? 8_388_608 : 32 });
          expect(calls.snapshots[index]).toEqual({ value: values[field], limit: field === inventory.payloadField ? 8_388_608 : 32 });
          expect(calls.lengths[index]?.value).toBe(values[field]);
          expect(calls.snapshots[index]?.value).toBe(values[field]);
        }
        const expectedEvents = [
          ...fields.map((field) => ({ phase: "length" as const, value: values[field], limit: field === inventory.payloadField ? 8_388_608 : 32 })),
          ...fields.map((field) => ({ phase: "snapshot" as const, value: values[field], limit: field === inventory.payloadField ? 8_388_608 : 32 }))
        ];
        expect(calls.events).toEqual(expectedEvents);
        for (const [index, event] of calls.events.entries()) {
          expect(event.value).toBe(expectedEvents[index]?.value);
        }
      });
    });
  }

  test("fresh captured Proxy classifier failure returns undefined before caller Proxy traps", async () => {
    const calls = { traps: 0, classifier: 0 };
    const input = new Proxy(sourceFrameFixture(), {
      get() {
        calls.traps += 1;
        throw new Error("caller Proxy trap must not run");
      }
    });
    await withFreshFrameModule({ isProxy(value) { calls.classifier += 1; return value === input; } }, (module) => {
      expect(module.buildSourceObservationFrame(input)).toBeUndefined();
      expect(calls).toEqual({ traps: 0, classifier: 1 });
    });
  });

  for (const inventory of frameInventories) {
    const byteFields = [...inventory.fixedByteFields, inventory.payloadField];
    for (const [index, field] of byteFields.entries()) {
      for (const outcome of ["throw", "undefined"] as const) {
        test(`${inventory.name}: trusted length ${outcome} at ${field} stops before snapshots`, async () => {
          await withFreshFrameModule({ byteFailure: { phase: "length", occurrence: index + 1, outcome } }, (module, calls) => {
            expect(module[inventory.builder === buildSourceObservationFrame ? "buildSourceObservationFrame" : inventory.builder === buildManifestAuthorityFrame ? "buildManifestAuthorityFrame" : "buildEntryAuthorityFrame"](inventory.fixture())).toBeUndefined();
            expect(calls).toEqual({ length: index + 1, snapshot: 0 });
          });
        });
        test(`${inventory.name}: snapshot ${outcome} at ${field} follows all trusted lengths`, async () => {
          await withFreshFrameModule({ byteFailure: { phase: "snapshot", occurrence: index + 1, outcome } }, (module, calls) => {
            expect(module[inventory.builder === buildSourceObservationFrame ? "buildSourceObservationFrame" : inventory.builder === buildManifestAuthorityFrame ? "buildManifestAuthorityFrame" : "buildEntryAuthorityFrame"](inventory.fixture())).toBeUndefined();
            expect(calls).toEqual({ length: byteFields.length, snapshot: index + 1 });
          });
        });
      }
    }
  }
});

const capturedOuterOperationNames = ["Array.isArray", "Object.getPrototypeOf", "Reflect.ownKeys", "Object.getOwnPropertyDescriptor"] as const;
type CapturedOuterOperation = (typeof capturedOuterOperationNames)[number];

async function withThrowingCapturedOuterOperation<Result>(
  operation: CapturedOuterOperation,
  input: object,
  run: (module: FreshFrameModule, calls: { operation: number }) => Promise<Result> | Result
): Promise<Result> {
  const calls = { operation: 0 };
  const originals = {
    isArray: Array.isArray,
    getPrototypeOf: Object.getPrototypeOf,
    ownKeys: Reflect.ownKeys,
    getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor
  };
  const failForInput = <Value>(value: object, original: () => Value): Value => {
    if (value === input) {
      calls.operation += 1;
      throw new Error(`test-owned captured ${operation} failure`);
    }
    return original();
  };
  try {
    if (operation === "Array.isArray") {
      Array.isArray = ((value: unknown) => failForInput(value as object, () => originals.isArray(value))) as typeof Array.isArray;
    } else if (operation === "Object.getPrototypeOf") {
      Object.getPrototypeOf = ((value: object) => failForInput(value, () => originals.getPrototypeOf(value))) as typeof Object.getPrototypeOf;
    } else if (operation === "Reflect.ownKeys") {
      Reflect.ownKeys = ((value: object) => failForInput(value, () => originals.ownKeys(value))) as typeof Reflect.ownKeys;
    } else {
      Object.getOwnPropertyDescriptor = ((value: object, property: PropertyKey) => failForInput(value, () => originals.getOwnPropertyDescriptor(value, property))) as typeof Object.getOwnPropertyDescriptor;
    }
    vi.resetModules();
    const module = await import("../src/secret-commitment-contract.js");
    return await run(module, calls);
  } finally {
    Array.isArray = originals.isArray;
    Object.getPrototypeOf = originals.getPrototypeOf;
    Reflect.ownKeys = originals.ownKeys;
    Object.getOwnPropertyDescriptor = originals.getOwnPropertyDescriptor;
    vi.resetModules();
  }
}

async function withUnavailableCapturedOuterOperation<Result>(
  operation: CapturedOuterOperation,
  availability: "missing" | "malformed",
  run: (module: FreshFrameModule) => Promise<Result> | Result
): Promise<Result> {
  const originals = {
    isArray: Array.isArray,
    getPrototypeOf: Object.getPrototypeOf,
    ownKeys: Reflect.ownKeys,
    getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor
  };
  const descriptors = {
    isArray: Object.getOwnPropertyDescriptor(Array, "isArray") as PropertyDescriptor,
    getPrototypeOf: Object.getOwnPropertyDescriptor(Object, "getPrototypeOf") as PropertyDescriptor,
    ownKeys: Object.getOwnPropertyDescriptor(Reflect, "ownKeys") as PropertyDescriptor,
    getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor(Object, "getOwnPropertyDescriptor") as PropertyDescriptor
  };
  const replacement = availability === "missing" ? undefined : 0;
  vi.resetModules();
  vi.doMock("../src/secret-commitment-bytes.js", () => ({
    trustedCanonicalSecretCommitmentByteLength() {
      throw new Error("classifier must fail before trusted byte lengths");
    },
    snapshotCanonicalSecretCommitmentBytes() {
      throw new Error("classifier must fail before byte snapshots");
    }
  }));
  try {
    if (operation === "Array.isArray") {
      Object.defineProperty(Array, "isArray", {
        configurable: true,
        get() {
          return new Error().stack?.includes("secret-commitment-contract.ts") ? replacement : originals.isArray;
        }
      });
    } else if (operation === "Object.getPrototypeOf") {
      Object.defineProperty(Object, "getPrototypeOf", { configurable: true, value: replacement });
    } else if (operation === "Reflect.ownKeys") {
      Object.defineProperty(Reflect, "ownKeys", { configurable: true, value: replacement });
    } else {
      Object.defineProperty(Object, "getOwnPropertyDescriptor", { configurable: true, value: replacement });
    }
    const module = await import("../src/secret-commitment-contract.js");
    Object.defineProperty(Array, "isArray", descriptors.isArray);
    Object.defineProperty(Object, "getPrototypeOf", descriptors.getPrototypeOf);
    Object.defineProperty(Reflect, "ownKeys", descriptors.ownKeys);
    Object.defineProperty(Object, "getOwnPropertyDescriptor", descriptors.getOwnPropertyDescriptor);
    return await run(module);
  } finally {
    Object.defineProperty(Array, "isArray", descriptors.isArray);
    Object.defineProperty(Object, "getPrototypeOf", descriptors.getPrototypeOf);
    Object.defineProperty(Reflect, "ownKeys", descriptors.ownKeys);
    Object.defineProperty(Object, "getOwnPropertyDescriptor", descriptors.getOwnPropertyDescriptor);
    vi.doUnmock("../src/secret-commitment-bytes.js");
    vi.resetModules();
  }
}

async function withCapturedThenMutatedLiveOuterOperation<Result>(
  operation: CapturedOuterOperation,
  input: object,
  run: (module: FreshFrameModule, calls: { captured: number; live: number }) => Promise<Result> | Result
): Promise<Result> {
  const calls = { captured: 0, live: 0 };
  const originals = { isArray: Array.isArray, getPrototypeOf: Object.getPrototypeOf, ownKeys: Reflect.ownKeys, getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor };
  const captured = <Value>(value: object, original: () => Value): Value => value === input ? (calls.captured += 1, original()) : original();
  const live = <Value>(value: object, original: () => Value): Value => {
    if (value === input) {
      calls.live += 1;
      throw new Error(`live ${operation} must not be used after capture`);
    }
    return original();
  };
  try {
    if (operation === "Array.isArray") Array.isArray = ((value: unknown) => captured(value as object, () => originals.isArray(value))) as typeof Array.isArray;
    else if (operation === "Object.getPrototypeOf") Object.getPrototypeOf = ((value: object) => captured(value, () => originals.getPrototypeOf(value))) as typeof Object.getPrototypeOf;
    else if (operation === "Reflect.ownKeys") Reflect.ownKeys = ((value: object) => captured(value, () => originals.ownKeys(value))) as typeof Reflect.ownKeys;
    else Object.getOwnPropertyDescriptor = ((value: object, property: PropertyKey) => captured(value, () => originals.getOwnPropertyDescriptor(value, property))) as typeof Object.getOwnPropertyDescriptor;
    vi.resetModules();
    const module = await import("../src/secret-commitment-contract.js");
    Array.isArray = ((value: unknown) => live(value as object, () => originals.isArray(value))) as typeof Array.isArray;
    Object.getPrototypeOf = ((value: object) => live(value, () => originals.getPrototypeOf(value))) as typeof Object.getPrototypeOf;
    Reflect.ownKeys = ((value: object) => live(value, () => originals.ownKeys(value))) as typeof Reflect.ownKeys;
    Object.getOwnPropertyDescriptor = ((value: object, property: PropertyKey) => live(value, () => originals.getOwnPropertyDescriptor(value, property))) as typeof Object.getOwnPropertyDescriptor;
    return await run(module, calls);
  } finally {
    Array.isArray = originals.isArray;
    Object.getPrototypeOf = originals.getPrototypeOf;
    Reflect.ownKeys = originals.ownKeys;
    Object.getOwnPropertyDescriptor = originals.getOwnPropertyDescriptor;
    vi.resetModules();
  }
}

async function withUnavailableCapturedIsProxy<Result>(
  unavailable: undefined | null,
  run: (module: FreshFrameModule) => Promise<Result> | Result
): Promise<Result> {
  vi.resetModules();
  vi.doMock("node:util/types", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:util/types")>();
    return { ...actual, isProxy: unavailable as never };
  });
  try {
    const module = await import("../src/secret-commitment-contract.js");
    vi.doUnmock("node:util/types");
    return await run(module);
  } finally {
    vi.doUnmock("node:util/types");
    vi.resetModules();
  }
}

describe("secret commitment frame-builder captured classifier and reflection seams", () => {
  test("isProxy uses its module-evaluation binding after the exported live binding changes", async () => {
    const input = sourceFrameFixture();
    const calls = { captured: 0, live: 0 };
    let currentIsProxy: (value: object) => boolean = (value) => {
      if (value === input) calls.captured += 1;
      return false;
    };
    vi.resetModules();
    vi.doMock("node:util/types", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:util/types")>();
      const module = { ...actual } as Record<string, unknown>;
      Object.defineProperty(module, "isProxy", { enumerable: true, get: () => currentIsProxy });
      return module;
    });
    vi.doMock("../src/secret-commitment-bytes.js", () => ({
      trustedCanonicalSecretCommitmentByteLength(value: unknown) {
        return value instanceof Uint8Array ? value.length : undefined;
      },
      snapshotCanonicalSecretCommitmentBytes(value: unknown) {
        return value instanceof Uint8Array ? Uint8Array.from(value) : undefined;
      }
    }));
    try {
      const module = await import("../src/secret-commitment-contract.js");
      currentIsProxy = () => { calls.live += 1; throw new Error("live isProxy must not be used"); };
      expect(module.buildSourceObservationFrame(input)).toEqual(frameBytes(observationFrameHex));
      expect(calls).toEqual({ captured: 1, live: 0 });
    } finally {
      vi.doUnmock("node:util/types");
      vi.doUnmock("../src/secret-commitment-bytes.js");
      vi.resetModules();
    }
  });

  test("Proxy-first classifier stops before later reflection and caller traps", async () => {
    const calls = { isProxy: 0, array: 0, prototype: 0, keys: 0, descriptor: 0, traps: 0, accessors: 0 };
    const target = frameValues(sourceFrameFixture());
    Object.defineProperty(target, "workspaceId", { enumerable: true, get() { calls.accessors += 1; throw new Error("accessor"); } });
    const input = new Proxy(target, { get() { calls.traps += 1; throw new Error("trap"); } });
    const originals = { isArray: Array.isArray, getPrototypeOf: Object.getPrototypeOf, ownKeys: Reflect.ownKeys, getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor };
    try {
      Array.isArray = ((value: unknown) => { if (value === input) { calls.array += 1; throw new Error("array"); } return originals.isArray(value); }) as typeof Array.isArray;
      Object.getPrototypeOf = ((value: object) => { if (value === input) { calls.prototype += 1; throw new Error("prototype"); } return originals.getPrototypeOf(value); }) as typeof Object.getPrototypeOf;
      Reflect.ownKeys = ((value: object) => { if (value === input) { calls.keys += 1; throw new Error("keys"); } return originals.ownKeys(value); }) as typeof Reflect.ownKeys;
      Object.getOwnPropertyDescriptor = ((value: object, property: PropertyKey) => { if (value === input) { calls.descriptor += 1; throw new Error("descriptor"); } return originals.getOwnPropertyDescriptor(value, property); }) as typeof Object.getOwnPropertyDescriptor;
      await withFreshFrameModule({ isProxy(value) { if (value === input) calls.isProxy += 1; return value === input; } }, (module) => {
        expect(module.buildSourceObservationFrame(input)).toBeUndefined();
        expect(calls).toEqual({ isProxy: 1, array: 0, prototype: 0, keys: 0, descriptor: 0, traps: 0, accessors: 0 });
      });
    } finally {
      Array.isArray = originals.isArray;
      Object.getPrototypeOf = originals.getPrototypeOf;
      Reflect.ownKeys = originals.ownKeys;
      Object.getOwnPropertyDescriptor = originals.getOwnPropertyDescriptor;
    }
  });

  for (const availability of [undefined, null] as const) {
    test(`${availability === undefined ? "missing" : "malformed"} captured isProxy remains unavailable after live restoration`, async () => {
      const input = sourceFrameFixture();
      await withUnavailableCapturedIsProxy(availability, (module) => {
        expect(module.buildSourceObservationFrame(input)).toBeUndefined();
      });
    });
  }

  test("throwing captured isProxy fails closed without caller Proxy traps or accessors", async () => {
    const calls = { classifier: 0, traps: 0, accessor: 0 };
    const target = frameValues(sourceFrameFixture());
    Object.defineProperty(target, "workspaceId", {
      configurable: true,
      enumerable: true,
      get() {
        calls.accessor += 1;
        throw new Error("caller accessor must not run");
      }
    });
    const input = new Proxy(target, {
      get() {
        calls.traps += 1;
        throw new Error("caller Proxy trap must not run");
      }
    });
    await withFreshFrameModule({ isProxy() { calls.classifier += 1; throw new Error("test-owned captured isProxy failure"); } }, (module) => {
      expect(module.buildSourceObservationFrame(input)).toBeUndefined();
      expect(calls).toEqual({ classifier: 1, traps: 0, accessor: 0 });
    });
  });

  for (const operation of capturedOuterOperationNames) {
    test(`fresh captured ${operation} exception fails closed without caller accessor invocation`, async () => {
      const calls = { accessor: 0 };
      const input = frameValues(sourceFrameFixture());
      Object.defineProperty(input, "workspaceId", {
        configurable: true,
        enumerable: true,
        get() {
          calls.accessor += 1;
          throw new Error("caller accessor must not run");
        }
      });
      await withThrowingCapturedOuterOperation(operation, input, (module, seam) => {
        expect(module.buildSourceObservationFrame(input)).toBeUndefined();
        expect(seam.operation).toBe(1);
        expect(calls.accessor).toBe(0);
      });
    });
  }

  for (const operation of capturedOuterOperationNames) {
    test(`${operation} remains captured after its live runtime operation changes`, async () => {
      const input = sourceFrameFixture();
      await withCapturedThenMutatedLiveOuterOperation(operation, input, (module, calls) => {
        expect(module.buildSourceObservationFrame(input)).toEqual(frameBytes(observationFrameHex));
        expect(calls).toEqual({ captured: operation === "Object.getOwnPropertyDescriptor" ? 6 : 1, live: 0 });
      });
    });
  }

  for (const operation of capturedOuterOperationNames) {
    for (const availability of ["missing", "malformed"] as const) {
      test(`${availability} captured ${operation} fails closed without caller Proxy traps`, async () => {
        const input = sourceFrameFixture();
        await withUnavailableCapturedOuterOperation(operation, availability, (module) => {
          expect(module.buildSourceObservationFrame(input)).toBeUndefined();
        });
      });
    }
  }
});

const capturedWriteOperationNames = ["frame allocation", "TextEncoder.encodeInto", "header write", "copied-field write"] as const;
type CapturedWriteOperation = (typeof capturedWriteOperationNames)[number];

async function withThrowingCapturedWriteOperation<Result>(
  operation: CapturedWriteOperation,
  frameLength: number,
  run: (module: FreshFrameModule, calls: { operation: number }) => Promise<Result> | Result
): Promise<Result> {
  const calls = { operation: 0 };
  const module = await sharedCapturedWriteFrameModule();
  sharedCapturedWriteRun = { operation, frameLength, calls };
  try {
    return await run(module, calls);
  } finally {
    sharedCapturedWriteRun = undefined;
  }
}

let sharedCapturedWriteRun: {
  readonly operation: CapturedWriteOperation;
  readonly frameLength: number;
  readonly calls: { operation: number };
} | undefined;
let sharedCapturedWriteModulePromise: Promise<FreshFrameModule> | undefined;

function sharedCapturedWriteFrameModule(): Promise<FreshFrameModule> {
  sharedCapturedWriteModulePromise ??= (async () => {
    const originalUint8Array = globalThis.Uint8Array;
    const originalEncodeInto = TextEncoder.prototype.encodeInto;
    const originalSetBigUint64 = DataView.prototype.setBigUint64;
    const originalSet = Uint8Array.prototype.set;
    try {
      Object.defineProperty(globalThis, "Uint8Array", {
        configurable: true,
        value: new Proxy(originalUint8Array, {
          construct(_target, argumentsList) {
            const active = sharedCapturedWriteRun;
            if (active?.operation === "frame allocation" && argumentsList[0] === active.frameLength) {
              active.calls.operation += 1;
              throw new Error("test-owned frame allocation failure");
            }
            return Reflect.construct(originalUint8Array, argumentsList, originalUint8Array);
          }
        })
      });
      TextEncoder.prototype.encodeInto = function encodeIntoFailure(source: string, destination: Uint8Array): TextEncoderEncodeIntoResult {
        const active = sharedCapturedWriteRun;
        if (active?.operation === "TextEncoder.encodeInto" && destination.buffer.byteLength === active.frameLength) {
          active.calls.operation += 1;
          throw new Error("test-owned encodeInto failure");
        }
        return originalEncodeInto.call(this, source, destination);
      };
      DataView.prototype.setBigUint64 = function headerWriteFailure(byteOffset: number, value: bigint, littleEndian?: boolean): void {
        const active = sharedCapturedWriteRun;
        if (active?.operation === "header write" && this.buffer.byteLength === active.frameLength) {
          active.calls.operation += 1;
          throw new Error("test-owned header write failure");
        }
        return originalSetBigUint64.call(this, byteOffset, value, littleEndian);
      };
      Uint8Array.prototype.set = function copiedFieldWriteFailure(source: ArrayLike<number>, offset?: number): void {
        const active = sharedCapturedWriteRun;
        if (active?.operation === "copied-field write" && this.buffer.byteLength === active.frameLength) {
          active.calls.operation += 1;
          throw new Error("test-owned copied-field write failure");
        }
        return originalSet.call(this, source, offset);
      };
      vi.resetModules();
      return await import("../src/secret-commitment-contract.js");
    } finally {
      Object.defineProperty(globalThis, "Uint8Array", { configurable: true, value: originalUint8Array });
      TextEncoder.prototype.encodeInto = originalEncodeInto;
      DataView.prototype.setBigUint64 = originalSetBigUint64;
      Uint8Array.prototype.set = originalSet;
      vi.resetModules();
    }
  })();
  return sharedCapturedWriteModulePromise;
}

describe("secret commitment frame-builder captured allocation and write seams", () => {
  for (const operation of capturedWriteOperationNames) {
    for (const inventory of frameInventories) {
      test(`${inventory.name}: fresh captured ${operation} exception returns undefined`, async () => {
      const input = inventory.fixture();
      await withThrowingCapturedWriteOperation(operation, inventory.expectedLength, (module, calls) => {
        expect(invokeFreshBuilder(module, inventory, input)).toBeUndefined();
        expect(calls.operation).toBe(1);
      });
    });
    }
  }
});

type SuccessfulWriteTraceEvent =
  | { readonly operation: "encodeInto"; readonly source: string; readonly destinationOffset: number }
  | { readonly operation: "header"; readonly byteOffset: number; readonly value: bigint; readonly littleEndian: boolean }
  | { readonly operation: "copy"; readonly source: unknown; readonly destinationOffset: number };

type ExpectedSuccessfulWriteTraceEvent =
  | Extract<SuccessfulWriteTraceEvent, { readonly operation: "encodeInto" }>
  | Extract<SuccessfulWriteTraceEvent, { readonly operation: "header" }>
  | {
    readonly operation: "copy";
    readonly source: { readonly kind: "static"; readonly bytes: Uint8Array } | { readonly kind: "snapshot"; readonly value: Uint8Array };
    readonly destinationOffset: number;
  };

function staticFramePrefix(inventory: FrameInventory): Uint8Array {
  return frameBytes(inventory.name === "source observation"
    ? "6365737475732e736f757263652d6f62736572766174696f6e2e763100"
    : "736f757263652d6d616e69666573742d617574686f726974792e763100");
}

function staticRecordClass(inventory: FrameInventory): Uint8Array | undefined {
  return inventory.name === "manifest authority"
    ? frameBytes("6d616e6966657374")
    : inventory.name === "entry authority"
      ? frameBytes("656e747279")
      : undefined;
}

function expectedSuccessfulWriteTrace(
  inventory: FrameInventory,
  input: FrameInput,
  snapshots: Readonly<Record<string, Uint8Array>>
): readonly ExpectedSuccessfulWriteTraceEvent[] {
  const values = frameValues(input);
  const expected: ExpectedSuccessfulWriteTraceEvent[] = [];
  const prefix = staticFramePrefix(inventory);
  let offset = 0;
  expected.push({ operation: "copy", source: { kind: "static", bytes: prefix }, destinationOffset: offset });
  offset += prefix.length;

  const addHeader = (length: number): void => {
    expected.push({ operation: "header", byteOffset: offset + 1, value: BigInt(length), littleEndian: false });
    offset += 9;
  };

  const recordClass = staticRecordClass(inventory);
  if (recordClass !== undefined) {
    addHeader(recordClass.length);
    expected.push({ operation: "copy", source: { kind: "static", bytes: recordClass }, destinationOffset: offset });
    offset += recordClass.length;
  }

  for (const field of inventory.idFields) {
    const value = values[field] as string;
    const length = new TextEncoder().encode(value).length;
    addHeader(length);
    expected.push({ operation: "encodeInto", source: value, destinationOffset: offset });
    offset += length;
  }

  for (const field of [...inventory.fixedByteFields, inventory.payloadField]) {
    const snapshot = snapshots[field];
    if (snapshot === undefined) {
      throw new Error(`missing retained snapshot sentinel for ${field}`);
    }
    addHeader(snapshot.length);
    expected.push({ operation: "copy", source: { kind: "snapshot", value: snapshot }, destinationOffset: offset });
    offset += snapshot.length;
  }

  expect(offset).toBe(inventory.expectedLength);
  return expected;
}

function expectSuccessfulWriteTrace(
  trace: readonly SuccessfulWriteTraceEvent[],
  expected: readonly ExpectedSuccessfulWriteTraceEvent[]
): void {
  expect(trace).toHaveLength(expected.length);
  expect(trace.map((event) => event.operation)).toEqual(expected.map((event) => event.operation));
  for (const [index, expectedEvent] of expected.entries()) {
    const actual = trace[index];
    if (actual === undefined) {
      throw new Error(`missing production write event at index ${index}`);
    }
    if (expectedEvent.operation === "copy") {
      expect(actual).toMatchObject({ operation: "copy", destinationOffset: expectedEvent.destinationOffset });
      if (actual.operation !== "copy") {
        throw new Error(`expected production copy event at index ${index}`);
      }
      if (expectedEvent.source.kind === "static") {
        expect(actual.source).toBeInstanceOf(Uint8Array);
        expect(Array.from(actual.source as Uint8Array)).toEqual(Array.from(expectedEvent.source.bytes));
      } else {
        expect(actual.source).toBe(expectedEvent.source.value);
      }
    } else {
      expect(actual).toEqual(expectedEvent);
    }
  }
}

async function withCapturedSuccessfulWriteTrace<Result>(
  inventory: FrameInventory,
  run: (
    module: FreshFrameModule,
    input: FrameInput,
    snapshots: Readonly<Record<string, Uint8Array>>,
    trace: readonly SuccessfulWriteTraceEvent[]
  ) => Promise<Result> | Result
): Promise<Result> {
  const input = inventory.fixture();
  const values = frameValues(input);
  const fields = [...inventory.fixedByteFields, inventory.payloadField];
  const snapshots = Object.fromEntries(fields.map((field) => [field, Uint8Array.from(values[field] as Uint8Array)])) as Record<string, Uint8Array>;
  const snapshotsByInput = new Map<unknown, Uint8Array>(fields.map((field) => [values[field], snapshots[field] as Uint8Array]));
  const trace: SuccessfulWriteTraceEvent[] = [];
  const module = await sharedSuccessfulWriteTraceFrameModule();
  sharedSuccessfulWriteTraceRun = { snapshotsByInput, trace };
  try {
    return await run(module, input, snapshots, trace);
  } finally {
    sharedSuccessfulWriteTraceRun = undefined;
  }
}

let sharedSuccessfulWriteTraceRun: {
  readonly snapshotsByInput: ReadonlyMap<unknown, Uint8Array>;
  readonly trace: SuccessfulWriteTraceEvent[];
} | undefined;
let sharedSuccessfulWriteTraceModulePromise: Promise<FreshFrameModule> | undefined;

function sharedSuccessfulWriteTraceFrameModule(): Promise<FreshFrameModule> {
  sharedSuccessfulWriteTraceModulePromise ??= (async () => {
  const originalEncodeInto = TextEncoder.prototype.encodeInto;
  const originalSetBigUint64 = DataView.prototype.setBigUint64;
  const originalSet = Uint8Array.prototype.set;
  vi.resetModules();
  vi.doMock("../src/secret-commitment-bytes.js", () => ({
    trustedCanonicalSecretCommitmentByteLength(value: unknown) {
      return value instanceof Uint8Array ? value.length : undefined;
    },
    snapshotCanonicalSecretCommitmentBytes(value: unknown) {
      return sharedSuccessfulWriteTraceRun?.snapshotsByInput.get(value);
    }
  }));
  try {
    TextEncoder.prototype.encodeInto = function capturedEncodeInto(source: string, destination: Uint8Array): TextEncoderEncodeIntoResult {
      sharedSuccessfulWriteTraceRun?.trace.push({ operation: "encodeInto", source, destinationOffset: destination.byteOffset });
      return originalEncodeInto.call(this, source, destination);
    };
    DataView.prototype.setBigUint64 = function capturedHeaderWrite(byteOffset: number, value: bigint, littleEndian?: boolean): void {
      sharedSuccessfulWriteTraceRun?.trace.push({ operation: "header", byteOffset: this.byteOffset + byteOffset, value, littleEndian: littleEndian === true });
      return originalSetBigUint64.call(this, byteOffset, value, littleEndian);
    };
    Uint8Array.prototype.set = function capturedCopy(source: ArrayLike<number>, offset?: number): void {
      sharedSuccessfulWriteTraceRun?.trace.push({ operation: "copy", source, destinationOffset: this.byteOffset + (offset ?? 0) });
      return originalSet.call(this, source, offset);
    };
    return await import("../src/secret-commitment-contract.js");
  } finally {
    TextEncoder.prototype.encodeInto = originalEncodeInto;
    DataView.prototype.setBigUint64 = originalSetBigUint64;
    Uint8Array.prototype.set = originalSet;
    vi.doUnmock("../src/secret-commitment-bytes.js");
    vi.resetModules();
  }
  })();
  return sharedSuccessfulWriteTraceModulePromise;
}

describe("secret commitment frame-builder successful captured write traces", () => {
  for (const inventory of frameInventories) {
    test(`${inventory.name}: retains every snapshot identity and performs the exact successful header and copy trace`, async () => {
      await withCapturedSuccessfulWriteTrace(inventory, (module, input, snapshots, trace) => {
        expect(invokeFreshBuilder(module, inventory, input)).toEqual(frameBytes(inventory.expectedHex));
        expectSuccessfulWriteTrace(trace, expectedSuccessfulWriteTrace(inventory, input, snapshots));
      });
    });
  }
});

interface ResourceOrderingCalls {
  length: number;
  snapshot: number;
  phaseOrder: ("length" | "snapshot")[];
  allocation: number;
  encoding: number;
  encodedArrays: number;
  header: number;
  copy: number;
}

async function withFreshResourceOrderingModule<Result>(
  expectedFrameLength: number,
  run: (module: FreshFrameModule, calls: ResourceOrderingCalls) => Promise<Result> | Result
): Promise<Result> {
  const calls: ResourceOrderingCalls = { length: 0, snapshot: 0, phaseOrder: [], allocation: 0, encoding: 0, encodedArrays: 0, header: 0, copy: 0 };
  const module = await sharedResourceOrderingFrameModule();
  sharedResourceOrderingRun = { expectedFrameLength, calls };
  try {
    return await run(module, calls);
  } finally {
    sharedResourceOrderingRun = undefined;
  }
}

let sharedResourceOrderingRun: { readonly expectedFrameLength: number; readonly calls: ResourceOrderingCalls } | undefined;
let sharedResourceOrderingModulePromise: Promise<FreshFrameModule> | undefined;

function sharedResourceOrderingFrameModule(): Promise<FreshFrameModule> {
  sharedResourceOrderingModulePromise ??= (async () => {
    const originalUint8Array = globalThis.Uint8Array;
    const originalEncodeInto = TextEncoder.prototype.encodeInto;
    const originalEncode = TextEncoder.prototype.encode;
    const originalSetBigUint64 = DataView.prototype.setBigUint64;
    const originalSet = Uint8Array.prototype.set;
    vi.resetModules();
    vi.doMock("../src/secret-commitment-bytes.js", () => ({
      trustedCanonicalSecretCommitmentByteLength(value: unknown) {
        const active = sharedResourceOrderingRun;
        if (active !== undefined) {
          active.calls.length += 1;
          active.calls.phaseOrder.push("length");
        }
        return value instanceof originalUint8Array ? value.length : undefined;
      },
      snapshotCanonicalSecretCommitmentBytes(value: unknown) {
        const active = sharedResourceOrderingRun;
        if (active !== undefined) {
          active.calls.snapshot += 1;
          active.calls.phaseOrder.push("snapshot");
        }
        return value instanceof originalUint8Array ? new originalUint8Array(value) : undefined;
      }
    }));
    try {
      Object.defineProperty(globalThis, "Uint8Array", {
        configurable: true,
        value: new Proxy(originalUint8Array, {
          construct(target, argumentsList) {
            const active = sharedResourceOrderingRun;
            if (active !== undefined && argumentsList[0] === active.expectedFrameLength) {
              active.calls.allocation += 1;
            }
            return Reflect.construct(target, argumentsList, target);
          }
        })
      });
      TextEncoder.prototype.encodeInto = function trackedEncodeInto(source: string, destination: Uint8Array): TextEncoderEncodeIntoResult {
        const active = sharedResourceOrderingRun;
        if (active !== undefined) active.calls.encoding += 1;
        return originalEncodeInto.call(this, source, destination);
      };
      TextEncoder.prototype.encode = function trackedEncode(source?: string): Uint8Array<ArrayBuffer> {
        const active = sharedResourceOrderingRun;
        if (active !== undefined) active.calls.encodedArrays += 1;
        return originalEncode.call(this, source) as Uint8Array<ArrayBuffer>;
      };
      DataView.prototype.setBigUint64 = function trackedHeaderWrite(byteOffset: number, value: bigint, littleEndian?: boolean): void {
        const active = sharedResourceOrderingRun;
        if (active !== undefined) active.calls.header += 1;
        return originalSetBigUint64.call(this, byteOffset, value, littleEndian);
      };
      Uint8Array.prototype.set = function trackedCopy(source: ArrayLike<number>, offset?: number): void {
        const active = sharedResourceOrderingRun;
        if (active !== undefined) active.calls.copy += 1;
        return originalSet.call(this, source, offset);
      };
      return await import("../src/secret-commitment-contract.js");
    } finally {
    Object.defineProperty(globalThis, "Uint8Array", { configurable: true, value: originalUint8Array });
    TextEncoder.prototype.encodeInto = originalEncodeInto;
    TextEncoder.prototype.encode = originalEncode;
    DataView.prototype.setBigUint64 = originalSetBigUint64;
    Uint8Array.prototype.set = originalSet;
    vi.doUnmock("../src/secret-commitment-bytes.js");
    vi.resetModules();
    }
  })();
  return sharedResourceOrderingModulePromise;
}

describe("secret commitment frame-builder resource ordering seam", () => {
  for (const inventory of frameInventories) {
    const byteFieldCount = inventory.fixedByteFields.length + 1;

    test(`${inventory.name}: an identifier larger than the complete frame ceiling rejects before any trusted byte length, snapshot, allocation, encoding, header, or copy work`, async () => {
      const input = withFrameField(
        inventory.fixture(),
        requiredFrameIdField(inventory),
        "x".repeat(8_454_145)
      );
      await withFreshResourceOrderingModule(8_454_145, (module, calls) => {
        expect(invokeFreshBuilder(module, inventory, input)).toBeUndefined();
        expect(calls).toEqual({ length: 0, snapshot: 0, phaseOrder: [], allocation: 0, encoding: 0, encodedArrays: 0, header: 0, copy: 0 });
      });
    });

    test(`${inventory.name}: an identifier ending in a high surrogate rejects before any trusted byte length, snapshot, allocation, encoding, header, or copy work`, async () => {
      const input = withFrameField(
        inventory.fixture(),
        requiredFrameIdField(inventory),
        "terminal-high-\uD800"
      );
      await withFreshResourceOrderingModule(
        independentlyCalculatedLength(inventory, frameValues(input)) + 1,
        (module, calls) => {
          expect(invokeFreshBuilder(module, inventory, input)).toBeUndefined();
          expect(calls).toEqual({ length: 0, snapshot: 0, phaseOrder: [], allocation: 0, encoding: 0, encodedArrays: 0, header: 0, copy: 0 });
        }
      );
    });

    test(`${inventory.name}: over-complete input completes all trusted lengths before zero snapshot, allocation, encoding, header, or copy work`, async () => {
      const base = inventory.fixture();
      const input = withFrameField(
        base,
        requiredFrameIdField(inventory),
        "x".repeat(8_454_145 - independentlyCalculatedLength(inventory, frameValues(base)) + 1)
      );
      await withFreshResourceOrderingModule(8_454_145, (module, calls) => {
        expect(invokeFreshBuilder(module, inventory, input)).toBeUndefined();
        expect(calls).toEqual({ length: byteFieldCount, snapshot: 0, phaseOrder: Array.from({ length: byteFieldCount }, () => "length"), allocation: 0, encoding: 0, encodedArrays: 0, header: 0, copy: 0 });
      });
    });

    test(`${inventory.name}: equal complete limit reaches every accepted resource seam only after all trusted lengths`, async () => {
      const base = inventory.fixture();
      const input = withFrameField(
        base,
        requiredFrameIdField(inventory),
        "x".repeat(8_454_144 - independentlyCalculatedLength(inventory, frameValues(base)) + 1)
      );
      await withFreshResourceOrderingModule(8_454_144, (module, calls) => {
        expect(invokeFreshBuilder(module, inventory, input)).toBeInstanceOf(Uint8Array);
        expect(calls.length).toBe(byteFieldCount);
        expect(calls.snapshot).toBe(byteFieldCount);
        expect(calls.phaseOrder).toEqual([
          ...Array.from({ length: byteFieldCount }, () => "length" as const),
          ...Array.from({ length: byteFieldCount }, () => "snapshot" as const)
        ]);
        expect(calls.allocation).toBe(1);
        expect(calls.encoding).toBeGreaterThan(0);
        expect(calls.encodedArrays).toBe(0);
        expect(calls.header).toBeGreaterThan(0);
        expect(calls.copy).toBeGreaterThan(0);
      });
    });
  }
});
