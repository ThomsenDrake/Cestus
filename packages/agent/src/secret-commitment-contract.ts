import { isProxy } from "node:util/types";
import {
  snapshotCanonicalSecretCommitmentBytes,
  trustedCanonicalSecretCommitmentByteLength
} from "./secret-commitment-bytes.js";
import { parseSecretCommitmentFrameImpl } from "./secret-commitment-frame-parser.js";

export type SecretCommitmentProfile =
  | "cestus.source-observation.v1"
  | "source-manifest-authority.v1";

export interface SecretCommitmentKeyReference {
  readonly backendId: string;
  readonly keyId: string;
  readonly keyVersion: number;
}

export interface SourceObservationCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "cestus.source-observation.v1";
  readonly contractVersion: 1;
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly manifestEntryId: string;
  readonly nonceHex: string;
  readonly hmacHex: string;
}

export interface ManifestAuthorityCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "source-manifest-authority.v1";
  readonly contractVersion: 1;
  readonly recordClass: "manifest";
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHashHex: string;
  readonly publicManifestIdHex: string;
  readonly hmacHex: string;
}

export interface EntryAuthorityCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "source-manifest-authority.v1";
  readonly contractVersion: 1;
  readonly recordClass: "entry";
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHashHex: string;
  readonly publicManifestIdHex: string;
  readonly publicEntryIdHex: string;
  readonly hmacHex: string;
}

export type SecretCommitmentPublicRecord =
  | SourceObservationCommitmentRecord
  | ManifestAuthorityCommitmentRecord
  | EntryAuthorityCommitmentRecord;

export type ComputeCommitmentResult =
  | { readonly status: "computed"; readonly record: SecretCommitmentPublicRecord }
  | { readonly status: "rejected"; readonly reason: "invalid-profile" | "invalid-frame" | "invalid-record" }
  | {
    readonly status: "unavailable";
    readonly reason:
      | "authority-unavailable"
      | "backend-unavailable"
      | "key-unavailable"
      | "nonce-unavailable";
  };

export type VerifyCommitmentResult =
  | { readonly status: "valid" }
  | { readonly status: "mismatch" }
  | { readonly status: "unverifiable"; readonly reason: "key-lost" }
  | {
    readonly status: "rejected";
    readonly reason:
      | "invalid-profile"
      | "invalid-frame"
      | "invalid-record"
      | "record-reference-invalid";
  }
  | {
    readonly status: "unavailable";
    readonly reason: "authority-unavailable" | "backend-unavailable";
  };

export interface SecretCommitmentComputePort {
  computeCommitment(
    profile: SecretCommitmentProfile,
    frame: Uint8Array
  ): Promise<ComputeCommitmentResult>;
  verifyCommitment(
    profile: SecretCommitmentProfile,
    frame: Uint8Array,
    publicRecord: SecretCommitmentPublicRecord
  ): Promise<VerifyCommitmentResult>;
}

export interface SourceObservationFrameInput {
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly manifestEntryId: string;
  readonly nonce: Uint8Array;
  readonly observedBytes: Uint8Array;
}

export interface ManifestAuthorityFrameInput {
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHash: Uint8Array;
  readonly publicManifestId: Uint8Array;
  readonly protectedCanonicalManifestBytes: Uint8Array;
}

export interface EntryAuthorityFrameInput {
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHash: Uint8Array;
  readonly publicManifestId: Uint8Array;
  readonly publicEntryId: Uint8Array;
  readonly protectedCanonicalEntryBytes: Uint8Array;
}

export type ParsedSecretCommitmentFrame =
  | (Readonly<SourceObservationFrameInput> & {
      readonly profile: "cestus.source-observation.v1";
    })
  | (Readonly<ManifestAuthorityFrameInput> & {
      readonly profile: "source-manifest-authority.v1";
      readonly recordClass: "manifest";
    })
  | (Readonly<EntryAuthorityFrameInput> & {
      readonly profile: "source-manifest-authority.v1";
      readonly recordClass: "entry";
    });

export function buildSourceObservationFrame(input: unknown): Uint8Array | undefined {
  return buildSecretCommitmentFrame(input, sourceObservationFrameDefinition);
}

