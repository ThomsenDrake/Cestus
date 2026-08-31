import { Buffer } from "node:buffer";
import vm from "node:vm";
import { expect, vi } from "vitest";
import {
  buildEntryAuthorityFrame,
  buildManifestAuthorityFrame,
  buildSourceObservationFrame,
  parseSecretCommitmentFrame,
  type EntryAuthorityFrameInput,
  type ManifestAuthorityFrameInput,
  type ParsedSecretCommitmentFrame,
  type SourceObservationFrameInput
} from "../src/secret-commitment-contract.js";

export type FrameBuilder = (input: unknown) => Uint8Array | undefined;
export type FrameInput = SourceObservationFrameInput | ManifestAuthorityFrameInput | EntryAuthorityFrameInput;

export function frameBytes(hexValue: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hexValue, "hex"));
}

export function sequence(start: number, length = 32): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
}

export function detachedView(length: number): Uint8Array {
  const backing = new ArrayBuffer(length);
  const view = new Uint8Array(backing);
  structuredClone(backing, { transfer: [backing] });
  return view;
}

export function resizableView(lengthTracking: boolean): Uint8Array | undefined {
  try {
    const Constructor = ArrayBuffer as unknown as new (length: number, options: { maxByteLength: number }) => ArrayBuffer;
    const backing = new Constructor(32, { maxByteLength: 64 });
    return lengthTracking ? new Uint8Array(backing) : new Uint8Array(backing, 0, 32);
  } catch {
    return undefined;
  }
}

export function growableView(lengthTracking: boolean): Uint8Array | undefined {
  try {
    const Constructor = SharedArrayBuffer as unknown as new (length: number, options: { maxByteLength: number }) => SharedArrayBuffer;
    const backing = new Constructor(32, { maxByteLength: 64 });
    return lengthTracking ? new Uint8Array(backing) : new Uint8Array(backing, 0, 32);
  } catch {
    return undefined;
  }
}

export function sourceFrameFixture(): SourceObservationFrameInput {
  return {
    workspaceId: "W", sourceCollectionId: "S", sourceBoundaryRevision: "R", manifestEntryId: "E",
    nonce: sequence(0), observedBytes: Uint8Array.of(0x61, 0, 0x62)
  };
}

export function manifestFrameFixture(): ManifestAuthorityFrameInput {
  return {
    workspaceId: "W", sourceCollectionId: "S", sourceBoundaryRevision: "R",
    classificationPolicyHash: sequence(0x20), publicManifestId: sequence(0x40),
    protectedCanonicalManifestBytes: Uint8Array.of(0x4d, 0)
  };
}

export function entryFrameFixture(): EntryAuthorityFrameInput {
  return {
    workspaceId: "W", sourceCollectionId: "S", sourceBoundaryRevision: "R",
    classificationPolicyHash: sequence(0x20), publicManifestId: sequence(0x40), publicEntryId: sequence(0x60),
    protectedCanonicalEntryBytes: Uint8Array.of(0x45, 0)
  };
}

export interface FrameInventory {
  readonly name: string;
  readonly builder: FrameBuilder;
  readonly fixture: () => FrameInput;
  readonly identifierFields: readonly string[];
  readonly payloadField: string;
}

export const frameInventories: readonly FrameInventory[] = [
  {
    name: "source observation", builder: buildSourceObservationFrame, fixture: sourceFrameFixture,
    identifierFields: ["workspaceId", "sourceCollectionId", "sourceBoundaryRevision", "manifestEntryId"],
    payloadField: "observedBytes"
  },
  {
    name: "manifest authority", builder: buildManifestAuthorityFrame, fixture: manifestFrameFixture,
    identifierFields: ["workspaceId", "sourceCollectionId", "sourceBoundaryRevision"],
    payloadField: "protectedCanonicalManifestBytes"
  },
  {
    name: "entry authority", builder: buildEntryAuthorityFrame, fixture: entryFrameFixture,
    identifierFields: ["workspaceId", "sourceCollectionId", "sourceBoundaryRevision"],
    payloadField: "protectedCanonicalEntryBytes"
  }
];

export function frameValues(input: FrameInput): Record<string, unknown> {
  return input as unknown as Record<string, unknown>;
}

