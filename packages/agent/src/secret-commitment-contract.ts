import { isProxy } from "node:util/types";
import {
  snapshotCanonicalSecretCommitmentBytes,
  trustedCanonicalSecretCommitmentByteLength
} from "./secret-commitment-bytes.js";

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
  try {
    const intrinsics = capturedParserIntrinsics;
    const registries = parsedFrameRegistries;
    if (intrinsics === undefined || registries === undefined) {
      return undefined;
    }

    const snapshot = snapshotCanonicalSecretCommitmentBytes(frame, maximumFrameLength);
    if (snapshot === undefined || exactParserUint8ArrayShape(snapshot, intrinsics) === undefined) {
      return undefined;
    }

    const scan = scanExactSecretCommitmentFrame(snapshot, intrinsics);
    if (scan === undefined) {
      return undefined;
    }

    if (!hasExactRecordClass(snapshot, scan, intrinsics)) {
      return undefined;
    }

    const identifiers = decodeExactFrameIdentifiers(snapshot, scan, intrinsics, registries);
    if (identifiers === undefined) {
      return undefined;
    }

    const copiedFields = copyExactFrameBytes(snapshot, scan, intrinsics, registries);
    if (copiedFields === undefined) {
      return undefined;
    }

    const result = constructParsedSecretCommitmentFrame(scan, identifiers, copiedFields);
    return result === undefined || !freezeAndRegisterParsedFrame(snapshot, scan, identifiers, result, copiedFields, intrinsics, registries)
      ? undefined
      : result;
  } catch {
    return undefined;
  }
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

interface FrameSpan {
  readonly start: number;
  readonly end: number;
}

interface ParsedFrameScan {
  readonly definition: FrameDefinition;
  readonly spans: readonly FrameSpan[];
}

interface DecodedFrameIdentifiers {
  readonly values: readonly (string | undefined)[];
}

interface CopiedFrameField {
  readonly bytes: Uint8Array;
  readonly backing: ArrayBuffer;
  readonly span: FrameSpan;
}

interface CopiedFrameBytes {
  readonly fields: readonly (CopiedFrameField | undefined)[];
}

interface CapturedParserIntrinsics {
  readonly uint8ArrayConstructor: typeof Uint8Array;
  readonly uint8ArrayPrototype: object;
  readonly arrayBufferPrototype: object;
  readonly uint8ArraySubarray: Function;
  readonly typedArrayLengthGetter: Function;
  readonly typedArrayBufferGetter: Function;
  readonly textDecoder: TextDecoder;
  readonly textEncoder: TextEncoder;
  readonly textDecoderDecode: Function;
  readonly textEncoderEncode: Function;
  readonly apply: (target: Function, thisArgument: unknown, argumentsList: ArrayLike<unknown>) => unknown;
  readonly objectFreeze: <T extends object>(value: T) => T;
  readonly objectIsFrozen: (value: object) => boolean;
  readonly objectPrototype: object;
  readonly getPrototypeOf: (value: object) => object | null;
  readonly ownKeys: (value: object) => PropertyKey[];
  readonly getOwnPropertyDescriptor: (value: object, key: PropertyKey) => PropertyDescriptor | undefined;
  readonly arrayIsArray: (value: unknown) => boolean;
  readonly numberIsSafeInteger: (value: unknown) => boolean;
  readonly weakSetConstructor: typeof WeakSet;
  readonly weakSetHas: Function;
  readonly weakSetAdd: Function;
}