export function buildManifestAuthorityFrame(input: unknown): Uint8Array | undefined {
  return buildSecretCommitmentFrame(input, manifestAuthorityFrameDefinition);
}

export function buildEntryAuthorityFrame(input: unknown): Uint8Array | undefined {
  return buildSecretCommitmentFrame(input, entryAuthorityFrameDefinition);
}

export function parseSecretCommitmentFrame(frame: unknown): ParsedSecretCommitmentFrame | undefined {
  return parseSecretCommitmentFrameImpl(frame);
}

type FrameField =
  | { readonly kind: "id"; readonly key: string; readonly tag: number }
  | { readonly kind: "bytes"; readonly key: string; readonly tag: number; readonly limit: 32 | 8_388_608 };

interface FrameDefinition {
  readonly keys: readonly string[];
  readonly prefix: Uint8Array | undefined;
  readonly recordClass?: Uint8Array | undefined;
  readonly fields: readonly FrameField[];
}


interface CapturedFrameIntrinsics {
  readonly isProxy: (value: object) => boolean;
  readonly isArray: (value: unknown) => boolean;
  readonly objectPrototype: object;
  readonly getPrototypeOf: (value: object) => object | null;
  readonly ownKeys: (value: object) => PropertyKey[];
  readonly getOwnPropertyDescriptor: (value: object, key: PropertyKey) => PropertyDescriptor | undefined;
  readonly apply: (target: Function, thisArgument: unknown, argumentsList: ArrayLike<unknown>) => unknown;
  readonly uint8ArrayConstructor: typeof Uint8Array;
  readonly dataViewConstructor: typeof DataView;
  readonly textEncoderConstructor: typeof TextEncoder;
  readonly uint8ArraySet: Function;
  readonly uint8ArraySubarray: Function;
  readonly dataViewSetBigUint64: Function;
  readonly textEncoderEncodeInto: Function;
}

const maximumFrameLength = 8_454_144;
const fieldHeaderLength = 9;
const maximumSafeInteger = Number.MAX_SAFE_INTEGER;

const capturedFrameIntrinsics = captureFrameIntrinsics();
const sourceObservationPrefix = createStaticFrameBytes([
  0x63, 0x65, 0x73, 0x74, 0x75, 0x73, 0x2e, 0x73, 0x6f, 0x75, 0x72, 0x63, 0x65, 0x2d,
  0x6f, 0x62, 0x73, 0x65, 0x72, 0x76, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x2e, 0x76, 0x31, 0x00
]);
const authorityPrefix = createStaticFrameBytes([
  0x73, 0x6f, 0x75, 0x72, 0x63, 0x65, 0x2d, 0x6d, 0x61, 0x6e, 0x69, 0x66, 0x65, 0x73,
  0x74, 0x2d, 0x61, 0x75, 0x74, 0x68, 0x6f, 0x72, 0x69, 0x74, 0x79, 0x2e, 0x76, 0x31, 0x00
]);
const manifestRecordClass = createStaticFrameBytes([0x6d, 0x61, 0x6e, 0x69, 0x66, 0x65, 0x73, 0x74]);
const entryRecordClass = createStaticFrameBytes([0x65, 0x6e, 0x74, 0x72, 0x79]);

const sourceObservationFrameDefinition: FrameDefinition = {
  keys: ["workspaceId", "sourceCollectionId", "sourceBoundaryRevision", "manifestEntryId", "nonce", "observedBytes"],
  prefix: sourceObservationPrefix,
  fields: [
    { kind: "id", key: "workspaceId", tag: 1 },
    { kind: "id", key: "sourceCollectionId", tag: 2 },
    { kind: "id", key: "sourceBoundaryRevision", tag: 3 },
    { kind: "id", key: "manifestEntryId", tag: 4 },
    { kind: "bytes", key: "nonce", tag: 5, limit: 32 },
    { kind: "bytes", key: "observedBytes", tag: 6, limit: 8_388_608 }
  ]
};