// These fixtures and their layout oracle intentionally belong to the parser tests.
// They do not call a production builder, parser, normalizer, or schema table.
export const parserObservationLiteralHex = "6365737475732e736f757263652d6f62736572766174696f6e2e76310001000000000000000157020000000000000001530300000000000000015204000000000000000145050000000000000020000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f060000000000000003610062";
export const parserManifestLiteralHex = "736f757263652d6d616e69666573742d617574686f726974792e7631000100000000000000086d616e6966657374020000000000000001570300000000000000015304000000000000000152050000000000000020202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f060000000000000020404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f0800000000000000024d00";
export const parserEntryLiteralHex = "736f757263652d6d616e69666573742d617574686f726974792e763100010000000000000005656e747279020000000000000001570300000000000000015304000000000000000152050000000000000020202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f060000000000000020404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f070000000000000020606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f0800000000000000024500";

export type ParserFieldKind = "class" | "id" | "fixed" | "payload";

export interface ParserFieldSpec {
  readonly name: string;
  readonly tag: number;
  readonly kind: ParserFieldKind;
}

export interface ParserFieldSpan extends ParserFieldSpec {
  readonly headerStart: number;
  readonly valueStart: number;
  readonly valueEnd: number;
}

export interface ParserLiteralInventory {
  readonly name: "observation" | "manifest" | "entry";
  readonly profile: "cestus.source-observation.v1" | "source-manifest-authority.v1";
  readonly literalHex: string;
  readonly prefixAsciiBytes: number;
  readonly expectedLength: number;
  readonly fields: readonly ParserFieldSpec[];
  readonly resultKeys: readonly string[];
  readonly expectedIds: Readonly<Record<string, string>>;
}

export const parserLiteralInventories: readonly ParserLiteralInventory[] = [
  {
    name: "observation",
    profile: "cestus.source-observation.v1",
    literalHex: parserObservationLiteralHex,
    prefixAsciiBytes: 28,
    expectedLength: 122,
    fields: [
      { name: "workspaceId", tag: 1, kind: "id" },
      { name: "sourceCollectionId", tag: 2, kind: "id" },
      { name: "sourceBoundaryRevision", tag: 3, kind: "id" },
      { name: "manifestEntryId", tag: 4, kind: "id" },
      { name: "nonce", tag: 5, kind: "fixed" },
      { name: "observedBytes", tag: 6, kind: "payload" }
    ],
    resultKeys: ["profile", "workspaceId", "sourceCollectionId", "sourceBoundaryRevision", "manifestEntryId", "nonce", "observedBytes"],
    expectedIds: { workspaceId: "W", sourceCollectionId: "S", sourceBoundaryRevision: "R", manifestEntryId: "E" }
  },
  {
    name: "manifest",
    profile: "source-manifest-authority.v1",
    literalHex: parserManifestLiteralHex,
    prefixAsciiBytes: 28,
    expectedLength: 169,
    fields: [
      { name: "recordClass", tag: 1, kind: "class" },
      { name: "workspaceId", tag: 2, kind: "id" },
      { name: "sourceCollectionId", tag: 3, kind: "id" },
      { name: "sourceBoundaryRevision", tag: 4, kind: "id" },
      { name: "classificationPolicyHash", tag: 5, kind: "fixed" },
      { name: "publicManifestId", tag: 6, kind: "fixed" },
      { name: "protectedCanonicalManifestBytes", tag: 8, kind: "payload" }
    ],
    resultKeys: ["profile", "recordClass", "workspaceId", "sourceCollectionId", "sourceBoundaryRevision", "classificationPolicyHash", "publicManifestId", "protectedCanonicalManifestBytes"],
    expectedIds: { workspaceId: "W", sourceCollectionId: "S", sourceBoundaryRevision: "R" }
  },
  {
    name: "entry",
    profile: "source-manifest-authority.v1",
    literalHex: parserEntryLiteralHex,
    prefixAsciiBytes: 28,
    expectedLength: 207,
    fields: [
      { name: "recordClass", tag: 1, kind: "class" },
      { name: "workspaceId", tag: 2, kind: "id" },
      { name: "sourceCollectionId", tag: 3, kind: "id" },
      { name: "sourceBoundaryRevision", tag: 4, kind: "id" },
      { name: "classificationPolicyHash", tag: 5, kind: "fixed" },
      { name: "publicManifestId", tag: 6, kind: "fixed" },
      { name: "publicEntryId", tag: 7, kind: "fixed" },
      { name: "protectedCanonicalEntryBytes", tag: 8, kind: "payload" }
    ],
    resultKeys: ["profile", "recordClass", "workspaceId", "sourceCollectionId", "sourceBoundaryRevision", "classificationPolicyHash", "publicManifestId", "publicEntryId", "protectedCanonicalEntryBytes"],
    expectedIds: { workspaceId: "W", sourceCollectionId: "S", sourceBoundaryRevision: "R" }
  }
];

