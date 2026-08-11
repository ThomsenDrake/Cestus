import { isProxy as nodeIsProxy } from "node:util/types";

export type SecretCommitmentByteLimit = 32 | 8_388_608 | 8_454_144;

type TestSeam = {
  readonly ownKeys?: (value: unknown) => readonly PropertyKey[];
  readonly allocate?: (length: number) => unknown;
  readonly copy?: (output: unknown, input: unknown) => void;
};

const reflectApply = Reflect.apply;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const reflectOwnKeys = Reflect.ownKeys;
const uint8ArrayConstructor = Uint8Array;
const uint8ArrayPrototype = uint8ArrayConstructor.prototype;
const typedArrayPrototype = objectGetPrototypeOf(uint8ArrayPrototype);
const arrayBufferPrototype = ArrayBuffer.prototype;
const stringConstructor = String;
const stringPrototype = stringConstructor.prototype;
const typedArrayLengthGetter = objectGetOwnPropertyDescriptor(typedArrayPrototype, "length")?.get;
const typedArrayBufferGetter = objectGetOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get;
const arrayBufferByteLengthGetter = objectGetOwnPropertyDescriptor(arrayBufferPrototype, "byteLength")?.get;
const arrayBufferResizableGetter = objectGetOwnPropertyDescriptor(arrayBufferPrototype, "resizable")?.get;
const arrayBufferDetachedGetter = objectGetOwnPropertyDescriptor(arrayBufferPrototype, "detached")?.get;
const uint8ArraySet = objectGetOwnPropertyDescriptor(typedArrayPrototype, "set")?.value;
const typedArrayEvery = objectGetOwnPropertyDescriptor(typedArrayPrototype, "every")?.value;
const typedArrayAt = objectGetOwnPropertyDescriptor(typedArrayPrototype, "at")?.value;
const stringCharCodeAt = objectGetOwnPropertyDescriptor(stringPrototype, "charCodeAt")?.value;
const numberIsSafeInteger = objectGetOwnPropertyDescriptor(Number, "isSafeInteger")?.value;
const numberIsInteger = objectGetOwnPropertyDescriptor(Number, "isInteger")?.value;
const mathFloor = objectGetOwnPropertyDescriptor(Math, "floor")?.value;

const intrinsicsAvailable = typeof nodeIsProxy === "function"
  && typeof reflectApply === "function"
  && typeof objectGetPrototypeOf === "function"
  && typeof objectGetOwnPropertyDescriptor === "function"
  && typeof reflectOwnKeys === "function"
  && typeof typedArrayLengthGetter === "function"
  && typeof typedArrayBufferGetter === "function"
  && typeof arrayBufferByteLengthGetter === "function"
  && typeof arrayBufferResizableGetter === "function"
  && typeof arrayBufferDetachedGetter === "function"
  && typeof uint8ArraySet === "function"
  && typeof typedArrayEvery === "function"
  && typeof typedArrayAt === "function"
  && typeof stringConstructor === "function"
  && typeof stringCharCodeAt === "function"
  && typeof numberIsSafeInteger === "function"
  && typeof numberIsInteger === "function"
  && typeof mathFloor === "function";

function apply<Return>(operation: Function, receiver: unknown, argumentsList: readonly unknown[] = []): Return {
  return reflectApply(operation, receiver, argumentsList) as Return;
}

function capturedDataFunction(value: object, key: PropertyKey): Function | undefined | null {
  if (isCallerProxy(value)) {
    return null;
  }
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    return undefined;
  }
  if (!("value" in descriptor) || typeof descriptor.value !== "function") {
    return null;
  }
  return descriptor.value;
}

function captureTestSeam(): TestSeam | undefined | null {
  const gateDescriptor = objectGetOwnPropertyDescriptor(process.env, "VITEST");
  if (gateDescriptor === undefined || !("value" in gateDescriptor) || gateDescriptor.value !== "true") {
    return undefined;
  }
  const seamDescriptor = objectGetOwnPropertyDescriptor(globalThis, "__cestusSecretCommitmentBytesTestSeam");
  if (seamDescriptor === undefined || !("value" in seamDescriptor)) {
    return undefined;
  }
  const value = seamDescriptor.value;
  if (value === null || typeof value !== "object" || isCallerProxy(value)) {
    return null;
  }
  const ownKeys = capturedDataFunction(value, "ownKeys");
  const allocate = capturedDataFunction(value, "allocate");
  const copy = capturedDataFunction(value, "copy");
  if (ownKeys === null || allocate === null || copy === null) {
    return null;
  }
  return {
    ...(ownKeys === undefined ? {} : { ownKeys: ownKeys as NonNullable<TestSeam["ownKeys"]> }),
    ...(allocate === undefined ? {} : { allocate: allocate as NonNullable<TestSeam["allocate"]> }),
    ...(copy === undefined ? {} : { copy: copy as NonNullable<TestSeam["copy"]> })
  };
}

const capturedTestSeam = captureTestSeam();

function isCallerProxy(value: unknown): boolean {
  return nodeIsProxy(value as object);
}

function selectedLimit(maximumLength: unknown): SecretCommitmentByteLimit | undefined {
  if (maximumLength === 32 || maximumLength === 8_388_608 || maximumLength === 8_454_144) {
    return maximumLength;
  }
  return undefined;
}

function selectedLengthAccepts(length: number, maximumLength: SecretCommitmentByteLimit): boolean {
  return maximumLength === 32 ? length === 32 : length <= maximumLength;
}