const manifestAuthorityFrameDefinition: FrameDefinition = {
  keys: ["workspaceId", "sourceCollectionId", "sourceBoundaryRevision", "classificationPolicyHash", "publicManifestId", "protectedCanonicalManifestBytes"],
  prefix: authorityPrefix,
  recordClass: manifestRecordClass,
  fields: [
    { kind: "id", key: "workspaceId", tag: 2 },
    { kind: "id", key: "sourceCollectionId", tag: 3 },
    { kind: "id", key: "sourceBoundaryRevision", tag: 4 },
    { kind: "bytes", key: "classificationPolicyHash", tag: 5, limit: 32 },
    { kind: "bytes", key: "publicManifestId", tag: 6, limit: 32 },
    { kind: "bytes", key: "protectedCanonicalManifestBytes", tag: 8, limit: 8_388_608 }
  ]
};

const entryAuthorityFrameDefinition: FrameDefinition = {
  keys: ["workspaceId", "sourceCollectionId", "sourceBoundaryRevision", "classificationPolicyHash", "publicManifestId", "publicEntryId", "protectedCanonicalEntryBytes"],
  prefix: authorityPrefix,
  recordClass: entryRecordClass,
  fields: [
    { kind: "id", key: "workspaceId", tag: 2 },
    { kind: "id", key: "sourceCollectionId", tag: 3 },
    { kind: "id", key: "sourceBoundaryRevision", tag: 4 },
    { kind: "bytes", key: "classificationPolicyHash", tag: 5, limit: 32 },
    { kind: "bytes", key: "publicManifestId", tag: 6, limit: 32 },
    { kind: "bytes", key: "publicEntryId", tag: 7, limit: 32 },
    { kind: "bytes", key: "protectedCanonicalEntryBytes", tag: 8, limit: 8_388_608 }
  ]
};


function captureFrameIntrinsics(): CapturedFrameIntrinsics | undefined {
  try {
    const capturedIsProxy = isProxy;
    const capturedIsArray = Array.isArray;
    const capturedObjectPrototype = Object.prototype;
    const capturedGetPrototypeOf = Object.getPrototypeOf;
    const capturedOwnKeys = Reflect.ownKeys;
    const capturedGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const capturedApply = Reflect.apply;
    const capturedUint8ArrayConstructor = Uint8Array;
    const capturedDataViewConstructor = DataView;
    const capturedTextEncoderConstructor = TextEncoder;
    if (
      typeof capturedIsProxy !== "function" ||
      typeof capturedIsArray !== "function" ||
      typeof capturedGetPrototypeOf !== "function" ||
      typeof capturedOwnKeys !== "function" ||
      typeof capturedGetOwnPropertyDescriptor !== "function" ||
      typeof capturedApply !== "function" ||
      typeof capturedUint8ArrayConstructor !== "function" ||
      typeof capturedDataViewConstructor !== "function" ||
      typeof capturedTextEncoderConstructor !== "function"
    ) {
      return undefined;
    }
    const uint8ArraySet = capturedUint8ArrayConstructor.prototype.set;
    const uint8ArraySubarray = capturedUint8ArrayConstructor.prototype.subarray;
    const dataViewSetBigUint64 = capturedGetOwnPropertyDescriptor(capturedDataViewConstructor.prototype, "setBigUint64")?.value;
    const textEncoderEncodeInto = capturedGetOwnPropertyDescriptor(capturedTextEncoderConstructor.prototype, "encodeInto")?.value;
    if (
      typeof uint8ArraySet !== "function" ||
      typeof uint8ArraySubarray !== "function" ||
      typeof dataViewSetBigUint64 !== "function" ||
      typeof textEncoderEncodeInto !== "function"
    ) {
      return undefined;
    }
    return {
      isProxy: capturedIsProxy,
      isArray: capturedIsArray,
      objectPrototype: capturedObjectPrototype,
      getPrototypeOf: capturedGetPrototypeOf,
      ownKeys: capturedOwnKeys,
      getOwnPropertyDescriptor: capturedGetOwnPropertyDescriptor,
      apply: capturedApply,
      uint8ArrayConstructor: capturedUint8ArrayConstructor,
      dataViewConstructor: capturedDataViewConstructor,
      textEncoderConstructor: capturedTextEncoderConstructor,
      uint8ArraySet,
      uint8ArraySubarray,
      dataViewSetBigUint64,
      textEncoderEncodeInto
    };
  } catch {
    return undefined;
  }
}