interface ParsedFrameRegistries {
  readonly outputs: WeakSet<object>;
  readonly buffers: WeakSet<object>;
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

const capturedParserIntrinsics = captureParserIntrinsics();
const parsedFrameRegistries = createParsedFrameRegistries(capturedParserIntrinsics);

function captureParserIntrinsics(): CapturedParserIntrinsics | undefined {
  try {
    const uint8ArrayConstructor = Uint8Array;
    const arrayBufferConstructor = ArrayBuffer;
    const textDecoderConstructor = TextDecoder;
    const textEncoderConstructor = TextEncoder;
    const apply = Reflect.apply;
    const objectFreeze = Object.freeze;
    const objectIsFrozen = Object.isFrozen;
    const objectPrototype = Object.prototype;
    const getPrototypeOf = Object.getPrototypeOf;
    const ownKeys = Reflect.ownKeys;
    const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const arrayIsArray = Array.isArray;
    const numberIsSafeInteger = Number.isSafeInteger;
    const weakSetConstructor = WeakSet;
    if (
      typeof uint8ArrayConstructor !== "function" ||
      typeof arrayBufferConstructor !== "function" ||
      typeof textDecoderConstructor !== "function" ||
      typeof textEncoderConstructor !== "function" ||
      typeof apply !== "function" ||
      typeof objectFreeze !== "function" ||
      typeof objectIsFrozen !== "function" ||
      typeof getPrototypeOf !== "function" ||
      typeof ownKeys !== "function" ||
      typeof getOwnPropertyDescriptor !== "function" ||
      typeof arrayIsArray !== "function" ||
      typeof numberIsSafeInteger !== "function" ||
      typeof weakSetConstructor !== "function"
    ) {
      return undefined;
    }
    const uint8ArrayPrototype = uint8ArrayConstructor.prototype;
    const arrayBufferPrototype = arrayBufferConstructor.prototype;
    const typedArrayPrototype = getPrototypeOf(uint8ArrayPrototype);
    const uint8ArraySubarray = uint8ArrayConstructor.prototype.subarray;
    const typedArrayLengthGetter = typedArrayPrototype === null
      ? undefined
      : getOwnPropertyDescriptor(typedArrayPrototype, "length")?.get;
    const typedArrayBufferGetter = typedArrayPrototype === null
      ? undefined
      : getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get;
    const textDecoderDecode = getOwnPropertyDescriptor(textDecoderConstructor.prototype, "decode")?.value;
    const textEncoderEncode = getOwnPropertyDescriptor(textEncoderConstructor.prototype, "encode")?.value;
    const textDecoderEncodingGetter = getOwnPropertyDescriptor(textDecoderConstructor.prototype, "encoding")?.get;
    const textDecoderFatalGetter = getOwnPropertyDescriptor(textDecoderConstructor.prototype, "fatal")?.get;
    const textDecoderIgnoreBomGetter = getOwnPropertyDescriptor(textDecoderConstructor.prototype, "ignoreBOM")?.get;
    const weakSetHas = getOwnPropertyDescriptor(weakSetConstructor.prototype, "has")?.value;
    const weakSetAdd = getOwnPropertyDescriptor(weakSetConstructor.prototype, "add")?.value;
    if (
      typeof uint8ArraySubarray !== "function" ||
      typeof typedArrayLengthGetter !== "function" ||
      typeof typedArrayBufferGetter !== "function" ||
      typeof textDecoderDecode !== "function" ||
      typeof textEncoderEncode !== "function" ||
      typeof textDecoderEncodingGetter !== "function" ||
      typeof textDecoderFatalGetter !== "function" ||
      typeof textDecoderIgnoreBomGetter !== "function" ||
      typeof weakSetHas !== "function" ||
      typeof weakSetAdd !== "function"
    ) {
      return undefined;
    }
    const textDecoder = new textDecoderConstructor("utf-8", { fatal: true, ignoreBOM: true });
    const textEncoder = new textEncoderConstructor();
    const byteProbe = new uint8ArrayConstructor([0xef, 0xbb, 0xbf, 0x41]);
    const byteProbeLength = apply(typedArrayLengthGetter, byteProbe, []) as unknown;
    const byteProbeBacking = apply(typedArrayBufferGetter, byteProbe, []) as unknown;
    const byteProbeView = apply(uint8ArraySubarray, byteProbe, [3, 4]) as unknown;
    const byteProbeViewLength = apply(typedArrayLengthGetter, byteProbeView, []) as unknown;
    const byteProbeViewBacking = apply(typedArrayBufferGetter, byteProbeView, []) as unknown;
    const decodedProbe = apply(textDecoderDecode, textDecoder, [byteProbe]) as unknown;
    const encodedProbe = apply(textEncoderEncode, textEncoder, ["A"]) as unknown;
    const encodedProbeLength = apply(typedArrayLengthGetter, encodedProbe, []) as unknown;
    const encodedProbeBacking = apply(typedArrayBufferGetter, encodedProbe, []) as unknown;
    const reflectionProbe = { marker: byteProbe };
    const reflectionKeys = ownKeys(reflectionProbe);
    const initialDescriptor = getOwnPropertyDescriptor(reflectionProbe, "marker");
    const frozenProbe = objectFreeze(reflectionProbe);
    const frozenDescriptor = getOwnPropertyDescriptor(reflectionProbe, "marker");
    const weakSetProbe = new weakSetConstructor<object>();
    const weakSetValue = {};
    if (
      getPrototypeOf(byteProbe) !== uint8ArrayPrototype ||
      byteProbeLength !== 4 ||
      getPrototypeOf(byteProbeBacking as object) !== arrayBufferPrototype ||
      getPrototypeOf(byteProbeView as object) !== uint8ArrayPrototype ||
      byteProbeViewLength !== 1 ||
      byteProbeViewBacking !== byteProbeBacking ||
      (byteProbeView as Uint8Array)[0] !== 0x41 ||
      apply(textDecoderEncodingGetter, textDecoder, []) !== "utf-8" ||
      apply(textDecoderFatalGetter, textDecoder, []) !== true ||
      apply(textDecoderIgnoreBomGetter, textDecoder, []) !== true ||
      decodedProbe !== "\uFEFFA" ||
      getPrototypeOf(encodedProbe as object) !== uint8ArrayPrototype ||
      encodedProbeLength !== 1 ||
      getPrototypeOf(encodedProbeBacking as object) !== arrayBufferPrototype ||
      (encodedProbe as Uint8Array)[0] !== 0x41 ||
      !arrayIsArray(reflectionKeys) ||
      arrayIsArray(reflectionProbe) ||
      !numberIsSafeInteger(4) ||
      numberIsSafeInteger(4.5) ||
      reflectionKeys.length !== 1 ||
      reflectionKeys[0] !== "marker" ||
      initialDescriptor === undefined ||
      !("value" in initialDescriptor) ||
      initialDescriptor.value !== byteProbe ||
      frozenProbe !== reflectionProbe ||
      getPrototypeOf(reflectionProbe) !== objectPrototype ||
      !objectIsFrozen(reflectionProbe) ||
      frozenDescriptor === undefined ||
      !("value" in frozenDescriptor) ||
      frozenDescriptor.value !== byteProbe ||
      frozenDescriptor.enumerable !== true ||
      frozenDescriptor.configurable !== false ||
      frozenDescriptor.writable !== false ||
      apply(weakSetHas, weakSetProbe, [weakSetValue]) !== false ||
      apply(weakSetAdd, weakSetProbe, [weakSetValue]) !== weakSetProbe ||
      apply(weakSetHas, weakSetProbe, [weakSetValue]) !== true
    ) {
      return undefined;
    }
    let fatalRejected = false;
    try {
      apply(textDecoderDecode, textDecoder, [new uint8ArrayConstructor([0x80])]);
    } catch {
      fatalRejected = true;
    }
    if (!fatalRejected) {
      return undefined;
    }
    return {
      uint8ArrayConstructor,
      uint8ArrayPrototype,
      arrayBufferPrototype,
      uint8ArraySubarray,
      typedArrayLengthGetter,
      typedArrayBufferGetter,
      textDecoder,
      textEncoder,
      textDecoderDecode,
      textEncoderEncode,
      apply,
      objectFreeze,
      objectIsFrozen,
      objectPrototype,
      getPrototypeOf,
      ownKeys,
      getOwnPropertyDescriptor,
      arrayIsArray,
      numberIsSafeInteger,
      weakSetConstructor,
      weakSetHas,
      weakSetAdd
    };
  } catch {
    return undefined;
  }
}

function createParsedFrameRegistries(
  intrinsics: CapturedParserIntrinsics | undefined
): ParsedFrameRegistries | undefined {
  try {
    if (intrinsics === undefined) {
      return undefined;
    }
    const outputs = createBehaviorTestedParserWeakSet(intrinsics);
    const buffers = createBehaviorTestedParserWeakSet(intrinsics);
    return outputs === undefined || buffers === undefined || outputs === buffers
      ? undefined
      : { outputs, buffers };
  } catch {
    return undefined;
  }
}

function createBehaviorTestedParserWeakSet(
  intrinsics: CapturedParserIntrinsics
): WeakSet<object> | undefined {
  const candidate = new intrinsics.weakSetConstructor<object>();
  const probe = {};
  return parserApply(intrinsics, intrinsics.weakSetHas, candidate, [probe]) === false &&
    parserApply(intrinsics, intrinsics.weakSetAdd, candidate, [probe]) === candidate &&
    parserApply(intrinsics, intrinsics.weakSetHas, candidate, [probe]) === true
    ? candidate
    : undefined;
}

function parserApply<Return>(
  intrinsics: CapturedParserIntrinsics,
  operation: Function,
  receiver: unknown,
  argumentsList: readonly unknown[] = []
): Return {
  return intrinsics.apply(operation, receiver, argumentsList) as Return;
}

function exactParserUint8ArrayShape(
  value: unknown,
  intrinsics: CapturedParserIntrinsics
): { readonly length: number; readonly backing: ArrayBuffer } | undefined {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return undefined;
  }
  const prototype = intrinsics.getPrototypeOf(value as object);
  const length = parserApply<unknown>(intrinsics, intrinsics.typedArrayLengthGetter, value);
  const backing = parserApply<unknown>(intrinsics, intrinsics.typedArrayBufferGetter, value);
  return prototype === intrinsics.uint8ArrayPrototype &&
    typeof length === "number" &&
    intrinsics.numberIsSafeInteger(length) &&
    length >= 0 &&
    backing !== null &&
    typeof backing === "object" &&
    intrinsics.getPrototypeOf(backing) === intrinsics.arrayBufferPrototype
    ? { length, backing: backing as ArrayBuffer }
    : undefined;
}