export function parserLayout(inventory: ParserLiteralInventory, frame = frameBytes(inventory.literalHex)): readonly ParserFieldSpan[] {
  let offset = inventory.prefixAsciiBytes + 1;
  const spans: ParserFieldSpan[] = [];
  for (const field of inventory.fields) {
    const headerStart = offset;
    expect(frame[headerStart]).toBe(field.tag);
    let length = 0;
    for (let index = 0; index < 8; index += 1) {
      length = length * 256 + (frame[headerStart + 1 + index] ?? Number.NaN);
    }
    const valueStart = headerStart + 9;
    const valueEnd = valueStart + length;
    expect(valueEnd).toBeLessThanOrEqual(frame.length);
    spans.push({ ...field, headerStart, valueStart, valueEnd });
    offset = valueEnd;
  }
  expect(offset).toBe(frame.length);
  return spans;
}

export function parserConcat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function parserEncodeLength(length: number): Uint8Array {
  const output = new Uint8Array(8);
  let remainder = length;
  for (let index = 7; index >= 0; index -= 1) {
    output[index] = remainder % 256;
    remainder = Math.floor(remainder / 256);
  }
  expect(remainder).toBe(0);
  return output;
}

export function parserReplaceValue(frame: Uint8Array, span: ParserFieldSpan, value: Uint8Array): Uint8Array {
  return parserConcat([
    frame.subarray(0, span.headerStart + 1),
    parserEncodeLength(value.length),
    value,
    frame.subarray(span.valueEnd)
  ]);
}

export function parserExpectedResult(inventory: ParserLiteralInventory): Record<string, unknown> {
  const frame = frameBytes(inventory.literalHex);
  const expected: Record<string, unknown> = {
    profile: inventory.profile,
    ...(inventory.name === "observation" ? {} : { recordClass: inventory.name })
  };
  for (const span of parserLayout(inventory, frame)) {
    if (span.kind === "id") {
      expected[span.name] = inventory.expectedIds[span.name];
    } else if (span.kind !== "class") {
      expected[span.name] = Uint8Array.from(frame.subarray(span.valueStart, span.valueEnd));
    }
  }
  return expected;
}

export function assertParsedExact(result: ParsedSecretCommitmentFrame | undefined, inventory: ParserLiteralInventory): void {
  expect(result).toBeDefined();
  if (result === undefined) {
    return;
  }
  const expected = parserExpectedResult(inventory);
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.keys(result)).toEqual(inventory.resultKeys);
  for (const key of inventory.resultKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(result, key);
    expect(descriptor).toEqual({
      value: (result as unknown as Readonly<Record<string, unknown>>)[key],
      writable: false,
      enumerable: true,
      configurable: false
    });
  }
  for (const [key, value] of Object.entries(expected)) {
    if (value instanceof Uint8Array) {
      expect(result[key as keyof typeof result]).toEqual(value);
    } else {
      expect(result[key as keyof typeof result]).toBe(value);
    }
  }
}

export function parserFieldSegment(frame: Uint8Array, span: ParserFieldSpan): Uint8Array {
  return frame.subarray(span.headerStart, span.valueEnd);
}

export function parserRemoveField(frame: Uint8Array, span: ParserFieldSpan): Uint8Array {
  return parserConcat([frame.subarray(0, span.headerStart), frame.subarray(span.valueEnd)]);
}

export function parserInsertAt(frame: Uint8Array, offset: number, inserted: Uint8Array): Uint8Array {
  return parserConcat([frame.subarray(0, offset), inserted, frame.subarray(offset)]);
}

export function parserBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function requireParserGeneratorInvariant(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`parser mutation generator invariant failed: ${message}`);
  }
}