function createStaticFrameBytes(values: readonly number[]): Uint8Array | undefined {
  try {
    return capturedFrameIntrinsics === undefined
      ? undefined
      : new capturedFrameIntrinsics.uint8ArrayConstructor(values);
  } catch {
    return undefined;
  }
}

function buildSecretCommitmentFrame(input: unknown, definition: FrameDefinition): Uint8Array | undefined {
  try {
    const intrinsics = capturedFrameIntrinsics;
    if (intrinsics === undefined || definition.prefix === undefined || (definition.recordClass === undefined && definition !== sourceObservationFrameDefinition)) {
      return undefined;
    }
    const properties = classifyExactFrameInput(input, definition.keys, intrinsics);
    if (properties === undefined) {
      return undefined;
    }

    const idLengths = new Map<string, number>();
    for (const field of definition.fields) {
      if (field.kind !== "id") {
        continue;
      }
      const length = scalarUtf8Length(properties.get(field.key));
      if (length === undefined) {
        return undefined;
      }
      idLengths.set(field.key, length);
    }

    const byteLengths = new Map<string, number>();
    for (const field of definition.fields) {
      if (field.kind !== "bytes") {
        continue;
      }
      const length = trustedCanonicalSecretCommitmentByteLength(properties.get(field.key), field.limit);
      if (length === undefined) {
        return undefined;
      }
      byteLengths.set(field.key, length);
    }

    let total: number | undefined = definition.prefix.length;
    if (definition.recordClass !== undefined) {
      total = checkedFrameLengthAdd(total, fieldHeaderLength);
      total = total === undefined ? undefined : checkedFrameLengthAdd(total, definition.recordClass.length);
    }
    if (total === undefined) {
      return undefined;
    }
    for (const field of definition.fields) {
      const valueLength = field.kind === "id" ? idLengths.get(field.key) : byteLengths.get(field.key);
      if (valueLength === undefined) {
        return undefined;
      }
      total = checkedFrameLengthAdd(total, fieldHeaderLength);
      total = total === undefined ? undefined : checkedFrameLengthAdd(total, valueLength);
      if (total === undefined) {
        return undefined;
      }
    }

    const snapshots = new Map<string, Uint8Array>();
    for (const field of definition.fields) {
      if (field.kind !== "bytes") {
        continue;
      }
      const snapshot = snapshotCanonicalSecretCommitmentBytes(properties.get(field.key), field.limit);
      if (snapshot === undefined || snapshot.length !== byteLengths.get(field.key)) {
        return undefined;
      }
      snapshots.set(field.key, snapshot);
    }

    const frame = new intrinsics.uint8ArrayConstructor(total);
    const view = new intrinsics.dataViewConstructor(frame.buffer);
    const encoder = new intrinsics.textEncoderConstructor();
    let offset = 0;
    copyFrameBytes(intrinsics, frame, definition.prefix, offset);
    offset += definition.prefix.length;
    if (definition.recordClass !== undefined) {
      offset = writeFrameHeader(intrinsics, frame, view, offset, 1, definition.recordClass.length);
      copyFrameBytes(intrinsics, frame, definition.recordClass, offset);
      offset += definition.recordClass.length;
    }
    for (const field of definition.fields) {
      const length = field.kind === "id" ? idLengths.get(field.key) : byteLengths.get(field.key);
      if (length === undefined) {
        return undefined;
      }
      offset = writeFrameHeader(intrinsics, frame, view, offset, field.tag, length);
      if (field.kind === "id") {
        const value = properties.get(field.key);
        if (typeof value !== "string" || !encodeFrameIdentifier(intrinsics, encoder, frame, offset, length, value)) {
          return undefined;
        }
      } else {
        const snapshot = snapshots.get(field.key);
        if (snapshot === undefined) {
          return undefined;
        }
        copyFrameBytes(intrinsics, frame, snapshot, offset);
      }
      offset += length;
    }
    return offset === total ? frame : undefined;
  } catch {
    return undefined;
  }
}