function scanExactSecretCommitmentFrame(
  frame: Uint8Array,
  intrinsics: CapturedParserIntrinsics
): ParsedFrameScan | undefined {
  if (matchesFrameBytes(frame, sourceObservationPrefix, 0, intrinsics)) {
    return scanFrameDefinition(frame, sourceObservationFrameDefinition, intrinsics);
  }
  if (!matchesFrameBytes(frame, authorityPrefix, 0, intrinsics)) {
    return undefined;
  }
  const manifest = scanFrameDefinition(frame, manifestAuthorityFrameDefinition, intrinsics);
  return manifest === undefined
    ? scanFrameDefinition(frame, entryAuthorityFrameDefinition, intrinsics)
    : manifest;
}

function scanFrameDefinition(
  frame: Uint8Array,
  definition: FrameDefinition,
  intrinsics: CapturedParserIntrinsics
): ParsedFrameScan | undefined {
  try {
    if (definition.prefix === undefined || !matchesFrameBytes(frame, definition.prefix, 0, intrinsics)) {
      return undefined;
    }
    const frameShape = exactParserUint8ArrayShape(frame, intrinsics);
    const prefixShape = exactParserUint8ArrayShape(definition.prefix, intrinsics);
    if (frameShape === undefined || prefixShape === undefined) {
      return undefined;
    }
    let offset = prefixShape.length;
    const spans = createDenseParserInventory<FrameSpan>(
      definition.fields.length + (definition.recordClass === undefined ? 0 : 1)
    );
    if (spans === undefined) {
      return undefined;
    }
    let spanIndex = 0;
    if (definition.recordClass !== undefined) {
      const recordClassShape = exactParserUint8ArrayShape(definition.recordClass, intrinsics);
      if (recordClassShape === undefined) {
        return undefined;
      }
      const recordClass = readExactFrameSpan(
        frame,
        frameShape.length,
        offset,
        1,
        recordClassShape.length,
        recordClassShape.length
      );
      if (recordClass === undefined) {
        return undefined;
      }
      spans[spanIndex] = recordClass.span;
      spanIndex += 1;
      offset = recordClass.next;
    }
    for (let fieldIndex = 0; fieldIndex < definition.fields.length; fieldIndex += 1) {
      const field = definition.fields[fieldIndex];
      if (field === undefined) {
        return undefined;
      }
      const fixedLength = field.kind === "bytes" && field.limit === 32 ? 32 : undefined;
      const maximumLength = field.kind === "bytes" ? field.limit : maximumFrameLength;
      const parsed = readExactFrameSpan(frame, frameShape.length, offset, field.tag, fixedLength, maximumLength);
      if (parsed === undefined) {
        return undefined;
      }
      spans[spanIndex] = parsed.span;
      spanIndex += 1;
      offset = parsed.next;
    }
    return offset === frameShape.length && spans.length === spanIndex
      ? { definition, spans: spans as readonly FrameSpan[] }
      : undefined;
  } catch {
    return undefined;
  }
}