export function assertParserInsertion(
  original: Uint8Array,
  candidate: Uint8Array,
  offset: number,
  inserted: Uint8Array
): void {
  requireParserGeneratorInvariant(candidate.length - original.length === inserted.length, "insertion length delta");
  requireParserGeneratorInvariant(parserBytesEqual(candidate.subarray(0, offset), original.subarray(0, offset)), "insertion prefix preservation");
  requireParserGeneratorInvariant(parserBytesEqual(candidate.subarray(offset, offset + inserted.length), inserted), "insertion target bytes");
  requireParserGeneratorInvariant(parserBytesEqual(candidate.subarray(offset + inserted.length), original.subarray(offset)), "insertion suffix preservation");
}

export function assertParserDeletion(
  original: Uint8Array,
  candidate: Uint8Array,
  start: number,
  end: number
): void {
  requireParserGeneratorInvariant(original.length - candidate.length === end - start, "deletion length delta");
  requireParserGeneratorInvariant(parserBytesEqual(candidate.subarray(0, start), original.subarray(0, start)), "deletion prefix preservation");
  requireParserGeneratorInvariant(parserBytesEqual(candidate.subarray(start), original.subarray(end)), "deletion suffix preservation");
}

export function assertParserOnlyRangeChanged(
  original: Uint8Array,
  candidate: Uint8Array,
  start: number,
  end: number
): void {
  requireParserGeneratorInvariant(candidate.length === original.length, "range mutation length preservation");
  requireParserGeneratorInvariant(parserBytesEqual(candidate.subarray(0, start), original.subarray(0, start)), "range mutation prefix preservation");
  requireParserGeneratorInvariant(parserBytesEqual(candidate.subarray(end), original.subarray(end)), "range mutation suffix preservation");
  requireParserGeneratorInvariant(!parserBytesEqual(candidate.subarray(start, end), original.subarray(start, end)), "range mutation target delta");
}

export function assertParserReplacement(
  original: Uint8Array,
  candidate: Uint8Array,
  span: ParserFieldSpan,
  replacement: Uint8Array
): void {
  requireParserGeneratorInvariant(candidate[span.headerStart] === original[span.headerStart], "replacement tag preservation");
  requireParserGeneratorInvariant(parserBytesEqual(candidate.subarray(0, span.headerStart + 1), original.subarray(0, span.headerStart + 1)), "replacement prefix preservation");
  requireParserGeneratorInvariant(parserBytesEqual(candidate.subarray(span.headerStart + 1, span.headerStart + 9), parserEncodeLength(replacement.length)), "replacement length encoding");
  requireParserGeneratorInvariant(parserBytesEqual(candidate.subarray(span.headerStart + 9, span.headerStart + 9 + replacement.length), replacement), "replacement target bytes");
  requireParserGeneratorInvariant(parserBytesEqual(candidate.subarray(span.headerStart + 9 + replacement.length), original.subarray(span.valueEnd)), "replacement suffix preservation");
}

export function parserAlterTag(frame: Uint8Array, span: ParserFieldSpan): Uint8Array {
  const output = Uint8Array.from(frame);
  const tag = output[span.headerStart];
  if (tag === undefined) {
    throw new Error("parser-owned tag span is outside its literal");
  }
  output[span.headerStart] = (tag + 0x40) & 0xff;
  return output;
}

export function parserHostileLength(frame: Uint8Array, span: ParserFieldSpan, kind: "unsafe" | "remaining" | "all-ff"): Uint8Array {
  const output = Uint8Array.from(frame);
  const bytes = kind === "unsafe"
    ? Uint8Array.of(0x20, 0, 0, 0, 0, 0, 0, 0)
    : kind === "all-ff"
      ? Uint8Array.of(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff)
      : parserEncodeLength(frame.length - span.valueStart + 1);
  output.set(bytes, span.headerStart + 1);
  return output;
}

export function parserMutateLengthByte(frame: Uint8Array, span: ParserFieldSpan, lengthByte: number): Uint8Array {
  const output = Uint8Array.from(frame);
  output[span.headerStart + 1 + lengthByte] = 1;
  return output;
}