function isCanonicalIntegerKey(key: PropertyKey | undefined, index: number): boolean {
  if (typeof key !== "string") {
    return false;
  }
  let divisor = 1;
  let digits = 1;
  while (divisor <= apply<number>(mathFloor as Function, undefined, [index / 10])) {
    divisor *= 10;
    digits += 1;
  }
  let remainder = index;
  for (let position = 0; divisor > 0; position += 1) {
    const digit = apply<number>(mathFloor as Function, undefined, [remainder / divisor]);
    if (apply<number>(stringCharCodeAt as Function, key, [position]) !== 48 + digit) {
      return false;
    }
    remainder -= digit * divisor;
    divisor = apply<number>(mathFloor as Function, undefined, [divisor / 10]);
  }
  return key.length === digits;
}

function readExactUint8Array(value: unknown): { readonly length: number; readonly backing: ArrayBuffer } | undefined {
  if (!intrinsicsAvailable || value === null || (typeof value !== "object" && typeof value !== "function") || isCallerProxy(value)) {
    return undefined;
  }
  if (apply<object>(objectGetPrototypeOf, null, [value]) !== uint8ArrayPrototype) {
    return undefined;
  }
  const length = apply<number>(typedArrayLengthGetter as Function, value);
  const backing = apply<unknown>(typedArrayBufferGetter as Function, value);
  if (!apply<boolean>(numberIsSafeInteger as Function, undefined, [length]) || length < 0 || isCallerProxy(backing)) {
    return undefined;
  }
  if (apply<object>(objectGetPrototypeOf, null, [backing]) !== arrayBufferPrototype) {
    return undefined;
  }
  if (apply<number>(arrayBufferByteLengthGetter as Function, backing) < 0
    || apply<boolean>(arrayBufferResizableGetter as Function, backing) !== false
    || apply<boolean>(arrayBufferDetachedGetter as Function, backing) !== false) {
    return undefined;
  }
  return { length, backing: backing as ArrayBuffer };
}

function hasCanonicalDescriptors(value: unknown, length: number, seam: TestSeam | undefined): boolean {
  if (isCallerProxy(value)) {
    return false;
  }
  const keys = seam?.ownKeys === undefined
    ? apply<PropertyKey[]>(reflectOwnKeys, null, [value])
    : seam.ownKeys(value);
  if (keys.length !== length) {
    return false;
  }
  for (let index = 0; index < length; index += 1) {
    if (!isCanonicalIntegerKey(keys[index], index)) {
      return false;
    }
  }
  if (length === 0) {
    return true;
  }
  if (!hasCanonicalIndexDescriptor(value, 0)) {
    return false;
  }
  return length === 1 || hasCanonicalIndexDescriptor(value, length - 1);
}

function hasCanonicalIndexDescriptor(value: unknown, index: number): boolean {
  const key = apply<string>(stringConstructor, undefined, [index]);
  const descriptor = apply<PropertyDescriptor | undefined>(objectGetOwnPropertyDescriptor, null, [value, key]);
  return descriptor !== undefined
    && "value" in descriptor
    && descriptor.configurable === true
    && descriptor.enumerable === true
    && descriptor.writable === true
    && typeof descriptor.value === "number"
    && apply<boolean>(numberIsInteger as Function, undefined, [descriptor.value])
    && descriptor.value >= 0
    && descriptor.value <= 255;
}

function outputIsCanonical(
  output: unknown,
  length: number,
  input: unknown,
  inputBacking: ArrayBuffer,
  seam: TestSeam | undefined,
  compareBytes: boolean
): output is Uint8Array {
  const shape = readExactUint8Array(output);
  if (shape === undefined || shape.length !== length || output === input || shape.backing === inputBacking) {
    return false;
  }
  if (!hasCanonicalDescriptors(output, length, seam)) {
    return false;
  }
  if (!compareBytes) {
    return true;
  }
  return apply<boolean>(typedArrayEvery as Function, output, [
    (byte: number, index: number) => byte === apply<number>(typedArrayAt as Function, input, [index])
  ]);
}

function validatedInput(value: unknown, maximumLength: SecretCommitmentByteLimit): {
  readonly length: number;
  readonly backing: ArrayBuffer;
  readonly seam: TestSeam | undefined;
} | undefined {
  const limit = selectedLimit(maximumLength);
  if (limit === undefined) {
    return undefined;
  }
  const shape = readExactUint8Array(value);
  if (shape === undefined || !selectedLengthAccepts(shape.length, limit)) {
    return undefined;
  }
  if (capturedTestSeam === null) {
    return undefined;
  }
  return hasCanonicalDescriptors(value, shape.length, capturedTestSeam) ? { ...shape, seam: capturedTestSeam } : undefined;
}

export function trustedCanonicalSecretCommitmentByteLength(
  value: unknown,
  maximumLength: SecretCommitmentByteLimit
): number | undefined {
  try {
    return validatedInput(value, maximumLength)?.length;
  } catch {
    return undefined;
  }
}

export function snapshotCanonicalSecretCommitmentBytes(
  value: unknown,
  maximumLength: SecretCommitmentByteLimit
): Uint8Array | undefined {
  try {
    const input = validatedInput(value, maximumLength);
    if (input === undefined) {
      return undefined;
    }
    const output = input.seam?.allocate === undefined ? new uint8ArrayConstructor(input.length) : input.seam.allocate(input.length);
    if (!outputIsCanonical(output, input.length, value, input.backing, input.seam, false)) {
      return undefined;
    }
    if (input.seam?.copy === undefined) {
      apply<void>(uint8ArraySet as Function, output, [value]);
    } else {
      input.seam.copy(output, value);
    }
    return outputIsCanonical(output, input.length, value, input.backing, input.seam, true) ? output : undefined;
  } catch {
    return undefined;
  }
}