function readExactFrameSpan(
  frame: Uint8Array,
  frameLength: number,
  offset: number,
  expectedTag: number,
  exactLength: number | undefined,
  maximumLength: number
): { readonly span: FrameSpan; readonly next: number } | undefined {
  if (offset < 0 || offset + fieldHeaderLength > frameLength || frame[offset] !== expectedTag) {
    return undefined;
  }
  for (let index = 0; index < 5; index += 1) {
    if (frame[offset + 1 + index] !== 0) {
      return undefined;
    }
  }
  let length = 0;
  for (let index = 5; index < 8; index += 1) {
    const byte = frame[offset + 1 + index];
    if (byte === undefined) {
      return undefined;
    }
    length = length * 256 + byte;
  }
  const valueStart = offset + fieldHeaderLength;
  const remaining = frameLength - valueStart;
  if (length > maximumLength || length > remaining || (exactLength !== undefined && length !== exactLength)) {
    return undefined;
  }
  const end = valueStart + length;
  return { span: { start: valueStart, end }, next: end };
}

function matchesFrameBytes(
  frame: Uint8Array,
  expected: Uint8Array | undefined,
  offset: number,
  intrinsics: CapturedParserIntrinsics
): boolean {
  const frameShape = exactParserUint8ArrayShape(frame, intrinsics);
  const expectedShape = expected === undefined ? undefined : exactParserUint8ArrayShape(expected, intrinsics);
  if (frameShape === undefined || expected === undefined || expectedShape === undefined || offset < 0 || expectedShape.length > frameShape.length - offset) {
    return false;
  }
  for (let index = 0; index < expectedShape.length; index += 1) {
    if (frame[offset + index] !== expected[index]) {
      return false;
    }
  }
  return true;
}