export function parserNulMutations(inventory: ParserLiteralInventory): readonly Uint8Array[] {
  const frame = frameBytes(inventory.literalHex);
  const nul = inventory.prefixAsciiBytes;
  const removed = parserConcat([frame.subarray(0, nul), frame.subarray(nul + 1)]);
  const duplicated = parserInsertAt(frame, nul + 1, Uint8Array.of(0));
  const displaced = Uint8Array.from(frame);
  displaced[nul] = displaced[nul - 1] ?? 0;
  displaced[nul - 1] = 0;
  const added = parserInsertAt(frame, nul, Uint8Array.of(0));
  assertParserDeletion(frame, removed, nul, nul + 1);
  assertParserInsertion(frame, duplicated, nul + 1, Uint8Array.of(0));
  assertParserOnlyRangeChanged(frame, displaced, nul - 1, nul + 1);
  assertParserInsertion(frame, added, nul, Uint8Array.of(0));
  return [
    removed,
    duplicated,
    displaced,
    added
  ];
}

export function parserClassMutations(inventory: ParserLiteralInventory): readonly Uint8Array[] {
  const classSpan = parserLayout(inventory).find((span) => span.kind === "class");
  if (classSpan === undefined) {
    return [];
  }
  const frame = frameBytes(inventory.literalHex);
  const original = frame.subarray(classSpan.valueStart, classSpan.valueEnd);
  const changedCase = Uint8Array.from(original);
  changedCase[0] = changedCase[0] === 0x6d ? 0x4d : 0x45;
  const altered = Uint8Array.from(original);
  altered[0] = 0x78;
  const values = [
    new Uint8Array(),
    changedCase,
    altered,
    original.subarray(0, original.length - 1),
    parserConcat([original, Uint8Array.of(0x78)])
  ];
  const replacements = values.map((value) => parserReplaceValue(frame, classSpan, value));
  for (let index = 0; index < replacements.length; index += 1) {
    const replacement = replacements[index] as Uint8Array;
    const value = values[index] as Uint8Array;
    assertParserReplacement(frame, replacement, classSpan, value);
    const updated = parserLayout(inventory, replacement);
    requireParserGeneratorInvariant(updated[0]?.headerStart === classSpan.headerStart, "class framing precondition");
  }
  return replacements;
}

export const parserValidIdBytes: readonly Uint8Array[] = [
  Uint8Array.of(0x61),
  Uint8Array.of(0x61, 0, 0x62),
  Uint8Array.of(0xf0, 0x9f, 0x9a, 0x80),
  Uint8Array.of(0x63, 0x61, 0x66, 0xc3, 0xa9),
  Uint8Array.of(0x63, 0x61, 0x66, 0x65, 0xcc, 0x81),
  Uint8Array.of(0xef, 0xbb, 0xbf, 0x62, 0x6f, 0x6d)
];
export const parserInvalidIdBytes: readonly Uint8Array[] = [
  new Uint8Array(), Uint8Array.of(0x80), Uint8Array.of(0xe2, 0x82), Uint8Array.of(0xc0, 0x80),
  Uint8Array.of(0xed, 0xa0, 0x80), Uint8Array.of(0xf4, 0x90, 0x80, 0x80)
];

export type FreshSecretCommitmentContractModule = typeof import("../src/secret-commitment-contract.js");

export function assertFreshParserBuildersRemainUsable(module: FreshSecretCommitmentContractModule): void {
  expect(module.buildSourceObservationFrame(sourceFrameFixture())).toEqual(frameBytes(parserObservationLiteralHex));
  expect(module.buildManifestAuthorityFrame(manifestFrameFixture())).toEqual(frameBytes(parserManifestLiteralHex));
  expect(module.buildEntryAuthorityFrame(entryFrameFixture())).toEqual(frameBytes(parserEntryLiteralHex));
}

export interface FreshParserAmbientControl {
  readonly activate?: () => void;
  readonly restore: () => void;
}

export async function withFreshParserAmbientSeam(
  install: () => FreshParserAmbientControl,
  check: (module: FreshSecretCommitmentContractModule, activate: () => void) => void | Promise<void>
): Promise<void> {
  vi.resetModules();
  const control = install();
  try {
    const fresh = await import("../src/secret-commitment-contract.js");
    await check(fresh, control.activate ?? (() => undefined));
  } finally {
    control.restore();
    vi.resetModules();
  }
}

export function normalFreshByteSnapshot(value: unknown, limit: number): Uint8Array | undefined {
  return value instanceof Uint8Array && value.length <= limit && (limit !== 32 || value.length === 32)
    ? Uint8Array.from(value)
    : undefined;
}

export async function withFreshParserByteSeam(
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

