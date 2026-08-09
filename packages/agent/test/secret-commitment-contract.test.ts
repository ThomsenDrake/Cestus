import { describe, expect, test } from "vitest";
import {
  normalizeSecretCommitmentPublicRecord,
  type ComputeCommitmentResult,
  type EntryAuthorityCommitmentRecord,
  type ManifestAuthorityCommitmentRecord,
  type SecretCommitmentComputePort,
  type SecretCommitmentProfile,
  type SecretCommitmentPublicRecord,
  type SourceObservationCommitmentRecord,
  type VerifyCommitmentResult
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
    replacementRecordClass: "manifest"
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
    replacementRecordClass: "entry"
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
    replacementRecordClass: "manifest"
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

    expect(inventories).toHaveLength(3);
    expect(requiredFields).toBe(36);
    expect(forbiddenFields).toBe(12);
    expect(idFieldCount).toBe(16);
    expect(hexFieldCount).toBe(9);
    expect(requiredFields).toBe(11 + 12 + 13);
    expect(forbiddenFields).toBe(5 + 4 + 3);
    expect(idFieldCount * idValidValues.length).toBe(80);
    expect(idFieldCount * idInvalidValues.length).toBe(48);
    expect(hexFieldCount * invalidHexValues.length).toBe(45);
    expect(inventories.length * invalidKeyVersions.length).toBe(18);
    expect(inventories.length * 2).toBe(6);
    expect(inventories.filter((inventory) => inventory.replacementRecordClass !== undefined)).toHaveLength(3);
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
      const input = Object.assign({}, inventory.fixture());
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
      const transparentProxy = new Proxy(inventory.fixture(), {});
      const proxyCounter = { calls: 0 };
      const hostileProxy = throwingProxy(inventory.fixture(), proxyCounter);
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
      expect(proxyCounter.calls).toBe(0);
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
      }
      for (const field of inventory.hexFields) {
        for (const value of invalidHexValues) {
          cases.push({ label: `${field} rejects invalid hex`, value: withDataField(inventory.fixture(), field, value) });
        }
      }
      for (const value of invalidKeyVersions) {
        cases.push({ label: "keyVersion rejects invalid number", value: withDataField(inventory.fixture(), "keyVersion", value) });
      }

      expect(cases).toHaveLength(
        inventory.idFields.length * 3 + inventory.hexFields.length * 5 + invalidKeyVersions.length
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
  }
});