function frameFieldSpan(scan: ParsedFrameScan, fieldIndex: number): FrameSpan | undefined {
  return scan.spans[fieldIndex + (scan.definition.recordClass === undefined ? 0 : 1)];
}

function hasExactRecordClass(
  frame: Uint8Array,
  scan: ParsedFrameScan,
  intrinsics: CapturedParserIntrinsics
): boolean {
  const expected = scan.definition.recordClass;
  if (expected === undefined) {
    return true;
  }
  const span = scan.spans[0];
  const expectedShape = exactParserUint8ArrayShape(expected, intrinsics);
  return span !== undefined &&
    expectedShape !== undefined &&
    span.end - span.start === expectedShape.length &&
    matchesFrameBytes(frame, expected, span.start, intrinsics);
}

function decodeExactFrameIdentifiers(
  frame: Uint8Array,
  scan: ParsedFrameScan,
  intrinsics: CapturedParserIntrinsics,
  registries: ParsedFrameRegistries
): DecodedFrameIdentifiers | undefined {
  try {
    const values = createDenseParserInventory<string>(scan.definition.fields.length);
    if (values === undefined) {
      return undefined;
    }
    for (let fieldIndex = 0; fieldIndex < scan.definition.fields.length; fieldIndex += 1) {
      const field = scan.definition.fields[fieldIndex];
      if (field === undefined) {
        return undefined;
      }
      if (field.kind !== "id") {
        continue;
      }
      const span = frameFieldSpan(scan, fieldIndex);
      if (span === undefined || span.end <= span.start) {
        return undefined;
      }
      const view = copyExactParserSpan(frame, span, intrinsics, registries);
      if (view === undefined) {
        return undefined;
      }
      const decoded = parserApply<unknown>(intrinsics, intrinsics.textDecoderDecode, intrinsics.textDecoder, [view]);
      if (typeof decoded !== "string" || decoded.length === 0) {
        return undefined;
      }
      const encoded = parserApply<unknown>(intrinsics, intrinsics.textEncoderEncode, intrinsics.textEncoder, [decoded]);
      const encodedShape = exactParserUint8ArrayShape(encoded, intrinsics);
      if (encodedShape === undefined || encodedShape.length !== span.end - span.start) {
        return undefined;
      }
      for (let index = 0; index < encodedShape.length; index += 1) {
        if ((encoded as Uint8Array)[index] !== frame[span.start + index]) {
          return undefined;
        }
      }
      values[fieldIndex] = decoded;
    }
    return { values };
  } catch {
    return undefined;
  }
}