function classifyExactFrameInput(
  value: unknown,
  requiredKeys: readonly string[],
  intrinsics: CapturedFrameIntrinsics
): ReadonlyMap<string, unknown> | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  if (intrinsics.isProxy(value)) {
    return undefined;
  }
  if (intrinsics.isArray(value) || intrinsics.getPrototypeOf(value) !== intrinsics.objectPrototype) {
    return undefined;
  }
  const keys = intrinsics.ownKeys(value);
  if (keys.length !== requiredKeys.length) {
    return undefined;
  }
  const properties = new Map<string, unknown>();
  for (const key of keys) {
    if (typeof key !== "string" || !requiredKeys.includes(key)) {
      return undefined;
    }
    const descriptor = intrinsics.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
      return undefined;
    }
    properties.set(key, descriptor.value);
  }
  return properties.size === requiredKeys.length && requiredKeys.every((key) => properties.has(key)) ? properties : undefined;
}

function scalarUtf8Length(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  let length: number | undefined = 0;
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);
    if (first >= 0xd800 && first <= 0xdbff) {
      if (index + 1 >= value.length) {
        return undefined;
      }
      const second = value.charCodeAt(index + 1);
      if (second < 0xdc00 || second > 0xdfff) {
        return undefined;
      }
      index += 1;
      length = checkedScalarLengthAdd(length, 4);
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      return undefined;
    } else if (first <= 0x7f) {
      length = checkedScalarLengthAdd(length, 1);
    } else if (first <= 0x7ff) {
      length = checkedScalarLengthAdd(length, 2);
    } else {
      length = checkedScalarLengthAdd(length, 3);
    }
    if (length === undefined) {
      return undefined;
    }
  }
  return length;
}

function checkedScalarLengthAdd(total: number, increment: number): number | undefined {
  if (total > maximumSafeInteger - increment) {
    return undefined;
  }
  const next = total + increment;
  return next <= maximumFrameLength ? next : undefined;
}

function checkedFrameLengthAdd(total: number, increment: number): number | undefined {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(increment) || total < 0 || increment < 0 || total > maximumSafeInteger - increment) {
    return undefined;
  }
  const next = total + increment;
  return next <= maximumFrameLength ? next : undefined;
}

function copyFrameBytes(
  intrinsics: CapturedFrameIntrinsics,
  destination: Uint8Array,
  source: Uint8Array,
  offset: number
): void {
  intrinsics.apply(intrinsics.uint8ArraySet, destination, [source, offset]);
}

function writeFrameHeader(
  intrinsics: CapturedFrameIntrinsics,
  frame: Uint8Array,
  view: DataView,
  offset: number,
  tag: number,
  length: number
): number {
  frame[offset] = tag;
  intrinsics.apply(intrinsics.dataViewSetBigUint64, view, [offset + 1, BigInt(length)]);
  return offset + fieldHeaderLength;
}

function encodeFrameIdentifier(
  intrinsics: CapturedFrameIntrinsics,
  encoder: TextEncoder,
  frame: Uint8Array,
  offset: number,
  length: number,
  value: string
): boolean {
  const destination = intrinsics.apply(intrinsics.uint8ArraySubarray, frame, [offset, offset + length]);
  const result = intrinsics.apply(intrinsics.textEncoderEncodeInto, encoder, [value, destination]);
  return destination instanceof intrinsics.uint8ArrayConstructor
    && result !== null
    && typeof result === "object"
    && "read" in result
    && "written" in result
    && (result as TextEncoderEncodeIntoResult).read === value.length
    && (result as TextEncoderEncodeIntoResult).written === length;
}

