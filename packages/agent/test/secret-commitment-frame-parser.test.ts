import { Buffer } from "node:buffer";
import vm from "node:vm";
import { describe, expect, test } from "vitest";
import { parseSecretCommitmentFrame, type ParsedSecretCommitmentFrame } from "../src/secret-commitment-contract.js";
import {
  assertParsedExact, assertParserDeletion, assertParserInsertion, assertParserOnlyRangeChanged, assertParserReplacement,
  detachedView, frameBytes, frameInventories, frameValues, growableView, normalFreshByteSnapshot, parserAlterTag,
  parserBytesEqual, parserClassMutations, parserConcat, parserExpectedResult, parserFieldSegment, parserHostileLength,
  parserInsertAt, parserInvalidIdBytes, parserLayout, parserLiteralInventories, parserMutateLengthByte, parserNulMutations,
  parserRemoveField, parserReplaceValue, parserValidIdBytes, requireParserGeneratorInvariant, resizableView,
  withFreshParserByteSeam, type ParserFieldSpan, type ParserLiteralInventory
} from "./secret-commitment-frame-parser.fixtures.js";

describe("secret commitment parser grammar and boundary behavior", () => {
  test("exports the direct-module parsed union and parser without a barrel change", () => {
    const inventory = parserLiteralInventories[0] as ParserLiteralInventory;
    const parsed: ParsedSecretCommitmentFrame | undefined = parseSecretCommitmentFrame(frameBytes(inventory.literalHex));
    expect(parsed).toBeDefined();
  });

  for (const inventory of frameInventories) {
    test(`${inventory.name}: builder and parser round trip a zero-length payload`, () => {
      const input = frameValues(inventory.fixture());
      input[inventory.payloadField] = new Uint8Array();
      const frame = inventory.builder(input);
      expect(frame).toBeDefined();
      const parsed = parseSecretCommitmentFrame(frame);
      expect(parsed).toBeDefined();
      const parsedValues = parsed as unknown as Record<string, unknown>;
      expect(parsedValues[inventory.payloadField]).toEqual(new Uint8Array());
      for (const identifierField of inventory.identifierFields) {
        expect(parsedValues[identifierField]).toBe(input[identifierField]);
        expect(input[identifierField]).not.toBe("");
      }
    });
  }

  test("asserts the complete independent literal and hostile-generator count inventory", () => {
    const layouts = parserLiteralInventories.map((inventory) => parserLayout(inventory));
    const fieldCount = layouts.reduce((total, fields) => total + fields.length, 0);
    const idCount = layouts.reduce((total, fields) => total + fields.filter((field) => field.kind === "id").length, 0);
    const fixedCount = layouts.reduce((total, fields) => total + fields.filter((field) => field.kind === "fixed").length, 0);
    const cuts = parserLiteralInventories.reduce((total, inventory) => total + inventory.expectedLength, 0);
    const prefixMutations = parserLiteralInventories.reduce((total, inventory) => total + inventory.prefixAsciiBytes, 0);
    const moves = layouts.reduce((total, fields) => total + fields.length * (fields.length - 1), 0);
    const boundaries = layouts.reduce((total, fields) => total + fields.length + 1, 0);
    expect(parserLiteralInventories.map((inventory) => frameBytes(inventory.literalHex).length)).toEqual([122, 169, 207]);
    expect(fieldCount).toBe(21);
    expect(idCount).toBe(10);
    expect(fixedCount).toBe(6);
    expect(cuts).toBe(498);
    expect(prefixMutations).toBe(84);
    expect(moves).toBe(128);
    expect(boundaries).toBe(24);
    expect(fieldCount * 9).toBe(189);
    expect(fieldCount * 3).toBe(63);
    expect(fieldCount * 2).toBe(42);
    expect(fixedCount * 4).toBe(24);
    expect(fieldCount * 7).toBe(147);
    expect(idCount * parserValidIdBytes.length).toBe(60);
    expect(idCount * parserInvalidIdBytes.length).toBe(60);
  });

  test("valid independent literals require exact frozen parsed values, not a builder-produced oracle", () => {
    const results = parserLiteralInventories.map((inventory) => ({
      inventory,
      result: parseSecretCommitmentFrame(frameBytes(inventory.literalHex))
    }));
    for (const { inventory, result } of results) {
      assertParsedExact(result, inventory);
    }
  });

  test("valid UTF-8 scalar inventory requires successful exact parsing", () => {
    const results: (ParsedSecretCommitmentFrame | undefined)[] = [];
    for (const inventory of parserLiteralInventories) {
      for (const span of parserLayout(inventory).filter((field) => field.kind === "id")) {
        for (const value of parserValidIdBytes) {
          const frame = frameBytes(inventory.literalHex);
          const candidate = parserReplaceValue(frame, span, value);
          assertParserReplacement(frame, candidate, span, value);
          results.push(parseSecretCommitmentFrame(candidate));
        }
      }
    }
    expect(results).toHaveLength(60);
    expect(results.every((result) => result !== undefined)).toBe(true);
  });

  test("all complete-frame cuts, prefix mutations, NUL forms, and trailing data reject", () => {
    const cuts: Uint8Array[] = [];
    const prefixMutations: Uint8Array[] = [];
    const nulMutations: Uint8Array[] = [];
    const trailing: Uint8Array[] = [];
    for (const inventory of parserLiteralInventories) {
      const frame = frameBytes(inventory.literalHex);
      for (let length = 0; length < frame.length; length += 1) {
        cuts.push(frame.subarray(0, length));
      }
      for (let index = 0; index < inventory.prefixAsciiBytes; index += 1) {
        const changed = Uint8Array.from(frame);
        const byte = changed[index];
        if (byte === undefined) {
          throw new Error("parser-owned prefix span is outside its literal");
        }
        changed[index] = byte ^ 1;
        assertParserOnlyRangeChanged(frame, changed, index, index + 1);
        prefixMutations.push(changed);
      }
      nulMutations.push(...parserNulMutations(inventory));
      trailing.push(parserConcat([frame, Uint8Array.of(0)]));
    }
    expect(cuts).toHaveLength(498);
    expect(prefixMutations).toHaveLength(84);
    expect(nulMutations).toHaveLength(12);
    expect(trailing).toHaveLength(3);
    for (const candidate of [...cuts, ...prefixMutations, ...nulMutations, ...trailing]) {
      expect(parseSecretCommitmentFrame(candidate)).toBeUndefined();
    }
  });

  test("all field order, tag, header, hostile-length, and fixed-width mutations reject", () => {
    const removals: Uint8Array[] = [];
    const duplicates: Uint8Array[] = [];
    const alteredTags: Uint8Array[] = [];
    const moved: Uint8Array[] = [];
    const unknowns: Uint8Array[] = [];
    const headerCuts: Uint8Array[] = [];
    const hostileLengths: Uint8Array[] = [];
    const lengthInsertDelete: Uint8Array[] = [];
    const fixedWidths: Uint8Array[] = [];
    const highOrderLengths: Uint8Array[] = [];
    for (const inventory of parserLiteralInventories) {
      const frame = frameBytes(inventory.literalHex);
      const spans = parserLayout(inventory, frame);
      for (const span of spans) {
        const removed = parserRemoveField(frame, span);
        assertParserDeletion(frame, removed, span.headerStart, span.valueEnd);
        removals.push(removed);
        const segment = parserFieldSegment(frame, span);
        const duplicated = parserInsertAt(frame, span.valueEnd, segment);
        assertParserInsertion(frame, duplicated, span.valueEnd, segment);
        duplicates.push(duplicated);
        const alteredTag = parserAlterTag(frame, span);
        assertParserOnlyRangeChanged(frame, alteredTag, span.headerStart, span.headerStart + 1);
        alteredTags.push(alteredTag);
        for (let target = 0; target < spans.length; target += 1) {
          if (target === spans.indexOf(span)) {
            continue;
          }
          const without = parserRemoveField(frame, span);
          const destination = target < spans.indexOf(span)
            ? spans[target]?.headerStart
            : (spans[target]?.valueEnd ?? without.length) - (span.valueEnd - span.headerStart);
          const insertion = destination ?? without.length;
          const candidate = parserInsertAt(without, insertion, segment);
          assertParserInsertion(without, candidate, insertion, segment);
          moved.push(candidate);
        }
        for (let after = 0; after <= 8; after += 1) {
          const cut = frame.subarray(0, span.headerStart + 1 + after);
          requireParserGeneratorInvariant(parserBytesEqual(cut, frame.subarray(0, cut.length)), "header truncation prefix");
          headerCuts.push(cut);
        }
        for (const kind of ["unsafe", "remaining", "all-ff"] as const) {
          const hostile = parserHostileLength(frame, span, kind);
          assertParserOnlyRangeChanged(frame, hostile, span.headerStart + 1, span.headerStart + 9);
          hostileLengths.push(hostile);
        }
        const insertedLength = parserInsertAt(frame, span.headerStart + 1, Uint8Array.of(0));
        assertParserInsertion(frame, insertedLength, span.headerStart + 1, Uint8Array.of(0));
        const deletedLength = parserConcat([frame.subarray(0, span.headerStart + 1), frame.subarray(span.headerStart + 2)]);
        assertParserDeletion(frame, deletedLength, span.headerStart + 1, span.headerStart + 2);
        lengthInsertDelete.push(insertedLength, deletedLength);
        for (let byte = 0; byte < 7; byte += 1) {
          const highOrder = parserMutateLengthByte(frame, span, byte);
          assertParserOnlyRangeChanged(frame, highOrder, span.headerStart + 1 + byte, span.headerStart + 2 + byte);
          highOrderLengths.push(highOrder);
        }
        if (span.kind === "fixed") {
          for (const width of [0, 31, 33, 34]) {
            const replacement = new Uint8Array(width);
            const fixedWidth = parserReplaceValue(frame, span, replacement);
            assertParserReplacement(frame, fixedWidth, span, replacement);
            fixedWidths.push(fixedWidth);
          }
        }
      }
      for (let boundary = 0; boundary <= spans.length; boundary += 1) {
        const offset = boundary === spans.length ? frame.length : (spans[boundary]?.headerStart ?? frame.length);
        const unknown = Uint8Array.of(0xff, 0, 0, 0, 0, 0, 0, 0, 0);
        const candidate = parserInsertAt(frame, offset, unknown);
        assertParserInsertion(frame, candidate, offset, unknown);
        unknowns.push(candidate);
      }
    }
    expect(removals).toHaveLength(21);
    expect(duplicates).toHaveLength(21);
    expect(alteredTags).toHaveLength(21);
    expect(moved).toHaveLength(128);
    expect(unknowns).toHaveLength(24);
    expect(headerCuts).toHaveLength(189);
    expect(hostileLengths).toHaveLength(63);
    expect(lengthInsertDelete).toHaveLength(42);
    expect(fixedWidths).toHaveLength(24);
    expect(highOrderLengths).toHaveLength(147);
    for (const candidate of [
      ...removals, ...duplicates, ...alteredTags, ...moved, ...unknowns, ...headerCuts,
      ...hostileLengths, ...lengthInsertDelete, ...fixedWidths, ...highOrderLengths
    ]) {
      expect(parseSecretCommitmentFrame(candidate)).toBeUndefined();
    }
  });

  test("profile swaps, authority-class mutations, and malformed UTF-8 reject", () => {
    let invalidCount = 0;
    const requireRejected = (candidate: Uint8Array): void => {
      invalidCount += 1;
      const parsed = parseSecretCommitmentFrame(candidate);
      expect(parsed).toBeUndefined();
    };
    const observation = parserLiteralInventories[0] as ParserLiteralInventory;
    const authority = parserLiteralInventories[1] as ParserLiteralInventory;
    requireRejected(parserConcat([frameBytes(authority.literalHex).subarray(0, authority.prefixAsciiBytes + 1), frameBytes(observation.literalHex).subarray(observation.prefixAsciiBytes + 1)]));
    requireRejected(parserConcat([frameBytes(observation.literalHex).subarray(0, observation.prefixAsciiBytes + 1), frameBytes(authority.literalHex).subarray(authority.prefixAsciiBytes + 1)]));
    for (const inventory of parserLiteralInventories) {
      for (const classMutation of parserClassMutations(inventory)) {
        requireRejected(classMutation);
      }
      for (const span of parserLayout(inventory).filter((field) => field.kind === "id")) {
        for (const value of parserInvalidIdBytes) {
          const frame = frameBytes(inventory.literalHex);
          const candidate = parserReplaceValue(frame, span, value);
          assertParserReplacement(frame, candidate, span, value);
          requireRejected(candidate);
        }
      }
    }
    expect(invalidCount).toBe(72);
  });

  test("hostile public views and backing shapes reject without caller traps or accessors", () => {
    class ParserSubclass extends Uint8Array {}
    const calls = { proxy: 0, accessor: 0 };
    const observationHex = (parserLiteralInventories[0] as ParserLiteralInventory).literalHex;
    const altered = frameBytes(observationHex);
    Object.setPrototypeOf(altered, {});
    const extraString = frameBytes(observationHex) as Uint8Array & { extra?: true };
    extraString.extra = true;
    const extraSymbol = frameBytes(observationHex);
    Object.defineProperty(extraSymbol, Symbol("extra"), { value: true });
    const accessor = Object.create(Uint8Array.prototype) as Uint8Array;
    Object.defineProperty(accessor, "length", { get() { calls.accessor += 1; throw new Error("caller accessor must not run"); } });
    const transparentProxy = new Proxy(frameBytes(observationHex), {
      get(target, key, receiver) { calls.proxy += 1; return Reflect.get(target, key, receiver); },
      getPrototypeOf(target) { calls.proxy += 1; return Reflect.getPrototypeOf(target); },
      ownKeys(target) { calls.proxy += 1; return Reflect.ownKeys(target); }
    });
    const throwingProxy = new Proxy(frameBytes(observationHex), {
      get() { calls.proxy += 1; throw new Error("caller Proxy trap must not run"); },
      getPrototypeOf() { calls.proxy += 1; throw new Error("caller Proxy trap must not run"); },
      ownKeys() { calls.proxy += 1; throw new Error("caller Proxy trap must not run"); }
    });
    const shapes: readonly (Uint8Array | undefined)[] = [
      Buffer.from(frameBytes(observationHex)),
      new ParserSubclass(frameBytes(observationHex)),
      altered,
      vm.runInNewContext("new Uint8Array(122)") as Uint8Array,
      detachedView(122),
      transparentProxy,
      throwingProxy,
      accessor,
      extraString,
      extraSymbol,
      new Uint8Array(new SharedArrayBuffer(122)),
      resizableView(false),
      resizableView(true),
      growableView(false),
      growableView(true)
    ];
    const supported = shapes.filter((shape): shape is Uint8Array => shape !== undefined);
    expect(supported.length).toBeGreaterThanOrEqual(11);
    for (const shape of supported) {
      const parsed = parseSecretCommitmentFrame(shape);
      expect(parsed).toBeUndefined();
    }
    expect(calls).toEqual({ proxy: 0, accessor: 0 });
  });

  test("valid parses require independent frozen wrappers and binary ownership", () => {
    const attempts = parserLiteralInventories.map((inventory) => {
      const input = frameBytes(inventory.literalHex);
      const expected = parserExpectedResult(inventory);
      return {
        input,
        expected,
        first: parseSecretCommitmentFrame(input),
        second: parseSecretCommitmentFrame(frameBytes(inventory.literalHex))
      };
    });
    expect(attempts.every(({ first, second }) => first !== undefined && second !== undefined)).toBe(true);
    for (const { input, expected, first, second } of attempts) {
      if (first === undefined || second === undefined) {
        continue;
      }
      expect(first).not.toBe(second);
      expect(Object.isFrozen(first)).toBe(true);
      const binaryFields = Object.entries(first).filter((entry): entry is [string, Uint8Array] => entry[1] instanceof Uint8Array);
      for (let left = 0; left < binaryFields.length; left += 1) {
        for (let right = left + 1; right < binaryFields.length; right += 1) {
          expect(binaryFields[left]?.[1]).not.toBe(binaryFields[right]?.[1]);
          expect(binaryFields[left]?.[1].buffer).not.toBe(binaryFields[right]?.[1].buffer);
        }
      }
      input.fill(0);
      for (const [mutatedKey, mutated] of binaryFields) {
        mutated.fill(0xff);
        for (const [key, value] of binaryFields) {
          if (key !== mutatedKey) {
            expect(value).toEqual(expected[key]);
          }
          const peer: unknown = (second as unknown as Readonly<Record<string, unknown>>)[key];
          expect(peer).toEqual(expected[key]);
        }
        const original = expected[mutatedKey];
        if (!(original instanceof Uint8Array)) {
          throw new Error(`missing expected binary field: ${mutatedKey}`);
        }
        mutated.set(original);
      }
    }
  });


  test("accepts 256-byte and 65,536-byte big-endian payload controls for every variant", () => {
    for (const inventory of parserLiteralInventories) {
      const payload = parserLayout(inventory).find((span) => span.kind === "payload") as ParserFieldSpan;
      for (const length of [256, 65_536]) {
        const candidate = parserReplaceValue(frameBytes(inventory.literalHex), payload, new Uint8Array(length));
        const updated = parserLayout(inventory, candidate).find((span) => span.kind === "payload") as ParserFieldSpan;
        const encodedLength = candidate.subarray(updated.headerStart + 1, updated.valueStart);
        expect(encodedLength).toEqual(length === 256
          ? Uint8Array.of(0, 0, 0, 0, 0, 0, 1, 0)
          : Uint8Array.of(0, 0, 0, 0, 0, 1, 0, 0));
        const parsed = parseSecretCommitmentFrame(candidate);
        expect(parsed).toBeDefined();
        const payloadKey = inventory.resultKeys[inventory.resultKeys.length - 1] as keyof ParsedSecretCommitmentFrame;
        expect((parsed?.[payloadKey] as Uint8Array | undefined)?.length).toBe(length);
      }
    }
  });

  test("enforces every payload and the complete-frame boundary controls serially", async () => {
    const inventory = parserLiteralInventories[0] as ParserLiteralInventory;
    const payload = parserLayout(inventory).find((span) => span.kind === "payload") as ParserFieldSpan;
    const parsePayload = (length: number): ParsedSecretCommitmentFrame | undefined => parseSecretCommitmentFrame(
      parserReplaceValue(frameBytes(inventory.literalHex), payload, new Uint8Array(length))
    );
    expect(parsePayload(8_388_607)).not.toBeUndefined();
    expect(parsePayload(8_388_608)).not.toBeUndefined();
    expect(parsePayload(8_388_609)).toBeUndefined();

    for (const authority of parserLiteralInventories.slice(1)) {
      const authorityPayload = parserLayout(authority).find((span) => span.kind === "payload") as ParserFieldSpan;
      await withFreshParserByteSeam(normalFreshByteSnapshot, (fresh) => {
        const parseAuthorityPayload = (length: number): ParsedSecretCommitmentFrame | undefined => fresh.parseSecretCommitmentFrame(
          parserReplaceValue(frameBytes(authority.literalHex), authorityPayload, new Uint8Array(length))
        );
        expect(parseAuthorityPayload(8_388_607)).not.toBeUndefined();
        expect(parseAuthorityPayload(8_388_608)).not.toBeUndefined();
        expect(parseAuthorityPayload(8_388_609)).toBeUndefined();
      });
    }

    const parseComplete = (length: number): ParsedSecretCommitmentFrame | undefined => {
      const withPayload = parserReplaceValue(frameBytes(inventory.literalHex), payload, new Uint8Array(8_388_608));
      const updatedWorkspace = parserLayout(inventory, withPayload).find((span) => span.name === "workspaceId") as ParserFieldSpan;
      return parseSecretCommitmentFrame(parserReplaceValue(withPayload, updatedWorkspace, new Uint8Array(length)));
    };

    expect(parseComplete(65_417)).not.toBeUndefined();
    expect(parseComplete(65_418)).not.toBeUndefined();
    expect(parseComplete(65_419)).toBeUndefined();
  }, 600_000);
});