function copyExactFrameBytes(
  frame: Uint8Array,
  scan: ParsedFrameScan,
  intrinsics: CapturedParserIntrinsics,
  registries: ParsedFrameRegistries
): CopiedFrameBytes | undefined {
  try {
    const frameShape = exactParserUint8ArrayShape(frame, intrinsics);
    if (frameShape === undefined) {
      return undefined;
    }
    const fields = createDenseParserInventory<CopiedFrameField>(scan.definition.fields.length);
    if (fields === undefined) {
      return undefined;
    }
    for (let fieldIndex = 0; fieldIndex < scan.definition.fields.length; fieldIndex += 1) {
      const field = scan.definition.fields[fieldIndex];
      if (field === undefined) {
        return undefined;
      }
      if (field.kind !== "bytes") {
        continue;
      }
      const span = frameFieldSpan(scan, fieldIndex);
      if (span === undefined) {
        return undefined;
      }
      const isolated = copyUnregisteredExactParserSpan(frame, span, intrinsics, registries);
      if (isolated === undefined) {
        return undefined;
      }
      const copy = snapshotCanonicalSecretCommitmentBytes(isolated.bytes, field.limit);
      const copyShape = copy === undefined ? undefined : exactParserUint8ArrayShape(copy, intrinsics);
      if (
        copy === undefined || copyShape === undefined ||
        copyShape.length !== span.end - span.start ||
        copy === frame || copy === isolated.bytes ||
        copyShape.backing === frameShape.backing || copyShape.backing === isolated.backing ||
        parserApply(intrinsics, intrinsics.weakSetHas, registries.outputs, [copy]) !== false ||
        parserApply(intrinsics, intrinsics.weakSetHas, registries.buffers, [copyShape.backing]) !== false ||
        !copiedBytesMatchFrame(isolated.bytes, frame, span, intrinsics) ||
        !copiedBytesMatchFrame(copy, frame, span, intrinsics)
      ) {
        return undefined;
      }
      for (let previousIndex = 0; previousIndex < fields.length; previousIndex += 1) {
        const existing = fields[previousIndex];
        if (existing !== undefined && (existing.bytes === copy || existing.backing === copyShape.backing)) {
          return undefined;
        }
      }
      fields[fieldIndex] = { bytes: copy, backing: copyShape.backing, span };
    }
    return { fields };
  } catch {
    return undefined;
  }
}

function createDenseParserInventory<Value>(length: number): (Value | undefined)[] | undefined {
  switch (length) {
    case 6:
      return [undefined, undefined, undefined, undefined, undefined, undefined];
    case 7:
      return [undefined, undefined, undefined, undefined, undefined, undefined, undefined];
    case 8:
      return [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined];
    default:
      return undefined;
  }
}

function copyExactParserSpan(
  frame: Uint8Array,
  span: FrameSpan,
  intrinsics: CapturedParserIntrinsics,
  registries: ParsedFrameRegistries
): Uint8Array | undefined {
  const isolated = copyUnregisteredExactParserSpan(frame, span, intrinsics, registries);
  if (isolated === undefined) {
    return undefined;
  }
  const { bytes: copy, backing } = isolated;
  if (
    parserApply(intrinsics, intrinsics.weakSetAdd, registries.outputs, [copy]) !== registries.outputs ||
    parserApply(intrinsics, intrinsics.weakSetAdd, registries.buffers, [backing]) !== registries.buffers ||
    parserApply(intrinsics, intrinsics.weakSetHas, registries.outputs, [copy]) !== true ||
    parserApply(intrinsics, intrinsics.weakSetHas, registries.buffers, [backing]) !== true
  ) {
    return undefined;
  }
  return copy;
}

function copyUnregisteredExactParserSpan(
  frame: Uint8Array,
  span: FrameSpan,
  intrinsics: CapturedParserIntrinsics,
  registries: ParsedFrameRegistries
): { readonly bytes: Uint8Array; readonly backing: ArrayBuffer } | undefined {
  const frameShape = exactParserUint8ArrayShape(frame, intrinsics);
  const length = span.end - span.start;
  if (frameShape === undefined || length <= 0) {
    return undefined;
  }
  const copy = new intrinsics.uint8ArrayConstructor(length);
  const copyShape = exactParserUint8ArrayShape(copy, intrinsics);
  if (
    copyShape === undefined ||
    copyShape.length !== length ||
    copyShape.backing === frameShape.backing ||
    parserApply(intrinsics, intrinsics.weakSetHas, registries.outputs, [copy]) !== false ||
    parserApply(intrinsics, intrinsics.weakSetHas, registries.buffers, [copyShape.backing]) !== false
  ) {
    return undefined;
  }
  for (let index = 0; index < length; index += 1) {
    copy[index] = frame[span.start + index] as number;
  }
  if (!copiedBytesMatchFrame(copy, frame, span, intrinsics)) {
    return undefined;
  }
  return { bytes: copy, backing: copyShape.backing };
}

