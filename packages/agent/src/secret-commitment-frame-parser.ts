import { snapshotCanonicalSecretCommitmentBytes } from "./secret-commitment-bytes.js";
import type { ParsedSecretCommitmentFrame } from "./secret-commitment-contract.js";

type FrameField =
  | { readonly kind: "id"; readonly key: string; readonly tag: number }
  | { readonly kind: "bytes"; readonly key: string; readonly tag: number; readonly limit: 32 | 8_388_608 };

interface FrameDefinition {
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


const maximumFrameLength = 8_454_144;
const fieldHeaderLength = 9;
const capturedParserIntrinsics = captureParserIntrinsics();

function createParserStaticFrameBytes(values: readonly number[]): Uint8Array | undefined {
  try {
    return capturedParserIntrinsics === undefined
      ? undefined
      : new capturedParserIntrinsics.uint8ArrayConstructor(values);
  } catch {
    return undefined;
  }
}

const sourceObservationPrefix = createParserStaticFrameBytes([
  0x63, 0x65, 0x73, 0x74, 0x75, 0x73, 0x2e, 0x73, 0x6f, 0x75, 0x72, 0x63, 0x65, 0x2d,
  0x6f, 0x62, 0x73, 0x65, 0x72, 0x76, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x2e, 0x76, 0x31, 0x00
]);
const authorityPrefix = createParserStaticFrameBytes([
  0x73, 0x6f, 0x75, 0x72, 0x63, 0x65, 0x2d, 0x6d, 0x61, 0x6e, 0x69, 0x66, 0x65, 0x73,
  0x74, 0x2d, 0x61, 0x75, 0x74, 0x68, 0x6f, 0x72, 0x69, 0x74, 0x79, 0x2e, 0x76, 0x31, 0x00
]);
const manifestRecordClass = createParserStaticFrameBytes([0x6d, 0x61, 0x6e, 0x69, 0x66, 0x65, 0x73, 0x74]);
const entryRecordClass = createParserStaticFrameBytes([0x65, 0x6e, 0x74, 0x72, 0x79]);

const sourceObservationFrameDefinition: FrameDefinition = {
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

const parsedFrameRegistries = createParsedFrameRegistries(capturedParserIntrinsics);

export function parseSecretCommitmentFrameImpl(frame: unknown): ParsedSecretCommitmentFrame | undefined {
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
  if (frameShape === undefined || length < 0) {
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
    // No captured or behavior-tested operation may run after this comparison.
    // Those operations are ambient callbacks and may conform to their contract
    // while mutating a value they receive.
    for (let fieldIndex = 0; fieldIndex < copied.fields.length; fieldIndex += 1) {
      const copy = copied.fields[fieldIndex];
      if (copy === undefined) {
        continue;
      }
      const length = copy.span.end - copy.span.start;
      for (let byteIndex = 0; byteIndex < length; byteIndex += 1) {
        if (copy.bytes[byteIndex] !== frame[copy.span.start + byteIndex]) {
          return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}