export function normalizeSecretCommitmentPublicRecord(
  value: unknown
): SecretCommitmentPublicRecord | undefined {
  try {
    if (value === null || typeof value !== "object") {
      return undefined;
    }
    if (isProxy(value) || Array.isArray(value)) {
      return undefined;
    }

    const properties = collectExactOwnDataProperties(value);
    if (properties === undefined) {
      return undefined;
    }

    const profile = properties.get("profile");
    if (profile === "cestus.source-observation.v1") {
      return normalizeSourceObservationRecord(properties);
    }
    if (profile !== "source-manifest-authority.v1") {
      return undefined;
    }

    const recordClass = properties.get("recordClass");
    if (recordClass === "manifest") {
      return normalizeManifestAuthorityRecord(properties);
    }
    if (recordClass === "entry") {
      return normalizeEntryAuthorityRecord(properties);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const sourceObservationKeys = [
  "profile",
  "contractVersion",
  "workspaceId",
  "sourceCollectionId",
  "sourceBoundaryRevision",
  "manifestEntryId",
  "nonceHex",
  "hmacHex",
  "backendId",
  "keyId",
  "keyVersion"
];

const manifestAuthorityKeys = [
  "profile",
  "contractVersion",
  "recordClass",
  "workspaceId",
  "sourceCollectionId",
  "sourceBoundaryRevision",
  "classificationPolicyHashHex",
  "publicManifestIdHex",
  "hmacHex",
  "backendId",
  "keyId",
  "keyVersion"
];

const entryAuthorityKeys = [
  "profile",
  "contractVersion",
  "recordClass",
  "workspaceId",
  "sourceCollectionId",
  "sourceBoundaryRevision",
  "classificationPolicyHashHex",
  "publicManifestIdHex",
  "publicEntryIdHex",
  "hmacHex",
  "backendId",
  "keyId",
  "keyVersion"
];

function collectExactOwnDataProperties(value: object): ReadonlyMap<string, unknown> | undefined {
  try {
    if (
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.getOwnPropertySymbols(value).length !== 0
    ) {
      return undefined;
    }

    const properties = new Map<string, unknown>();
    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return undefined;
      }
      properties.set(key, descriptor.value);
    }
    return properties;
  } catch {
    return undefined;
  }
}

function hasExactKeys(properties: ReadonlyMap<string, unknown>, requiredKeys: readonly string[]): boolean {
  return properties.size === requiredKeys.length && requiredKeys.every((key) => properties.has(key));
}

function normalizeCommonKeyReference(
  properties: ReadonlyMap<string, unknown>
): SecretCommitmentKeyReference | undefined {
  const backendId = normalizeIdentifier(properties.get("backendId"));
  const keyId = normalizeIdentifier(properties.get("keyId"));
  const keyVersion = normalizeKeyVersion(properties.get("keyVersion"));
  if (backendId === undefined || keyId === undefined || keyVersion === undefined) {
    return undefined;
  }
  return { backendId, keyId, keyVersion };
}

function normalizeSourceObservationRecord(
  properties: ReadonlyMap<string, unknown>
): SourceObservationCommitmentRecord | undefined {
  if (
    !hasExactKeys(properties, sourceObservationKeys) ||
    properties.get("profile") !== "cestus.source-observation.v1" ||
    properties.get("contractVersion") !== 1
  ) {
    return undefined;
  }

  const workspaceId = normalizeIdentifier(properties.get("workspaceId"));
  const sourceCollectionId = normalizeIdentifier(properties.get("sourceCollectionId"));
  const sourceBoundaryRevision = normalizeIdentifier(properties.get("sourceBoundaryRevision"));
  const manifestEntryId = normalizeIdentifier(properties.get("manifestEntryId"));
  const nonceHex = normalizeHex(properties.get("nonceHex"));
  const hmacHex = normalizeHex(properties.get("hmacHex"));
  const common = normalizeCommonKeyReference(properties);
  if (
    workspaceId === undefined ||
    sourceCollectionId === undefined ||
    sourceBoundaryRevision === undefined ||
    manifestEntryId === undefined ||
    nonceHex === undefined ||
    hmacHex === undefined ||
    common === undefined
  ) {
    return undefined;
  }

  const record: SourceObservationCommitmentRecord = {
    profile: "cestus.source-observation.v1",
    contractVersion: 1,
    workspaceId,
    sourceCollectionId,
    sourceBoundaryRevision,
    manifestEntryId,
    nonceHex,
    hmacHex,
    backendId: common.backendId,
    keyId: common.keyId,
    keyVersion: common.keyVersion
  };
  return Object.freeze(record);
}

function normalizeManifestAuthorityRecord(
  properties: ReadonlyMap<string, unknown>
): ManifestAuthorityCommitmentRecord | undefined {
  if (
    !hasExactKeys(properties, manifestAuthorityKeys) ||
    properties.get("profile") !== "source-manifest-authority.v1" ||
    properties.get("contractVersion") !== 1 ||
    properties.get("recordClass") !== "manifest"
  ) {
    return undefined;
  }

  const workspaceId = normalizeIdentifier(properties.get("workspaceId"));
  const sourceCollectionId = normalizeIdentifier(properties.get("sourceCollectionId"));
  const sourceBoundaryRevision = normalizeIdentifier(properties.get("sourceBoundaryRevision"));
  const classificationPolicyHashHex = normalizeHex(properties.get("classificationPolicyHashHex"));
  const publicManifestIdHex = normalizeHex(properties.get("publicManifestIdHex"));
  const hmacHex = normalizeHex(properties.get("hmacHex"));
  const common = normalizeCommonKeyReference(properties);
  if (
    workspaceId === undefined ||
    sourceCollectionId === undefined ||
    sourceBoundaryRevision === undefined ||
    classificationPolicyHashHex === undefined ||
    publicManifestIdHex === undefined ||
    hmacHex === undefined ||
    common === undefined
  ) {
    return undefined;
  }

  const record: ManifestAuthorityCommitmentRecord = {
    profile: "source-manifest-authority.v1",
    contractVersion: 1,
    recordClass: "manifest",
    workspaceId,
    sourceCollectionId,
    sourceBoundaryRevision,
    classificationPolicyHashHex,
    publicManifestIdHex,
    hmacHex,
    backendId: common.backendId,
    keyId: common.keyId,
    keyVersion: common.keyVersion
  };
  return Object.freeze(record);
}

function normalizeEntryAuthorityRecord(
  properties: ReadonlyMap<string, unknown>
): EntryAuthorityCommitmentRecord | undefined {
  if (
    !hasExactKeys(properties, entryAuthorityKeys) ||
    properties.get("profile") !== "source-manifest-authority.v1" ||
    properties.get("contractVersion") !== 1 ||
    properties.get("recordClass") !== "entry"
  ) {
    return undefined;
  }

  const workspaceId = normalizeIdentifier(properties.get("workspaceId"));
  const sourceCollectionId = normalizeIdentifier(properties.get("sourceCollectionId"));
  const sourceBoundaryRevision = normalizeIdentifier(properties.get("sourceBoundaryRevision"));
  const classificationPolicyHashHex = normalizeHex(properties.get("classificationPolicyHashHex"));
  const publicManifestIdHex = normalizeHex(properties.get("publicManifestIdHex"));
  const publicEntryIdHex = normalizeHex(properties.get("publicEntryIdHex"));
  const hmacHex = normalizeHex(properties.get("hmacHex"));
  const common = normalizeCommonKeyReference(properties);
  if (
    workspaceId === undefined ||
    sourceCollectionId === undefined ||
    sourceBoundaryRevision === undefined ||
    classificationPolicyHashHex === undefined ||
    publicManifestIdHex === undefined ||
    publicEntryIdHex === undefined ||
    hmacHex === undefined ||
    common === undefined
  ) {
    return undefined;
  }

  const record: EntryAuthorityCommitmentRecord = {
    profile: "source-manifest-authority.v1",
    contractVersion: 1,
    recordClass: "entry",
    workspaceId,
    sourceCollectionId,
    sourceBoundaryRevision,
    classificationPolicyHashHex,
    publicManifestIdHex,
    publicEntryIdHex,
    hmacHex,
    backendId: common.backendId,
    keyId: common.keyId,
    keyVersion: common.keyVersion
  };
  return Object.freeze(record);
}

function normalizeIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(value)) === value
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeHex(value: unknown): string | undefined {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : undefined;
}

function normalizeKeyVersion(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