function constructParsedSecretCommitmentFrame(
  scan: ParsedFrameScan,
  identifiers: DecodedFrameIdentifiers,
  copied: CopiedFrameBytes
): ParsedSecretCommitmentFrame | undefined {
  const workspaceId = identifiers.values[0];
  const sourceCollectionId = identifiers.values[1];
  const sourceBoundaryRevision = identifiers.values[2];
  if (typeof workspaceId !== "string" || typeof sourceCollectionId !== "string" || typeof sourceBoundaryRevision !== "string") {
    return undefined;
  }
  if (scan.definition === sourceObservationFrameDefinition) {
    const manifestEntryId = identifiers.values[3];
    const nonce = copied.fields[4]?.bytes;
    const observedBytes = copied.fields[5]?.bytes;
    return typeof manifestEntryId === "string" && nonce !== undefined && observedBytes !== undefined
      ? { profile: "cestus.source-observation.v1", workspaceId, sourceCollectionId, sourceBoundaryRevision, manifestEntryId, nonce, observedBytes }
      : undefined;
  }
  const classificationPolicyHash = copied.fields[3]?.bytes;
  const publicManifestId = copied.fields[4]?.bytes;
  if (classificationPolicyHash === undefined || publicManifestId === undefined) {
    return undefined;
  }
  if (scan.definition === manifestAuthorityFrameDefinition) {
    const protectedCanonicalManifestBytes = copied.fields[5]?.bytes;
    return protectedCanonicalManifestBytes !== undefined
      ? {
        profile: "source-manifest-authority.v1",
        recordClass: "manifest",
        workspaceId,
        sourceCollectionId,
        sourceBoundaryRevision,
        classificationPolicyHash,
        publicManifestId,
        protectedCanonicalManifestBytes
      }
      : undefined;
  }
  const publicEntryId = copied.fields[5]?.bytes;
  const protectedCanonicalEntryBytes = copied.fields[6]?.bytes;
  return publicEntryId !== undefined && protectedCanonicalEntryBytes !== undefined
    ? {
      profile: "source-manifest-authority.v1",
      recordClass: "entry",
      workspaceId,
      sourceCollectionId,
      sourceBoundaryRevision,
      classificationPolicyHash,
      publicManifestId,
      publicEntryId,
      protectedCanonicalEntryBytes
    }
    : undefined;
}

function copiedBytesMatchFrame(
  copy: Uint8Array,
  frame: Uint8Array,
  span: FrameSpan,
  intrinsics: CapturedParserIntrinsics
): boolean {
  const shape = exactParserUint8ArrayShape(copy, intrinsics);
  if (shape === undefined || shape.length !== span.end - span.start) {
    return false;
  }
  for (let index = 0; index < shape.length; index += 1) {
    if (copy[index] !== frame[span.start + index]) {
      return false;
    }
  }
  return true;
}

interface ExpectedParsedFrameProperty {
  readonly key: string;
  readonly value: unknown;
}

function expectedParsedFrameProperties(
  scan: ParsedFrameScan,
  identifiers: DecodedFrameIdentifiers,
  copied: CopiedFrameBytes
): readonly ExpectedParsedFrameProperty[] | undefined {
  const workspaceId = identifiers.values[0];
  const sourceCollectionId = identifiers.values[1];
  const sourceBoundaryRevision = identifiers.values[2];
  if (typeof workspaceId !== "string" || typeof sourceCollectionId !== "string" || typeof sourceBoundaryRevision !== "string") {
    return undefined;
  }
  if (scan.definition === sourceObservationFrameDefinition) {
    const manifestEntryId = identifiers.values[3];
    const nonce = copied.fields[4]?.bytes;
    const observedBytes = copied.fields[5]?.bytes;
    return typeof manifestEntryId !== "string" || nonce === undefined || observedBytes === undefined ? undefined : [
      { key: "profile", value: "cestus.source-observation.v1" },
      { key: "workspaceId", value: workspaceId },
      { key: "sourceCollectionId", value: sourceCollectionId },
      { key: "sourceBoundaryRevision", value: sourceBoundaryRevision },
      { key: "manifestEntryId", value: manifestEntryId },
      { key: "nonce", value: nonce },
      { key: "observedBytes", value: observedBytes }
    ];
  }
  const classificationPolicyHash = copied.fields[3]?.bytes;
  const publicManifestId = copied.fields[4]?.bytes;
  if (classificationPolicyHash === undefined || publicManifestId === undefined) {
    return undefined;
  }
  if (scan.definition === manifestAuthorityFrameDefinition) {
    const payload = copied.fields[5]?.bytes;
    return payload === undefined ? undefined : [
      { key: "profile", value: "source-manifest-authority.v1" },
      { key: "recordClass", value: "manifest" },
      { key: "workspaceId", value: workspaceId },
      { key: "sourceCollectionId", value: sourceCollectionId },
      { key: "sourceBoundaryRevision", value: sourceBoundaryRevision },
      { key: "classificationPolicyHash", value: classificationPolicyHash },
      { key: "publicManifestId", value: publicManifestId },
      { key: "protectedCanonicalManifestBytes", value: payload }
    ];
  }
  const publicEntryId = copied.fields[5]?.bytes;
  const payload = copied.fields[6]?.bytes;
  return publicEntryId === undefined || payload === undefined ? undefined : [
    { key: "profile", value: "source-manifest-authority.v1" },
    { key: "recordClass", value: "entry" },
    { key: "workspaceId", value: workspaceId },
    { key: "sourceCollectionId", value: sourceCollectionId },
    { key: "sourceBoundaryRevision", value: sourceBoundaryRevision },
    { key: "classificationPolicyHash", value: classificationPolicyHash },
    { key: "publicManifestId", value: publicManifestId },
    { key: "publicEntryId", value: publicEntryId },
    { key: "protectedCanonicalEntryBytes", value: payload }
  ];
}

function freezeAndRegisterParsedFrame(
  frame: Uint8Array,
  scan: ParsedFrameScan,
  identifiers: DecodedFrameIdentifiers,
  result: ParsedSecretCommitmentFrame,
  copied: CopiedFrameBytes,
  intrinsics: CapturedParserIntrinsics,
  registries: ParsedFrameRegistries
): boolean {
  try {
    const expected = expectedParsedFrameProperties(scan, identifiers, copied);
    if (expected === undefined) {
      return false;
    }
    const frozen = intrinsics.objectFreeze(result);
    const keys = intrinsics.ownKeys(result);
    if (
      frozen !== result ||
      intrinsics.getPrototypeOf(result) !== intrinsics.objectPrototype ||
      !intrinsics.objectIsFrozen(result) ||
      !intrinsics.arrayIsArray(keys) ||
      keys.length !== expected.length
    ) {
      return false;
    }
    for (let index = 0; index < expected.length; index += 1) {
      const property = expected[index];
      if (property === undefined || keys[index] !== property.key) {
        return false;
      }
      const descriptor = intrinsics.getOwnPropertyDescriptor(result, property.key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.value !== property.value ||
        descriptor.enumerable !== true ||
        descriptor.configurable !== false ||
        descriptor.writable !== false
      ) {
        return false;
      }
    }
    for (let fieldIndex = 0; fieldIndex < copied.fields.length; fieldIndex += 1) {
      const copy = copied.fields[fieldIndex];
      if (copy === undefined) {
        continue;
      }
      const shape = exactParserUint8ArrayShape(copy.bytes, intrinsics);
      if (
        shape === undefined ||
        shape.backing !== copy.backing ||
        !copiedBytesMatchFrame(copy.bytes, frame, copy.span, intrinsics) ||
        parserApply(intrinsics, intrinsics.weakSetHas, registries.outputs, [copy.bytes]) !== false ||
        parserApply(intrinsics, intrinsics.weakSetHas, registries.buffers, [copy.backing]) !== false
      ) {
        return false;
      }
    }
    for (let fieldIndex = 0; fieldIndex < copied.fields.length; fieldIndex += 1) {
      const copy = copied.fields[fieldIndex];
      if (copy !== undefined && (
        parserApply(intrinsics, intrinsics.weakSetAdd, registries.outputs, [copy.bytes]) !== registries.outputs ||
        parserApply(intrinsics, intrinsics.weakSetHas, registries.outputs, [copy.bytes]) !== true ||
        parserApply(intrinsics, intrinsics.weakSetAdd, registries.buffers, [copy.backing]) !== registries.buffers ||
        parserApply(intrinsics, intrinsics.weakSetHas, registries.buffers, [copy.backing]) !== true
      )) {
        return false;
      }
    }
    for (let fieldIndex = 0; fieldIndex < copied.fields.length; fieldIndex += 1) {
      const copy = copied.fields[fieldIndex];
      if (copy !== undefined && (
        parserApply(intrinsics, intrinsics.weakSetHas, registries.outputs, [copy.bytes]) !== true ||
        parserApply(intrinsics, intrinsics.weakSetHas, registries.buffers, [copy.backing]) !== true
      )) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

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
