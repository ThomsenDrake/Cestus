import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import {
  CENTRAL_FL_ICE_PREVIEW,
  createFileCentralFloridaIcePreviewCheckpointStore,
  createCentralFloridaIcePreviewWorkflow,
  type CentralFloridaIceCandidateInspection,
  type CentralFloridaIcePreviewCheckpoint,
  type CentralFloridaIcePreviewCheckpointDraft,
  type CentralFloridaIcePreviewCheckpointStore,
  type CentralFloridaIcePreviewValidationReceipt,
  type CentralFloridaIcePreviewWorkspaceSnapshot,
  type PreviewFilesystemPort,
  type PreviewMountInspectionPort,
  type PreviewMountRecord,
  type PreviewPathMetadata,
  inspectCentralFloridaIceCandidates
} from "../src/central-fl-ice-preview.js";
import { runCentralFloridaIcePreviewCli } from "../src/central-fl-ice-preview-cli.js";
import {
  LocalFilesystemScanner,
  stableLocalFilesystemOccurrenceId
} from "../src/local-filesystem.js";
import {
  createLegacyImportRuntime,
  type LegacyImportRuntime
} from "../src/legacy-runtime.js";
import { stableLegacyAssertionId } from "../src/legacy-staging.js";
import {
  buildLegacyMigrationReport,
  reportArtifactJson,
  sha256,
  stableJson,
  type LegacyMigrationReport
} from "../src/legacy-report.js";
import { buildIngestionProjection } from "../src/projection.js";
import {
  mountedWorkspaceCapabilities,
  type MountedWorkspace
} from "../src/mount-contract.js";
import { createPortableIngestionMountResolver } from "../src/portable-mount.js";
import {
  legacyConfidenceSchema,
  legacySecretSafeDiagnosticTextSchema
} from "../src/legacy-types.js";

type FakeNode =
  | { kind: "directory"; deviceId: string; entries: string[] }
  | { kind: "file"; deviceId: string; bytes: Uint8Array; inode: string }
  | { kind: "symlink"; deviceId: string }
  | { kind: "other"; deviceId: string };

const sourceRoot = CENTRAL_FL_ICE_PREVIEW.sourceRoot;
const sourceMount = CENTRAL_FL_ICE_PREVIEW.sourceMount;
const destinationRoot = CENTRAL_FL_ICE_PREVIEW.destinationRoot;
const destinationParent = "/home/drake/.local/share/cestus/previews";
const sourceDeviceId = "source-dev";
const destinationDeviceId = "destination-dev";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function withFillers(files: Record<string, string>): Record<string, string> {
  const filled = { ...files };
  let index = 0;

  while (Object.keys(filled).length < CENTRAL_FL_ICE_PREVIEW.expectedFileCount) {
    const name = `zz-fixtures/filler-${String(index).padStart(3, "0")}.txt`;
    filled[name] = `filler:${index}`;
    index += 1;
  }

  return filled;
}

function makeHarness(input?: {
  files?: Record<string, string>;
  sourceEntries?: string[];
  sourceRealpath?: string;
  sourceMountRecord?: Partial<PreviewMountRecord>;
  destinationMountRecord?: Partial<PreviewMountRecord>;
  destinationNode?: FakeNode;
  nestedMounts?: Record<string, PreviewMountRecord>;
}): {
  filesystem: PreviewFilesystemPort;
  mounts: PreviewMountInspectionPort;
  nodes: Map<string, FakeNode>;
  reads: string[];
  writes: string[];
} {
  const files = input?.files ?? withFillers({
    "current.txt": "same",
    "archive/copy.txt": "same",
    "superseded/old.json": "{\"old\":true}"
  });
  const nodes = new Map<string, FakeNode>();
  const directoryEntries = new Map<string, string[]>();

  directoryEntries.set(sourceRoot, input?.sourceEntries ?? []);
  directoryEntries.set(destinationParent, ["unrelated"]);

  for (const [relativePath, text] of Object.entries(files)) {
    const segments = relativePath.split("/");
    let current: string = sourceRoot;

    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index]!;
      const next = posix.join(current, segment);
      const entries = directoryEntries.get(current) ?? [];
      if (!entries.includes(segment)) {
        entries.push(segment);
      }
      directoryEntries.set(current, entries);
      directoryEntries.set(next, directoryEntries.get(next) ?? []);
      current = next;
    }

    const name = segments.at(-1)!;
    const entries = directoryEntries.get(current) ?? [];
    if (!entries.includes(name)) {
      entries.push(name);
    }
    directoryEntries.set(current, entries);
    nodes.set(posix.join(current, name), {
      kind: "file",
      deviceId: sourceDeviceId,
      bytes: Buffer.from(text),
      inode: `inode:${relativePath}`
    });
  }

  for (const [path, entries] of directoryEntries) {
    nodes.set(path, {
      kind: "directory",
      deviceId: path.startsWith(sourceRoot) ? sourceDeviceId : destinationDeviceId,
      entries
    });
  }

  if (input?.destinationNode !== undefined) {
    nodes.set(destinationRoot, input.destinationNode);
    const parent = nodes.get(destinationParent);
    const destinationName = posix.basename(destinationRoot);
    if (parent?.kind === "directory" && !parent.entries.includes(destinationName)) {
      parent.entries.push(destinationName);
    }
  }

  const reads: string[] = [];
  const writes: string[] = [];
  const sourceRecord: PreviewMountRecord = {
    target: sourceMount,
    source: CENTRAL_FL_ICE_PREVIEW.sourceDevice,
    fileSystem: "apfs",
    options: ["ro", "nosuid", "nodev", "noexec", "uid=1000", "gid=1000"],
    deviceId: sourceDeviceId,
    ...input?.sourceMountRecord
  };
  const destinationRecord: PreviewMountRecord = {
    target: "/",
    source: "/dev/internal",
    fileSystem: "btrfs",
    options: ["rw", "nosuid", "nodev"],
    deviceId: destinationDeviceId,
    ...input?.destinationMountRecord
  };

  return {
    nodes,
    reads,
    writes,
    filesystem: {
      exists(path) {
        return nodes.has(path);
      },
      realpath(path) {
        if (path === sourceRoot) {
          return input?.sourceRealpath ?? sourceRoot;
        }
        if (!nodes.has(path)) {
          throw new Error(`missing:${path}`);
        }
        return path;
      },
      lstat(path): PreviewPathMetadata {
        const node = nodes.get(path);
        if (node === undefined) {
          throw new Error(`missing:${path}`);
        }
        return {
          kind: node.kind,
          deviceId: node.deviceId,
          sizeBytes: node.kind === "file" ? node.bytes.byteLength : 0,
          inode: node.kind === "file" ? node.inode : `inode:${path}`
        };
      },
      readDirectory(path) {
        const node = nodes.get(path);
        if (node?.kind !== "directory") {
          throw new Error(`not-directory:${path}`);
        }
        return [...node.entries];
      },
      readFile(path) {
        reads.push(path);
        const node = nodes.get(path);
        if (node?.kind !== "file") {
          throw new Error(`not-file:${path}`);
        }
        return node.bytes;
      }
    },
    mounts: {
      inspect(path) {
        return input?.nestedMounts?.[path]
          ?? (path.startsWith(sourceRoot) ? sourceRecord : destinationRecord);
      }
    }
  };
}

function run(harness: ReturnType<typeof makeHarness>) {
  return inspectCentralFloridaIceCandidates(
    {
      filesystem: harness.filesystem,
      mounts: harness.mounts
    },
    {
      codeSha: "0123456789abcdef0123456789abcdef01234567"
    }
  );
}

describe("Central Florida ICE preview preflight", () => {
  it.each([
    {
      name: "source realpath",
      harness: () => makeHarness({ sourceRealpath: "/approved/elsewhere" }),
      code: "SOURCE_REALPATH_MISMATCH"
    },
    {
      name: "source device",
      harness: () => makeHarness({ sourceMountRecord: { source: "/dev/wrong" } }),
      code: "SOURCE_DEVICE_MISMATCH"
    },
    {
      name: "mount target",
      harness: () => makeHarness({ sourceMountRecord: { target: "/wrong" } }),
      code: "SOURCE_MOUNT_MISMATCH"
    },
    {
      name: "filesystem",
      harness: () => makeHarness({ sourceMountRecord: { fileSystem: "ext4" } }),
      code: "SOURCE_FILESYSTEM_MISMATCH"
    },
    {
      name: "required mount option",
      harness: () => makeHarness({
        sourceMountRecord: { options: ["ro", "nosuid", "nodev", "noexec", "uid=1000"] }
      }),
      code: "SOURCE_MOUNT_OPTIONS_MISMATCH"
    },
    {
      name: "writable source mount",
      harness: () => makeHarness({
        sourceMountRecord: {
          options: ["ro", "rw", "nosuid", "nodev", "noexec", "uid=1000", "gid=1000"]
        }
      }),
      code: "SOURCE_MOUNT_WRITABLE"
    }
  ])("fails closed on wrong $name before reading content", ({ harness: create, code }) => {
    const harness = create();

    expect(() => run(harness)).toThrowError(expect.objectContaining({ code }));
    expect(harness.reads).toEqual([]);
    expect(harness.writes).toEqual([]);
  });

  it("keeps safe repository metadata and topical token/auth analysis in the candidate set", () => {
    const harness = makeHarness({
      files: withFillers({
        ".gitignore": "node_modules",
        ".gitmodules": "[submodule \"public-data\"]",
        "token-analysis.md": "This report studies the word token.",
        "auth-history.md": "This report describes authorization policy history.",
        "secret-history.md": "This report describes secret classifications without containing secrets.",
        "cache-analysis.md": "This report describes cache evidence without containing cache output.",
        "cargo-analysis.md": "This report describes cargo movements, not a dependency cache.",
        "current.txt": "current"
      })
    });

    const result = run(harness);

    expect(
      result.candidates
        .map((candidate) => candidate.sourcePath)
        .filter((path) => !path.startsWith("zz-fixtures/"))
    ).toEqual([
      ".gitignore",
      ".gitmodules",
      "auth-history.md",
      "cache-analysis.md",
      "cargo-analysis.md",
      "current.txt",
      "secret-history.md",
      "token-analysis.md"
    ]);
    expect(harness.reads).toHaveLength(CENTRAL_FL_ICE_PREVIEW.expectedFileCount);
  });

  it.each([
    {
      name: "destination on the same filesystem device",
      harness: () => makeHarness({
        destinationMountRecord: { source: "/dev/internal", deviceId: sourceDeviceId }
      }),
      code: "DESTINATION_DEVICE_MISMATCH"
    },
    {
      name: "destination on the SSD device",
      harness: () => makeHarness({
        destinationMountRecord: { source: CENTRAL_FL_ICE_PREVIEW.sourceDevice }
      }),
      code: "DESTINATION_DEVICE_MISMATCH"
    },
    {
      name: "read-only destination",
      harness: () => makeHarness({ destinationMountRecord: { options: ["ro", "nosuid"] } }),
      code: "DESTINATION_NOT_WRITABLE"
    },
    {
      name: "pre-existing content",
      harness: () => makeHarness({
        destinationNode: {
          kind: "directory",
          deviceId: destinationDeviceId,
          entries: ["foreign.txt"]
        }
      }),
      code: "DESTINATION_COLLISION"
    }
  ])("rejects $name before content reads or writes", ({ harness: create, code }) => {
    const harness = create();

    expect(() => run(harness)).toThrowError(expect.objectContaining({ code }));
    expect(harness.reads).toEqual([]);
    expect(harness.writes).toEqual([]);
  });

  it.each([
    {
      name: "symlink",
      mutate(harness: ReturnType<typeof makeHarness>) {
        harness.nodes.set(`${sourceRoot}/current.txt`, { kind: "symlink", deviceId: sourceDeviceId });
      },
      code: "UNSAFE_FILE_TYPE"
    },
    {
      name: "special file",
      mutate(harness: ReturnType<typeof makeHarness>) {
        harness.nodes.set(`${sourceRoot}/current.txt`, { kind: "other", deviceId: sourceDeviceId });
      },
      code: "UNSAFE_FILE_TYPE"
    },
    {
      name: "nested mount",
      mutate() {},
      input: {
        nestedMounts: {
          [`${sourceRoot}/archive`]: {
            target: `${sourceRoot}/archive`,
            source: "/dev/nested",
            fileSystem: "tmpfs",
            options: ["ro"],
            deviceId: "nested-dev"
          }
        }
      },
      code: "SOURCE_MOUNT_CROSSING"
    },
    {
      name: "ZIP container",
      mutate() {},
      input: { files: { "current.txt": "same", "archive.zip": "PK", "old.json": "{}" } },
      code: "ARCHIVE_CONTAINER_FORBIDDEN"
    },
    {
      name: "count mismatch",
      mutate() {},
      input: { files: { "current.txt": "only" } },
      code: "SOURCE_FILE_COUNT_MISMATCH"
    }
  ])("rejects $name after metadata inspection but before content reads", ({ mutate, input, code }) => {
    const harness = makeHarness(input);
    mutate(harness);

    expect(() => run(harness)).toThrowError(expect.objectContaining({ code }));
    expect(harness.reads).toEqual([]);
    expect(harness.writes).toEqual([]);
  });

  it.each([
    {
      name: "writable remount",
      options: ["rw", "nosuid", "nodev", "noexec", "uid=1000", "gid=1000"],
      code: "SOURCE_MOUNT_WRITABLE"
    },
    {
      name: "missing required option",
      options: ["ro", "nosuid", "nodev", "uid=1000", "gid=1000"],
      code: "SOURCE_MOUNT_OPTIONS_MISMATCH"
    }
  ])("revalidates full mount posture for every traversed path: $name", ({ options, code }) => {
    const harness = makeHarness({
      nestedMounts: {
        [`${sourceRoot}/archive`]: {
          target: sourceMount,
          source: CENTRAL_FL_ICE_PREVIEW.sourceDevice,
          fileSystem: "apfs",
          options,
          deviceId: sourceDeviceId
        }
      }
    });

    expect(() => run(harness)).toThrowError(
      expect.objectContaining({ code })
    );
    expect(harness.reads).toEqual([]);
    expect(harness.writes).toEqual([]);
  });

  it("revalidates mount posture after each content read", () => {
    const harness = makeHarness();
    const originalRead = harness.filesystem.readFile;
    const originalInspect = harness.mounts.inspect;
    let contentRead = false;
    harness.filesystem.readFile = (path) => {
      const bytes = originalRead(path);
      contentRead = true;
      return bytes;
    };
    harness.mounts.inspect = (path) => {
      const mount = originalInspect(path);
      return contentRead && path.startsWith(sourceRoot)
        ? { ...mount, options: ["rw", "nosuid", "nodev", "noexec", "uid=1000", "gid=1000"] }
        : mount;
    };

    expect(() => run(harness)).toThrowError(
      expect.objectContaining({ code: "SOURCE_MOUNT_WRITABLE" })
    );
    expect(harness.reads).toHaveLength(1);
    expect(harness.writes).toEqual([]);
  });

  it.each([
    ".env",
    ".env.production",
    ".git/objects/aa/bb",
    "credentials.json",
    "private-key.pem",
    ".npmrc",
    ".npmrc.backup",
    ".pypirc",
    ".netrc",
    ".credentials",
    ".token",
    ".docker/config.json",
    "application_default_credentials.json",
    "credentials-backup.json",
    "github-token.txt",
    "oauth-token.json",
    "access-token.txt.bak",
    "node_modules/pkg/index.js",
    ".venv/lib/python.py",
    "dist/generated.js",
    "other-workspaces/case/file.md"
  ])("never opens or hashes forbidden material classified from metadata: %s", (forbiddenPath) => {
    const harness = makeHarness({
      files: {
        [forbiddenPath]: "do-not-read",
        "safe-a.txt": "a",
        "safe-b.txt": "b"
      }
    });

    expect(() => run(harness)).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN_MATERIAL" })
    );
    expect(harness.reads).toEqual([]);
    expect(harness.writes).toEqual([]);
  });

  it.each([
    ".pytest_cache/README.md",
    ".mypy_cache/cache.json",
    ".ruff_cache/cache",
    ".tox/py/bin/python",
    ".nox/session/bin/python",
    ".ipynb_checkpoints/notebook-checkpoint.ipynb",
    ".gradle/caches/modules.bin",
    ".cargo/config.toml",
    ".cargo/registry/index/cache",
    ".cargo/target/debug/build.out",
    "target/debug/build.out",
    ".npm/cache/index",
    ".yarn/cache/package.tgz",
    ".pnpm-store/v3/files/hash"
  ])("never opens or hashes a forbidden cache/dependency/build tree: %s", (forbiddenPath) => {
    const harness = makeHarness({
      files: {
        [forbiddenPath]: "do-not-read",
        "safe-a.txt": "a",
        "safe-b.txt": "b"
      }
    });

    expect(() => run(harness)).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN_MATERIAL" })
    );
    expect(harness.reads).toEqual([]);
    expect(harness.writes).toEqual([]);
  });

  it.each([
    "../escape.txt",
    "decomposed-e\u0301.txt",
    "slash/name.txt",
    "control-\u0001.txt"
  ])("rejects ambiguous or unsafe directory entry %s", (entry) => {
    const harness = makeHarness({ sourceEntries: [entry] });

    expect(() => run(harness)).toThrowError(
      expect.objectContaining({ code: "AMBIGUOUS_SOURCE_PATH" })
    );
    expect(harness.reads).toEqual([]);
  });

  it("produces stable ordered candidates and preserves duplicate, archived, and superseded occurrences", () => {
    const first = makeHarness();
    const second = makeHarness();
    const source = second.nodes.get(sourceRoot);
    if (source?.kind === "directory") {
      source.entries.reverse();
    }

    const firstResult = run(first);
    const secondResult = run(second);

    expect(firstResult).toEqual(secondResult);
    expect(firstResult.candidateSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(
      firstResult.candidates
        .map((candidate) => candidate.sourcePath)
        .filter((path) => !path.startsWith("zz-fixtures/"))
    ).toEqual([
      "archive/copy.txt",
      "current.txt",
      "superseded/old.json"
    ]);
    expect(firstResult.candidates
      .filter((candidate) => !candidate.sourcePath.startsWith("zz-fixtures/"))
      .map((candidate) => ({
        sourcePath: candidate.sourcePath,
        scanStatus: candidate.scanStatus,
        preservationStatus: candidate.preservationStatus
      }))).toEqual([
      {
        sourcePath: "archive/copy.txt",
        scanStatus: "new",
        preservationStatus: "archived"
      },
      {
        sourcePath: "current.txt",
        scanStatus: "duplicate",
        preservationStatus: "current"
      },
      {
        sourcePath: "superseded/old.json",
        scanStatus: "new",
        preservationStatus: "superseded"
      }
    ]);
    expect(new Set(firstResult.candidates.map((candidate) => candidate.occurrenceId))).toHaveLength(
      CENTRAL_FL_ICE_PREVIEW.expectedFileCount
    );
    expect(firstResult.exclusions).toEqual([]);
    expect(firstResult.sourceIdentity.fileCount).toBe(CENTRAL_FL_ICE_PREVIEW.expectedFileCount);
    expect(firstResult.code).toEqual({
      baseSha: CENTRAL_FL_ICE_PREVIEW.codeBaseSha,
      codeSha: "0123456789abcdef0123456789abcdef01234567"
    });

    const independentlyHashed = `sha256:${createHash("sha256")
      .update(firstResult.canonicalCandidateMaterial)
      .digest("hex")}`;
    expect(firstResult.candidateSetHash).toBe(independentlyHashed);
    expect(first.reads).toHaveLength(CENTRAL_FL_ICE_PREVIEW.expectedFileCount);
    expect(first.writes).toEqual([]);
  });

  it("does not permit callers to override the fixed preview safety authority", () => {
    const harness = makeHarness();
    const inputWithIgnoredPolicy = {
      codeSha: "0123456789abcdef0123456789abcdef01234567",
      policy: {
        sourceRoot: "/unapproved/source",
        destinationRoot: "/unapproved/destination",
        expectedFileCount: 1
      }
    };

    expect(() => inspectCentralFloridaIceCandidates(
      { filesystem: harness.filesystem, mounts: harness.mounts },
      inputWithIgnoredPolicy
    )).toThrowError(expect.objectContaining({ code: "CODE_SHA_INVALID" }));
    expect(harness.reads).toEqual([]);
  });

  it("rejects accessor-backed code SHA input without invoking the accessor", () => {
    const harness = makeHarness();
    let getterReads = 0;
    const input = {};
    Object.defineProperty(input, "codeSha", {
      enumerable: true,
      get() {
        getterReads += 1;
        return getterReads === 1
          ? "0123456789abcdef0123456789abcdef01234567"
          : "not-a-git-sha";
      }
    });

    expect(() => inspectCentralFloridaIceCandidates(
      { filesystem: harness.filesystem, mounts: harness.mounts },
      input as { codeSha: string }
    )).toThrowError(expect.objectContaining({ code: "CODE_SHA_INVALID" }));
    expect(getterReads).toBe(0);
    expect(harness.reads).toEqual([]);
  });

  it.each([
    {
      name: "custom prototype",
      input: Object.assign(Object.create({ inherited: true }) as object, {
        codeSha: "0123456789abcdef0123456789abcdef01234567"
      })
    },
    {
      name: "extra own field",
      input: {
        codeSha: "0123456789abcdef0123456789abcdef01234567",
        sourceRoot: "/unapproved/source"
      }
    }
  ])("rejects non-plain or over-specified code provenance input: $name", ({ input }) => {
    const harness = makeHarness();

    expect(() => inspectCentralFloridaIceCandidates(
      { filesystem: harness.filesystem, mounts: harness.mounts },
      input as { codeSha: string }
    )).toThrowError(expect.objectContaining({ code: "CODE_SHA_INVALID" }));
    expect(harness.reads).toEqual([]);
  });

  it("rejects identity drift when a mount port mutates and reuses its initial record", () => {
    const harness = makeHarness();
    const originalInspect = harness.mounts.inspect;
    const sharedMount: PreviewMountRecord & { target: string } = {
      target: sourceMount,
      source: CENTRAL_FL_ICE_PREVIEW.sourceDevice,
      fileSystem: "apfs",
      options: ["ro", "nosuid", "nodev", "noexec", "uid=1000", "gid=1000"],
      deviceId: sourceDeviceId
    };
    let sourceInspections = 0;
    harness.mounts.inspect = (path) => {
      if (!path.startsWith(sourceRoot)) {
        return originalInspect(path);
      }
      sourceInspections += 1;
      if (sourceInspections > 1) {
        sharedMount.target = "/mutated-source-mount";
      }
      return sharedMount;
    };

    expect(() => run(harness)).toThrowError(
      expect.objectContaining({ code: "SOURCE_MOUNT_CROSSING" })
    );
    expect(harness.reads).toEqual([]);
  });

  it("keeps initial mount provenance isolated from a port-owned options alias", () => {
    const harness = makeHarness();
    const originalInspect = harness.mounts.inspect;
    const sharedOptions = ["ro", "nosuid", "nodev", "noexec", "uid=1000", "gid=1000"];
    const initialMount = {
      target: sourceMount,
      source: CENTRAL_FL_ICE_PREVIEW.sourceDevice,
      fileSystem: "apfs",
      options: sharedOptions,
      deviceId: sourceDeviceId
    };
    let sourceInspections = 0;
    harness.mounts.inspect = (path) => {
      if (!path.startsWith(sourceRoot)) {
        return originalInspect(path);
      }
      sourceInspections += 1;
      if (sourceInspections === 1) {
        return initialMount;
      }
      if (sourceInspections === 2) {
        sharedOptions.push("port-owned-alias-mutation");
      }
      return {
        target: sourceMount,
        source: CENTRAL_FL_ICE_PREVIEW.sourceDevice,
        fileSystem: "apfs",
        options: ["ro", "nosuid", "nodev", "noexec", "uid=1000", "gid=1000"],
        deviceId: sourceDeviceId
      };
    };

    const result = run(harness);

    expect(result.sourceIdentity.mountOptions).toEqual([
      "gid=1000",
      "nodev",
      "noexec",
      "nosuid",
      "ro",
      "uid=1000"
    ]);
    expect(result.sourceIdentity.mountOptions).not.toContain("port-owned-alias-mutation");
  });

  it("rejects file identity drift when lstat mutates and reuses its inventory record", () => {
    const harness = makeHarness();
    const originalLstat = harness.filesystem.lstat;
    const targetPath = `${sourceRoot}/archive/copy.txt`;
    const sharedMetadata = { ...originalLstat(targetPath) };
    let targetInspections = 0;
    harness.filesystem.lstat = (path) => {
      if (path !== targetPath) {
        return originalLstat(path);
      }
      targetInspections += 1;
      if (targetInspections > 1) {
        sharedMetadata.inode = "mutated-reused-inode";
      }
      return sharedMetadata;
    };

    expect(() => run(harness)).toThrowError(
      expect.objectContaining({ code: "SOURCE_CHANGED_DURING_HASH" })
    );
    expect(harness.reads).toEqual([]);
    expect(harness.writes).toEqual([]);
  });

  it("deep-freezes mount-option provenance included in the inspection result", () => {
    const result = run(makeHarness());

    expect(Object.isFrozen(result.sourceIdentity.mountOptions)).toBe(true);
    expect(Object.isFrozen(result.destinationIdentity.mountOptions)).toBe(true);
    expect(() => {
      (result.sourceIdentity.mountOptions as string[]).push("rw");
    }).toThrow(TypeError);
    expect(() => {
      (result.destinationIdentity.mountOptions as string[]).push("ro");
    }).toThrow(TypeError);
  });

  it("keeps candidate material stable when the approved destination changes from absent to empty", () => {
    const absent = run(makeHarness());
    const empty = run(makeHarness({
      destinationNode: {
        kind: "directory",
        deviceId: destinationDeviceId,
        entries: []
      }
    }));

    expect(empty.destinationIdentity.initiallyPresent).toBe(true);
    expect(empty.canonicalCandidateMaterial).toBe(absent.canonicalCandidateMaterial);
    expect(empty.candidateSetHash).toBe(absent.candidateSetHash);
  });

  it("fails if a file changes after metadata inventory", () => {
    const harness = makeHarness();
    const originalRead = harness.filesystem.readFile;
    harness.filesystem.readFile = (path) => {
      const bytes = originalRead(path);
      const node = harness.nodes.get(path);
      if (node?.kind === "file") {
        node.inode = `${node.inode}:changed`;
      }
      return bytes;
    };

    expect(() => run(harness)).toThrowError(
      expect.objectContaining({ code: "SOURCE_CHANGED_DURING_HASH" })
    );
    expect(harness.writes).toEqual([]);
  });
});

function createMemoryCheckpointStore(): CentralFloridaIcePreviewCheckpointStore & {
  records: CentralFloridaIcePreviewCheckpoint[];
} {
  const records: CentralFloridaIcePreviewCheckpoint[] = [];
  return {
    records,
    readAll: () => records.map((record) => structuredClone(record)),
    append(draft: CentralFloridaIcePreviewCheckpointDraft) {
      const previous = records.at(-1);
      const material = {
        schemaVersion: "central-fl-ice-preview-checkpoint.v1" as const,
        sequence: records.length + 1,
        phase: draft.phase,
        command: draft.command,
        createdAt: draft.createdAt,
        previousStateHash: previous?.stateHash ?? null,
        allowedNextCommand: draft.allowedNextCommand,
        state: draft.state
      };
      const checkpoint: CentralFloridaIcePreviewCheckpoint = {
        ...material,
        stateHash: sha256(stableJson(material))
      };
      records.push(structuredClone(checkpoint));
      return structuredClone(checkpoint);
    }
  };
}

function validRawGateCheckpointState(): CentralFloridaIcePreviewCheckpoint["state"] {
  return {
    codeSha: "0123456789abcdef0123456789abcdef01234567",
    candidateSetHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    inventoryHash: "sha256:9999999999999999999999999999999999999999999999999999999999999999",
    sourceIdentityHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    destinationIdentityHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    candidateArtifactHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    inspectionArtifactHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    legacyReportId: "legacy_report_transition",
    reportHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    legacyCandidateSetHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    quarantineArtifactHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    eventIds: ["evt_transition_inspect"],
    artifactHashes: [
      "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      "sha256:2222222222222222222222222222222222222222222222222222222222222222"
    ],
    commands: ["inspect"],
    commandReceipts: [{
      command: "inspect",
      argv: [
        "npx",
        "tsx",
        "packages/ingestion/src/central-fl-ice-preview-cli.ts",
        "inspect"
      ],
      exitCode: 0,
      result: "passed"
    }],
    counts: { candidates: 1 },
    blockers: []
  };
}

function workflowFixture(input?: {
  forbiddenInspectEvent?: boolean;
  foreignWorkspace?: boolean;
  proposalIdMismatch?: boolean;
  extraStageProposal?: boolean;
  stagingLedgerMutation?:
    | "approval-batch"
    | "approval-stream"
    | "approval-version"
    | "proposal-stream";
  rawApprovalActorMismatch?: boolean;
  rawLedgerMutation?:
    | "extra-approval"
    | "extra-evidence"
    | "extra-link"
    | "extra-parse"
    | "arbitrary-diagnostic"
    | "extra-occurrence"
    | "inconsistent-totals"
    | "approval-foreign-stream"
    | "evidence-foreign-source"
    | "link-foreign-actor"
    | "parse-provider-lane"
    | "completion-foreign-context";
  stagingApprovalActorMismatch?: boolean;
  existingDestinationWithoutCheckpoint?: boolean;
  productionGitIdentity?: boolean;
  inspectionCodeSha?: string;
}) {
  const root = mkdtempSync(join(tmpdir(), "central-fl-preview-workflow-"));
  temporaryRoots.push(root);
  const bytes = Buffer.from("safe legacy evidence", "utf8");
  const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
  const occurrenceId = stableLocalFilesystemOccurrenceId({
    kind: "file",
    sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
    scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
    sourcePath: "evidence/current.txt",
    contentHash
  });
  const candidate = {
    occurrenceId,
    sourcePath: "evidence/current.txt",
    contentHash,
    mediaType: "text/plain",
    sizeBytes: bytes.byteLength,
    deviceId: "source-dev",
    inode: "inode-safe",
    scanStatus: "new" as const,
    preservationStatus: "current" as const,
    sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
    scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId
  };
  const canonicalCandidateMaterial = stableJson({
    version: 1,
    candidates: [candidate],
    exclusions: []
  });
  const inventoryHash = sha256(JSON.stringify([{
    sourcePath: candidate.sourcePath,
    contentHash: candidate.contentHash,
    sizeBytes: candidate.sizeBytes
  }]));
  const inspection: CentralFloridaIceCandidateInspection = {
    version: 1,
    workspaceId: CENTRAL_FL_ICE_PREVIEW.workspaceId,
    sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
    scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
    importBatchId: CENTRAL_FL_ICE_PREVIEW.importBatchId,
    stagingBatchId: CENTRAL_FL_ICE_PREVIEW.stagingBatchId,
    sourceIdentity: {
      rootRealpath: sourceRoot,
      mountTarget: CENTRAL_FL_ICE_PREVIEW.sourceMount,
      mountSource: CENTRAL_FL_ICE_PREVIEW.sourceDevice,
      fileSystem: "apfs",
      mountOptions: ["gid=1000", "nodev", "noexec", "nosuid", "ro", "uid=1000"],
      mountDeviceId: "source-dev",
      rootDeviceId: "source-dev",
      fileCount: 1,
      totalBytes: bytes.byteLength
    },
    destinationIdentity: {
      destinationPath: CENTRAL_FL_ICE_PREVIEW.destinationRoot,
      nearestExistingParent: "/home/drake/.local/share/cestus/previews",
      mountTarget: "/home",
      mountSource: "/dev/internal",
      fileSystem: "btrfs",
      mountOptions: ["rw"],
      mountDeviceId: "destination-dev",
      parentDeviceId: "destination-dev",
      initiallyPresent: false
    },
    code: {
      baseSha: CENTRAL_FL_ICE_PREVIEW.codeBaseSha,
      codeSha: input?.inspectionCodeSha
        ?? "0123456789abcdef0123456789abcdef01234567"
    },
    candidates: [candidate],
    exclusions: [],
    canonicalCandidateMaterial,
    candidateSetHash: sha256(canonicalCandidateMaterial)
  };
  let resumedInspection: CentralFloridaIceCandidateInspection = {
    ...inspection,
    destinationIdentity: {
      ...inspection.destinationIdentity,
      nearestExistingParent: CENTRAL_FL_ICE_PREVIEW.destinationRoot,
      initiallyPresent: true
    }
  };
  let resumeInspectionCalls = 0;
  let initialInspectionCalls = 0;
  let initialDriftAt: number | undefined;
  let driftedInitialInspection = inspection;
  let resumeDriftAt: number | undefined;
  let driftedInspection = resumedInspection;
  let readMutation:
    | "report"
    | "staging-preview"
    | "quarantine"
    | "premature-staging-approval"
    | undefined;
  const deterministicEvidenceId = `ev_ing_${createHash("sha256")
    .update(contentHash)
    .digest("hex")}`;
  const deterministicSourceUri =
    `cestus://ingestion/source-collections/${CENTRAL_FL_ICE_PREVIEW.sourceCollectionId}`
    + `/imports/${CENTRAL_FL_ICE_PREVIEW.importBatchId}`
    + `/content/${contentHash.replace("sha256:", "")}`;
  let stagingPreviewEvidenceId = deterministicEvidenceId;
  let rawApprovalEventId: string | undefined;
  let rawApprovedBy: string | undefined;
  let stagingApprovalEventId: string | undefined;
  let stagingApprovedBy: string | undefined;
  let evidenceEventId: string | undefined;
  let validationReceipts: CentralFloridaIcePreviewValidationReceipt[] = [{
    argv: ["fixture-validation"],
    exitCode: 0,
    result: "passed" as const
  }];
  let executionSha = inspection.code.codeSha;
  let executionDirty = false;
  let executionDriftDuringValidation: "dirty" | "head" | undefined;
  let destinationAuthorityRecheck = inspection.destinationIdentity;
  let destinationDriftAfterFullScan:
    | CentralFloridaIceCandidateInspection["destinationIdentity"]
    | undefined;
  const report = buildLegacyMigrationReport({
    sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
    scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
    files: [{
      occurrenceId,
      sourcePath: candidate.sourcePath,
      contentHash,
      sizeBytes: bytes.byteLength,
      mediaType: "text/plain",
      sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
      scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
      status: "new"
    }],
    detections: [],
    proposedAssertionCandidates: [{
      candidateId: "legacy_candidate_preview_001",
      observationId: "legacy_observation_preview_001",
      evidenceContentHash: contentHash,
      sourcePath: candidate.sourcePath,
      predicate: "mentions",
      object: "Central Florida",
      confidence: legacyConfidenceSchema.parse(0.7)
    }],
    quarantineEntries: [{
      quarantineId: "legacy_quarantine_preview_001",
      sourcePath: candidate.sourcePath,
      contentHash,
      plugin: { name: "preview-fixture", version: "0.1.0" },
      issueCategory: "stale-reference",
      message: legacySecretSafeDiagnosticTextSchema.parse(
        "A stale reference requires evidence review."
      ),
      legacyIds: [],
      repairActions: [
        legacySecretSafeDiagnosticTextSchema.parse("Review the imported evidence.")
      ]
    }]
  });
  const ledger = new InMemoryEventLedger();
  const blobStore = new FileBlobStore(join(root, "blobs"));
  const derivativeStore = new FileBlobStore(join(root, "derivatives"));
  const close = vi.fn();
  const workspace: MountedWorkspace & { close(): void } = {
    workspaceId: input?.foreignWorkspace
      ? "ws_foreign_preview"
      : CENTRAL_FL_ICE_PREVIEW.workspaceId,
    label: "Preview fixture",
    ledger,
    blobStore,
    derivativeStore,
    jobStateRoot: join(root, "jobs"),
    capabilities: mountedWorkspaceCapabilities({
      canReadLedger: true,
      canAppendLedger: true,
      canWriteBlobs: true,
      canWriteDerivatives: true,
      canWriteJobState: true
    }),
    close
  };
  const fixedTime = "2026-07-27T12:00:00.000Z";
  const previewActor = {
    id: "actor_central_fl_ice_preview",
    kind: "agent" as const,
    label: "Central Florida ICE preview"
  };
  const context = {
    actor: previewActor,
    occurredAt: fixedTime,
    correlationId: "corr_central_fl_preview",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", ingestion: "0.1.0", legacy: "0.1.0" }
  };
  const append = async (event: Omit<KnowledgeEvent, "id" | "sequence">) =>
    ledger.append(event as never);
  const calls: string[] = [];
  const runtime: LegacyImportRuntime = {
    async inspect(command) {
      calls.push("runtime.inspect");
      expect(command.selectedFiles).toEqual([expect.objectContaining({
        occurrenceId,
        sourcePath: candidate.sourcePath,
        contentHash
      })]);
      command.revalidateAuthority?.();
      await append({
        type: "ingestion.source.registered",
        version: 1,
        streamId: `ingestion_source_${CENTRAL_FL_ICE_PREVIEW.sourceCollectionId}`,
        context: {
          ...context,
          correlationId: `corr_${CENTRAL_FL_ICE_PREVIEW.sourceCollectionId}`,
          packVersions: { core: "0.1.0", ingestion: "0.1.0" }
        },
        payload: {
          sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
          label: "Central Florida ICE legacy investigation",
          mode: "read-only",
          adapter: { name: "local-filesystem", version: "0.1.0" },
          rootUri: "file:///mnt/cestus_legacy_ssd/Cestus/central-fl-ice-workspace",
          workspaceUri: `cestus-workspace://${CENTRAL_FL_ICE_PREVIEW.workspaceId}`
        }
      });
      await append({
        type: "ingestion.scan.started",
        version: 1,
        streamId: `ingestion_scan_${CENTRAL_FL_ICE_PREVIEW.scanBatchId}`,
        context: {
          ...context,
          correlationId: `corr_${CENTRAL_FL_ICE_PREVIEW.scanBatchId}`,
          packVersions: { core: "0.1.0", ingestion: "0.1.0" }
        },
        payload: {
          scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
          sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
          hashPolicy: "sha256-dry-run",
          startedAt: fixedTime
        }
      });
      await append({
        type: "ingestion.occurrence.observed",
        version: 1,
        streamId: `ingestion_scan_${CENTRAL_FL_ICE_PREVIEW.scanBatchId}`,
        context: {
          ...context,
          correlationId: `corr_${CENTRAL_FL_ICE_PREVIEW.scanBatchId}`,
          packVersions: { core: "0.1.0", ingestion: "0.1.0" }
        },
        payload: {
          occurrenceId,
          scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
          sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
          contentHash,
          sourcePath: candidate.sourcePath,
          sizeBytes: bytes.byteLength,
          observedAt: fixedTime,
          status: "new",
          adapter: { name: "local-filesystem", version: "0.1.0" }
        }
      });
      await append({
        type: "ingestion.scan.completed",
        version: 1,
        streamId: `ingestion_scan_${CENTRAL_FL_ICE_PREVIEW.scanBatchId}`,
        context: {
          ...context,
          correlationId: `corr_${CENTRAL_FL_ICE_PREVIEW.scanBatchId}`,
          packVersions: { core: "0.1.0", ingestion: "0.1.0" }
        },
        payload: {
          scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
          sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
          completedAt: fixedTime,
          inventoryHash,
          totals: {
            observedFiles: 1,
            uniqueContent: 1,
            duplicateOccurrences: 0,
            skipped: 0,
            bytes: bytes.byteLength,
            estimatedNewBlobBytes: bytes.byteLength
          }
        }
      });
      const reportStored = await derivativeStore.put(
        Buffer.from(reportArtifactJson(report), "utf8")
      );
      expect(reportStored.contentHash).toBe(report.reportHash);
      const reportEvent = await append({
        type: "legacy.import.report.generated",
        version: 1,
        streamId: `legacy_report_${report.sourceCollectionId}_${report.scanBatchId}_${report.legacyReportId}`,
        context: {
          ...context,
          correlationId: `corr_${report.legacyReportId}`
        },
        payload: {
          legacyReportId: report.legacyReportId,
          sourceCollectionId: report.sourceCollectionId,
          scanBatchId: report.scanBatchId,
          reportHash: report.reportHash,
          candidateSetHash: report.candidateSetHash,
          generatedAt: report.generatedAt,
          generator: report.generator,
          totals: report.totals
        }
      });
      if (input?.forbiddenInspectEvent) {
        await append({
          type: "prr.request.sent",
          version: 1,
          streamId: "prr_request_preview_forbidden",
          context,
          payload: {
            requestId: "prr_preview_forbidden",
            sentAt: fixedTime,
            channel: "email",
            externalMessageId: "message_preview_forbidden"
          }
        } as never);
      }
      command.revalidateAuthority?.();
      return {
        ok: true,
        command: "legacy inspect",
        workspace: { workspaceId: workspace.workspaceId, label: workspace.label },
        sourceCollectionId: report.sourceCollectionId,
        scanBatchId: report.scanBatchId,
        eventIds: [reportEvent.id],
        nextActions: ["review legacy report"],
        legacyReportId: report.legacyReportId,
        reportHash: report.reportHash,
        candidateSetHash: report.candidateSetHash,
        totals: report.totals
      };
    },
    async report() {
      if (readMutation === "report") {
        readMutation = undefined;
        await appendPreviewDiagnostic();
      } else if (readMutation === "premature-staging-approval") {
        readMutation = undefined;
        await appendStagingApproval("actor_human_preview");
      }
      return {
        ok: true,
        command: "legacy report",
        workspace: { workspaceId: workspace.workspaceId, label: workspace.label },
        sourceCollectionId: report.sourceCollectionId,
        scanBatchId: report.scanBatchId,
        eventIds: [],
        nextActions: ["inspect quarantine entries"],
        legacyReportId: report.legacyReportId,
        reportHash: report.reportHash,
        candidateSetHash: report.candidateSetHash,
        totals: report.totals,
        report,
        review: {
          sourceCollectionId: report.sourceCollectionId,
          latestReportId: report.legacyReportId,
          rawImportRequiresApproval: true,
          ontologyStagingApproved: false,
          firstArtifactAsk: [],
          diagnostics: [],
          selectedReportId: report.legacyReportId,
          isLatestReport: true
        }
      };
    },
    async quarantine() {
      if (readMutation === "quarantine") {
        readMutation = undefined;
        await appendPreviewDiagnostic();
      }
      return {
        ok: true,
        command: "legacy quarantine",
        workspace: { workspaceId: workspace.workspaceId, label: workspace.label },
        sourceCollectionId: report.sourceCollectionId,
        scanBatchId: report.scanBatchId,
        eventIds: [],
        nextActions: ["review legacy report"],
        legacyReportId: report.legacyReportId,
        reportHash: report.reportHash,
        quarantineEntries: report.quarantineEntries
      };
    },
    async approveRawImport(command) {
      calls.push("runtime.approveRawImport");
      const event = await append({
        type: "ingestion.import.approved",
        version: 1,
        streamId: input?.rawLedgerMutation === "approval-foreign-stream"
          ? "ingestion_import_foreign_gate1"
          : `ingestion_import_${CENTRAL_FL_ICE_PREVIEW.sourceCollectionId}_${CENTRAL_FL_ICE_PREVIEW.scanBatchId}_${CENTRAL_FL_ICE_PREVIEW.importBatchId}`,
        context: {
          ...context,
          correlationId: `corr_${CENTRAL_FL_ICE_PREVIEW.importBatchId}`,
          packVersions: { core: "0.1.0", ingestion: "0.1.0" },
          actor: {
            id: input?.rawApprovalActorMismatch
              ? "actor_wrong_preview_agent"
              : context.actor.id,
            kind: "agent",
            label: input?.rawApprovalActorMismatch
              ? "Wrong preview agent"
              : context.actor.label
          }
        },
        payload: {
          importBatchId: CENTRAL_FL_ICE_PREVIEW.importBatchId,
          scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
          sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
          approvedBy: command.approvedBy,
          approvedAt: fixedTime
        }
      });
      rawApprovalEventId = event.id;
      rawApprovedBy = command.approvedBy;
      return {
        ok: true,
        command: "legacy approve-import",
        workspace: { workspaceId: workspace.workspaceId, label: workspace.label },
        sourceCollectionId: report.sourceCollectionId,
        scanBatchId: report.scanBatchId,
        eventIds: [event.id],
        nextActions: ["run raw import"],
        importBatchId: CENTRAL_FL_ICE_PREVIEW.importBatchId
      };
    },
    async importApproved(command) {
      calls.push("runtime.importApproved");
      if (rawApprovalEventId === undefined) {
        throw new Error("fixture raw approval is missing");
      }
      expect(command.selectedFiles).toEqual([expect.objectContaining({
        occurrenceId,
        contentHash
      })]);
      const evidence = await append({
        type: "evidence.ingested",
        version: 1,
        streamId: `evidence_${deterministicEvidenceId}`,
        context: {
          ...context,
          correlationId: `corr_${deterministicEvidenceId}`,
          packVersions: { core: "0.1.0" }
        },
        payload: {
          evidenceId: deterministicEvidenceId,
          source: {
            kind: "dataset",
            label: input?.rawLedgerMutation === "evidence-foreign-source"
              ? "Foreign Gate 1 material"
              : `Public ingestion import ${CENTRAL_FL_ICE_PREVIEW.sourceCollectionId}/${CENTRAL_FL_ICE_PREVIEW.importBatchId}`,
            uri: deterministicSourceUri
          },
          contentHash,
          mediaType: "text/plain",
          sizeBytes: bytes.byteLength
        }
      });
      evidenceEventId = evidence.id;
      await blobStore.put(bytes);
      const link = await append({
        type: "ingestion.evidence.linked",
        version: 1,
        streamId: `ingestion_evidence_link_${CENTRAL_FL_ICE_PREVIEW.sourceCollectionId}_${CENTRAL_FL_ICE_PREVIEW.scanBatchId}_${CENTRAL_FL_ICE_PREVIEW.importBatchId}_${contentHash.replace("sha256:", "")}`,
        context: {
          ...context,
          actor: input?.rawLedgerMutation === "link-foreign-actor"
            ? { id: "actor_foreign_gate1", kind: "agent", label: "Foreign Gate 1 actor" }
            : previewActor,
          causationId: rawApprovalEventId,
          correlationId: `corr_${CENTRAL_FL_ICE_PREVIEW.importBatchId}`,
          packVersions: { core: "0.1.0", ingestion: "0.1.0" }
        },
        payload: {
          evidenceId: deterministicEvidenceId,
          importBatchId: CENTRAL_FL_ICE_PREVIEW.importBatchId,
          sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
          contentHash,
          occurrenceIds: input?.rawLedgerMutation === "extra-occurrence"
            ? [occurrenceId, "occ_foreign_gate1"]
            : [occurrenceId]
        }
      });
      const completed = await append({
        type: "ingestion.import.completed",
        version: 1,
        streamId: `ingestion_import_${CENTRAL_FL_ICE_PREVIEW.sourceCollectionId}_${CENTRAL_FL_ICE_PREVIEW.scanBatchId}_${CENTRAL_FL_ICE_PREVIEW.importBatchId}`,
        context: {
          ...context,
          causationId: rawApprovalEventId,
          correlationId: input?.rawLedgerMutation === "completion-foreign-context"
            ? "corr_foreign_gate1"
            : `corr_${CENTRAL_FL_ICE_PREVIEW.importBatchId}`,
          packVersions: { core: "0.1.0", ingestion: "0.1.0" }
        },
        payload: {
          importBatchId: CENTRAL_FL_ICE_PREVIEW.importBatchId,
          scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
          sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
          completedAt: fixedTime,
          totals: {
            evidenceCreated: 1,
            occurrencesLinked: input?.rawLedgerMutation === "inconsistent-totals" ? 2 : 1,
            duplicatesReused: 0,
            skipped: 0
          }
        }
      });
      const parseJob = await append({
        type: "ingestion.parse.job.created",
        version: 1,
        streamId: `ingestion_parse_${CENTRAL_FL_ICE_PREVIEW.sourceCollectionId}_${CENTRAL_FL_ICE_PREVIEW.importBatchId}_parse_${CENTRAL_FL_ICE_PREVIEW.importBatchId}_${contentHash.replace("sha256:", "").slice(0, 16)}`,
        context: {
          ...context,
          actor: { id: "actor_local_parser", kind: "system", label: "Local Parser" },
          correlationId: `corr_parse_${CENTRAL_FL_ICE_PREVIEW.importBatchId}_${contentHash.replace("sha256:", "").slice(0, 16)}`,
          packVersions: { core: "0.1.0", ingestion: "0.1.0" }
        },
        payload: {
          parseJobId: `parse_${CENTRAL_FL_ICE_PREVIEW.importBatchId}_${contentHash.replace("sha256:", "").slice(0, 16)}`,
          sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
          importBatchId: CENTRAL_FL_ICE_PREVIEW.importBatchId,
          evidenceId: deterministicEvidenceId,
          lane: input?.rawLedgerMutation === "parse-provider-lane" ? "provider" : "local",
          parser: { name: "local-text", version: "0.1.0" },
          state: "queued"
        }
      });
      if (input?.rawLedgerMutation === "extra-approval") {
        await append({
          type: "ingestion.import.approved",
          version: 1,
          streamId: "ingestion_import_foreign_gate1",
          context,
          payload: {
            importBatchId: CENTRAL_FL_ICE_PREVIEW.importBatchId,
            scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
            sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
            approvedBy: rawApprovedBy!,
            approvedAt: fixedTime
          }
        });
      }
      if (input?.rawLedgerMutation === "extra-evidence") {
        await append({
          type: "evidence.ingested",
          version: 1,
          streamId: "evidence_ev_foreign_gate1",
          context,
          payload: {
            evidenceId: "ev_foreign_gate1",
            source: { kind: "dataset", label: "Foreign Gate 1 material" },
            contentHash,
            mediaType: "text/plain",
            sizeBytes: bytes.byteLength
          }
        });
      }
      if (input?.rawLedgerMutation === "extra-link") {
        await append({
          type: "ingestion.evidence.linked",
          version: 1,
          streamId: "ingestion_evidence_link_foreign_gate1",
          context: { ...context, causationId: rawApprovalEventId },
          payload: {
            evidenceId: deterministicEvidenceId,
            importBatchId: CENTRAL_FL_ICE_PREVIEW.importBatchId,
            sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
            contentHash,
            occurrenceIds: [occurrenceId]
          }
        });
      }
      if (input?.rawLedgerMutation === "extra-parse") {
        await append({
          type: "ingestion.parse.job.created",
          version: 1,
          streamId: "ingestion_parse_parse_foreign_gate1",
          context,
          payload: {
            parseJobId: "parse_foreign_gate1",
            sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
            importBatchId: CENTRAL_FL_ICE_PREVIEW.importBatchId,
            evidenceId: deterministicEvidenceId,
            lane: "local",
            parser: { name: "local-text", version: "0.1.0" },
            state: "queued"
          }
        });
      }
      if (input?.rawLedgerMutation === "arbitrary-diagnostic") {
        await append({
          type: "diagnostic.recorded",
          version: 1,
          streamId: "diagnostic_foreign_gate1",
          context,
          payload: {
            diagnosticId: "diag_foreign_gate1",
            severity: "error",
            category: "ingestion",
            message: "Foreign diagnostic material.",
            repairHint: {
              contract: "Foreign.contract",
              violatedPath: "foreign",
              allowedActions: ["reject foreign diagnostic"]
            }
          }
        });
      }
      return {
        ok: true,
        command: "legacy import",
        workspace: { workspaceId: workspace.workspaceId, label: workspace.label },
        sourceCollectionId: report.sourceCollectionId,
        scanBatchId: report.scanBatchId,
        eventIds: [evidence.id, link.id, completed.id, parseJob.id],
        nextActions: ["preview ontology staging"],
        importBatchId: CENTRAL_FL_ICE_PREVIEW.importBatchId,
        totals: {
          evidenceCreated: 1,
          occurrencesLinked: 1,
          duplicatesReused: 0,
          skipped: 0
        }
      };
    },
    async stagingPreview() {
      calls.push("runtime.stagingPreview");
      if (readMutation === "staging-preview") {
        readMutation = undefined;
        await appendPreviewDiagnostic();
      }
      return {
        ok: true,
        command: "legacy staging-preview",
        workspace: { workspaceId: workspace.workspaceId, label: workspace.label },
        sourceCollectionId: report.sourceCollectionId,
        scanBatchId: report.scanBatchId,
        eventIds: [],
        nextActions: ["approve ontology staging"],
        legacyReportId: report.legacyReportId,
        reportHash: report.reportHash,
        candidateSetHash: report.candidateSetHash,
        candidates: [{
          ...report.proposedAssertionCandidates[0]!,
          evidenceId: stagingPreviewEvidenceId
        }],
        quarantineEntries: report.quarantineEntries
      };
    },
    async approveStaging(command) {
      calls.push("runtime.approveStaging");
      const event = await appendStagingApproval(
        command.approvedBy,
        command.approvedAssertionCandidateIds
      );
      return {
        ok: true,
        command: "legacy approve-staging",
        workspace: { workspaceId: workspace.workspaceId, label: workspace.label },
        sourceCollectionId: report.sourceCollectionId,
        scanBatchId: report.scanBatchId,
        eventIds: [event.id],
        nextActions: ["stage approved assertion proposals"],
        legacyReportId: report.legacyReportId,
        stagingBatchId: CENTRAL_FL_ICE_PREVIEW.stagingBatchId,
        reportHash: report.reportHash,
        candidateSetHash: report.candidateSetHash,
        approvedAssertionCandidateIds: [...command.approvedAssertionCandidateIds]
      };
    },
    async stageApproved() {
      calls.push("runtime.stageApproved");
      if (
        stagingApprovalEventId === undefined
        || stagingApprovedBy === undefined
        || evidenceEventId === undefined
      ) {
        throw new Error("fixture staging approval is missing");
      }
      const assertionId = stableLegacyAssertionId({
        sourceCollectionId: report.sourceCollectionId,
        scanBatchId: report.scanBatchId,
        stagingBatchId: CENTRAL_FL_ICE_PREVIEW.stagingBatchId,
        candidateSetHash: report.candidateSetHash
      }, "legacy_candidate_preview_001");
      const event = await append({
        type: "assertion.proposed",
        version: 1,
        streamId: input?.stagingLedgerMutation === "proposal-stream"
          ? "assertion_as_foreign_gate2"
          : `assertion_${assertionId}`,
        context: {
          ...context,
          actor: {
            id: stagingApprovedBy,
            kind: "human",
            label: "Central Florida ICE preview approver"
          },
          causationId: evidenceEventId,
          correlationId: `corr_${assertionId}`,
          packVersions: { core: "0.1.0" }
        },
        payload: {
          assertionId,
          evidenceId: deterministicEvidenceId,
          predicate: "mentions",
          object: "Central Florida",
          confidence: 0.7,
          reviewState: "proposed"
        }
      });
      if (input?.extraStageProposal) {
        await append({
          type: "assertion.proposed",
          version: 1,
          streamId: "assertion_as_foreign_gate2",
          context: {
            ...context,
            actor: {
              id: stagingApprovedBy,
              kind: "human",
              label: "Central Florida ICE preview approver"
            },
            causationId: evidenceEventId
          },
          payload: {
            assertionId: "as_foreign_gate2",
            evidenceId: deterministicEvidenceId,
            predicate: "mentions",
            object: "Unapproved material",
            confidence: 0.7,
            reviewState: "proposed"
          }
        });
      }
      return {
        ok: true,
        command: "legacy stage",
        workspace: { workspaceId: workspace.workspaceId, label: workspace.label },
        sourceCollectionId: report.sourceCollectionId,
        scanBatchId: report.scanBatchId,
        eventIds: [event.id],
        nextActions: ["review legacy report"],
        legacyReportId: report.legacyReportId,
        stagingBatchId: CENTRAL_FL_ICE_PREVIEW.stagingBatchId,
        proposedAssertionIds: [
          input?.proposalIdMismatch
            ? "as_central_fl_preview_mismatched"
            : assertionId
        ]
      };
    }
  };

  async function appendPreviewDiagnostic() {
    return append({
      type: "diagnostic.recorded",
      version: 1,
      streamId: "diagnostic_central_fl_preview_read",
      context,
      payload: {
        diagnosticId: "diag_central_fl_preview_read",
        severity: "warning",
        category: "ingestion",
        message: "Nominal preview read unexpectedly mutated the ledger.",
        repairHint: {
          contract: "ZipArchiveAdapter.expand",
          violatedPath: "preview-read",
          allowedActions: ["retry supervised preview read"]
        }
      }
    });
  }

  async function appendStagingApproval(
    approvedBy: string,
    approvedAssertionCandidateIds: readonly string[] = ["legacy_candidate_preview_001"]
  ) {
    const event = await append({
        type: "legacy.ontology.staging.approved",
        version: 1,
        streamId: input?.stagingLedgerMutation === "approval-stream"
          ? "legacy_staging_foreign_gate2"
          : `legacy_staging_${report.sourceCollectionId}_${report.scanBatchId}_${CENTRAL_FL_ICE_PREVIEW.stagingBatchId}`,
        context: {
          ...context,
          actor: {
            id: input?.stagingApprovalActorMismatch
              ? "actor_human_wrong"
              : approvedBy,
            kind: "human",
            label: "Central Florida ICE preview approver"
          },
          correlationId: `corr_${CENTRAL_FL_ICE_PREVIEW.stagingBatchId}`
        },
        payload: {
          stagingBatchId: input?.stagingLedgerMutation === "approval-batch"
            ? "legacy_stage_foreign_gate2_001"
            : CENTRAL_FL_ICE_PREVIEW.stagingBatchId,
          legacyReportId: report.legacyReportId,
          sourceCollectionId: report.sourceCollectionId,
          scanBatchId: report.scanBatchId,
          reportHash: report.reportHash,
          candidateSetHash: report.candidateSetHash,
          approvedBy,
          approvedAt: fixedTime,
          approvedAssertionCandidateIds: [...approvedAssertionCandidateIds]
      }
    });
    stagingApprovalEventId = event.id;
    stagingApprovedBy = approvedBy;
    return event;
  }
  const createWorkspace = vi.fn(() => calls.push("createWorkspace"));
  const mountResolver = {
    resolve: vi.fn(async () => ({ ok: true as const, workspace }))
  };
  const checkpointStore = createMemoryCheckpointStore();
  const readWorkspaceSnapshot = async (): Promise<CentralFloridaIcePreviewWorkspaceSnapshot> => {
    const events = (await ledger.readAll()).map((event): KnowledgeEvent => {
      if (
        input?.stagingLedgerMutation === "approval-version"
        && event.type === "legacy.ontology.staging.approved"
      ) {
        return { ...event, version: 2 } as unknown as KnowledgeEvent;
      }
      return event;
    });
    const projection = buildIngestionProjection(events);
    return {
      events,
      occurrences: [...projection.occurrencesById.values()].map((occurrence) => ({
        occurrenceId: occurrence.occurrenceId,
        sourceCollectionId: occurrence.sourceCollectionId,
        scanBatchId: occurrence.scanBatchId,
        sourcePath: occurrence.sourcePath,
        contentHash: occurrence.contentHash as `sha256:${string}`
      })),
      evidenceLinks: [...projection.evidenceLinks.values()].map((link) => ({
        eventId: link.linkedEventId,
        evidenceId: link.evidenceId,
        importBatchId: link.importBatchId,
        sourceCollectionId: link.sourceCollectionId,
        contentHash: link.contentHash as `sha256:${string}`,
        occurrenceIds: [...link.occurrenceIds]
      }))
    };
  };
  const workflow = createCentralFloridaIcePreviewWorkflow({
    ...(input?.productionGitIdentity === true
      ? {}
      : {
          codeSha: () => {
            calls.push("codeSha");
            if (executionDirty) {
              throw new Error("preview Git execution identity is dirty");
            }
            return executionSha;
          }
        }),
    now: () => fixedTime,
    initialInspection: () => {
      calls.push("initialInspection");
      initialInspectionCalls += 1;
      if (initialInspectionCalls >= 2 && destinationDriftAfterFullScan !== undefined) {
        destinationAuthorityRecheck = destinationDriftAfterFullScan;
      }
      return initialDriftAt !== undefined && initialInspectionCalls >= initialDriftAt
        ? driftedInitialInspection
        : inspection;
    },
    resumeInspection: () => {
      calls.push("resumeInspection");
      resumeInspectionCalls += 1;
      return resumeDriftAt !== undefined && resumeInspectionCalls >= resumeDriftAt
        ? driftedInspection
        : resumedInspection;
    },
    createWorkspace,
    destinationExists: () => input?.existingDestinationWithoutCheckpoint === true,
    mountResolver,
    legacyRuntimeFactory: () => runtime,
    readWorkspaceSnapshot,
    checkpointStore,
    runEngineeringValidations: () => {
      if (executionDriftDuringValidation === "dirty") {
        executionDirty = true;
      } else if (executionDriftDuringValidation === "head") {
        executionSha = "fedcba9876543210fedcba9876543210fedcba98";
      }
      executionDriftDuringValidation = undefined;
      return validationReceipts;
    },
    revalidateDestinationAuthority: () => destinationAuthorityRecheck
  });

  return {
    workflow,
    calls,
    createWorkspace,
    mountResolver,
    checkpointStore,
    ledger,
    workspace,
    report,
    inspection,
    candidate,
    bytes,
    contentHash,
    inventoryHash,
    occurrenceId,
    derivativeRoot: join(root, "derivatives"),
    setExecutionDirty() {
      executionDirty = true;
    },
    setExecutionSha(value: string) {
      executionSha = value;
    },
    driftExecutionDuringValidation(value: "dirty" | "head") {
      executionDriftDuringValidation = value;
    },
    setResumedInspection(value: CentralFloridaIceCandidateInspection) {
      resumedInspection = value;
      driftedInspection = value;
    },
    driftResumeAfter(additionalCalls: number, value: CentralFloridaIceCandidateInspection) {
      resumeDriftAt = resumeInspectionCalls + additionalCalls;
      driftedInspection = value;
    },
    driftInitialAfter(additionalCalls: number, value: CentralFloridaIceCandidateInspection) {
      initialDriftAt = initialInspectionCalls + additionalCalls;
      driftedInitialInspection = value;
    },
    driftDestinationAfterFullScan(
      value: CentralFloridaIceCandidateInspection["destinationIdentity"]
    ) {
      destinationDriftAfterFullScan = value;
    },
    mutateOnNextRead(value: typeof readMutation) {
      readMutation = value;
    },
    setStagingPreviewEvidenceId(value: string) {
      stagingPreviewEvidenceId = value;
    },
    failEngineeringValidation() {
      validationReceipts = [{
        argv: ["fixture-validation"],
        exitCode: 1,
        result: "failed"
      }];
    }
  };
}

describe("Central Florida ICE supervised preview workflow", () => {
  it("does not accept a hostile alternate Git repository through inherited process state", async () => {
    const hostileRoot = mkdtempSync(join(tmpdir(), "central-fl-hostile-git-"));
    temporaryRoots.push(hostileRoot);
    const trustedTestEnv = {
      PATH: "/usr/bin:/bin",
      LANG: "C",
      LC_ALL: "C",
      HOME: hostileRoot,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_OPTIONAL_LOCKS: "0"
    };
    execFileSync("/usr/bin/git", ["init", "--quiet"], {
      cwd: hostileRoot,
      env: trustedTestEnv,
      stdio: "ignore"
    });
    writeFileSync(join(hostileRoot, "foreign.txt"), "foreign repository\n", "utf8");
    const hostileBin = join(hostileRoot, "bin");
    mkdirSync(hostileBin);
    writeFileSync(
      join(hostileBin, "git"),
      "#!/bin/sh\nexec /usr/bin/git \"$@\"\n",
      "utf8"
    );
    chmodSync(join(hostileBin, "git"), 0o755);
    const hostileConfig = join(hostileRoot, "hostile.gitconfig");
    writeFileSync(hostileConfig, "[user]\nname = Hostile Config\n", "utf8");
    execFileSync("/usr/bin/git", [
      "add",
      "foreign.txt",
      "bin/git",
      "hostile.gitconfig"
    ], {
      cwd: hostileRoot,
      env: trustedTestEnv,
      stdio: "ignore"
    });
    execFileSync("/usr/bin/git", [
      "-c",
      "user.name=Foreign Test",
      "-c",
      "user.email=foreign@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "foreign"
    ], {
      cwd: hostileRoot,
      env: trustedTestEnv,
      stdio: "ignore"
    });
    const hostileSha = execFileSync("/usr/bin/git", ["rev-parse", "--verify", "HEAD"], {
      cwd: hostileRoot,
      encoding: "utf8",
      env: trustedTestEnv,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const tracePath = join(hostileRoot, ".git", "hostile-git-trace.log");
    const fixture = workflowFixture({
      productionGitIdentity: true,
      inspectionCodeSha: hostileSha
    });
    const hostileKeys = [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_CONFIG_GLOBAL",
      "GIT_TRACE",
      "PATH"
    ] as const;
    const savedEnvironment = new Map(
      hostileKeys.map((key) => [key, process.env[key]])
    );
    let caught: unknown;
    try {
      process.env.GIT_DIR = join(hostileRoot, ".git");
      process.env.GIT_WORK_TREE = hostileRoot;
      process.env.GIT_CONFIG_GLOBAL = hostileConfig;
      process.env.GIT_TRACE = tracePath;
      process.env.PATH = `${hostileBin}:${process.env.PATH ?? ""}`;
      await fixture.workflow.inspect();
    } catch (error) {
      caught = error;
    } finally {
      for (const [key, value] of savedEnvironment) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toContain(hostileSha);
    expect((caught as Error).message).not.toContain(hostileRoot);
    expect(fixture.createWorkspace).not.toHaveBeenCalled();
    expect(await fixture.ledger.readAll()).toEqual([]);
    expect(fixture.checkpointStore.records).toEqual([]);
    expect(existsSync(tracePath)).toBe(false);
  });

  it("rejects a dirty Git execution identity before inspection can create or write", async () => {
    const fixture = workflowFixture();
    fixture.setExecutionDirty();

    await expect(fixture.workflow.inspect()).rejects.toThrow(
      "preview Git execution identity is dirty"
    );

    expect(fixture.createWorkspace).not.toHaveBeenCalled();
    expect(await fixture.ledger.readAll()).toEqual([]);
    expect(fixture.checkpointStore.records).toEqual([]);
  });

  it("does not expose a raw-import transition before a persisted inspection gate", async () => {
    const fixture = workflowFixture();

    await expect(fixture.workflow.rawImport({
      approvedBy: "actor_human_preview"
    })).rejects.toThrow("raw-import approval is not the allowed next transition");
    expect(fixture.createWorkspace).not.toHaveBeenCalled();
  });

  it("creates only after preflight, delegates exact selected files, persists Gate 1, and writes no evidence", async () => {
    const fixture = workflowFixture();

    const checkpoint = await fixture.workflow.inspect();

    expect(checkpoint.phase).toBe("raw-approval-required");
    expect(checkpoint.allowedNextCommand).toBe("raw-import");
    expect(checkpoint.state.inventoryHash).toBe(fixture.inventoryHash);
    expect(checkpoint.state.commandReceipts).toEqual([{
      command: "inspect",
      argv: [
        "npx",
        "tsx",
        "packages/ingestion/src/central-fl-ice-preview-cli.ts",
        "inspect"
      ],
      exitCode: 0,
      result: "passed"
    }]);
    expect(fixture.calls.indexOf("initialInspection")).toBeLessThan(
      fixture.calls.indexOf("createWorkspace")
    );
    expect(fixture.calls.indexOf("createWorkspace")).toBeLessThan(
      fixture.calls.indexOf("runtime.inspect")
    );
    expect(
      fixture.calls.filter((call) => call === "resumeInspection").length
    ).toBeGreaterThanOrEqual(6);
    expect(checkpoint.state.candidateArtifactHash).toBe(
      fixture.inspection.candidateSetHash
    );
    expect((await fixture.ledger.readAll()).map((event) => event.type)).not.toContain(
      "ingestion.import.approved"
    );
    expect((await fixture.ledger.readAll()).map((event) => event.type)).not.toContain(
      "evidence.ingested"
    );
  });

  it("rechecks stable source and destination authority immediately before first workspace creation", async () => {
    const fixture = workflowFixture();
    fixture.driftInitialAfter(2, {
      ...fixture.inspection,
      candidateSetHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    });

    await expect(fixture.workflow.inspect()).rejects.toThrow(
      "source or mount authority changed"
    );
    expect(fixture.calls.filter((call) => call === "initialInspection")).toHaveLength(2);
    expect(fixture.createWorkspace).not.toHaveBeenCalled();
    expect(await fixture.ledger.readAll()).toEqual([]);
    expect(fixture.checkpointStore.records).toEqual([]);
  });

  it("rechecks destination authority after the final source scan and immediately before create", async () => {
    const fixture = workflowFixture();
    fixture.driftDestinationAfterFullScan({
      ...fixture.inspection.destinationIdentity,
      mountSource: CENTRAL_FL_ICE_PREVIEW.sourceDevice,
      mountDeviceId: "source-dev",
      parentDeviceId: "source-dev"
    });

    await expect(fixture.workflow.inspect()).rejects.toThrow(
      "destination authority changed immediately before workspace creation"
    );

    expect(fixture.createWorkspace).not.toHaveBeenCalled();
    expect(fixture.checkpointStore.records).toEqual([]);
  });

  it("revalidates the exact candidate set before raw approval and performs no approval on drift", async () => {
    const fixture = workflowFixture();
    await fixture.workflow.inspect();
    fixture.setResumedInspection({
      ...fixture.inspection,
      candidateSetHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    });

    await expect(fixture.workflow.rawImport({
      approvedBy: "actor_human_preview"
    })).rejects.toThrow("source candidate material or code identity changed");
    expect(fixture.calls).not.toContain("runtime.approveRawImport");
  });

  it("rejects a dirty Git execution identity between supervised phases", async () => {
    const fixture = workflowFixture();
    await fixture.workflow.inspect();
    const eventsBefore = await fixture.ledger.readAll();
    const artifactsBefore = regularFileMaterials(fixture.derivativeRoot);
    const checkpointsBefore = structuredClone(fixture.checkpointStore.records);
    fixture.setExecutionDirty();

    await expect(fixture.workflow.rawImport({
      approvedBy: "actor_human_preview"
    })).rejects.toThrow("preview Git execution identity is dirty");

    expect(await fixture.ledger.readAll()).toEqual(eventsBefore);
    expect(regularFileMaterials(fixture.derivativeRoot)).toEqual(artifactsBefore);
    expect(fixture.checkpointStore.records).toEqual(checkpointsBefore);
  });

  it("rejects a clean changed HEAD between supervised phases", async () => {
    const fixture = workflowFixture();
    await fixture.workflow.inspect();
    const eventsBefore = await fixture.ledger.readAll();
    const artifactsBefore = regularFileMaterials(fixture.derivativeRoot);
    const checkpointsBefore = structuredClone(fixture.checkpointStore.records);
    fixture.setExecutionSha("fedcba9876543210fedcba9876543210fedcba98");

    await expect(fixture.workflow.rawImport({
      approvedBy: "actor_human_preview"
    })).rejects.toThrow("source candidate material or code identity changed");

    expect(await fixture.ledger.readAll()).toEqual(eventsBefore);
    expect(regularFileMaterials(fixture.derivativeRoot)).toEqual(artifactsBefore);
    expect(fixture.checkpointStore.records).toEqual(checkpointsBefore);
  });

  it("revalidates destination separation before every post-gate workspace command", async () => {
    const fixture = workflowFixture();
    await fixture.workflow.inspect();
    await fixture.workflow.rawImport({
      approvedBy: "actor_human_preview"
    });
    const mountsBefore = fixture.mountResolver.resolve.mock.calls.length;
    fixture.setResumedInspection({
      ...fixture.inspection,
      destinationIdentity: {
        ...fixture.inspection.destinationIdentity,
        mountSource: CENTRAL_FL_ICE_PREVIEW.sourceDevice,
        mountDeviceId: fixture.inspection.sourceIdentity.mountDeviceId
      }
    });

    await expect(fixture.workflow.stagingPreview()).rejects.toThrow(
      "source candidate material or code identity changed"
    );
    expect(fixture.mountResolver.resolve).toHaveBeenCalledTimes(mountsBefore);
  });

  it("suppresses derivative and checkpoint writes when destination authority drifts during a command", async () => {
    const fixture = workflowFixture();
    await fixture.workflow.inspect();
    await fixture.workflow.rawImport({
      approvedBy: "actor_human_preview"
    });
    const checkpointsBefore = fixture.checkpointStore.records.length;
    fixture.driftResumeAfter(2, {
      ...fixture.inspection,
      destinationIdentity: {
        ...fixture.inspection.destinationIdentity,
        mountSource: CENTRAL_FL_ICE_PREVIEW.sourceDevice,
        mountDeviceId: fixture.inspection.sourceIdentity.mountDeviceId
      }
    });

    await expect(fixture.workflow.stagingPreview()).rejects.toThrow(
      "source candidate material or code identity changed"
    );
    expect(fixture.calls).toContain("runtime.stagingPreview");
    expect(fixture.checkpointStore.records).toHaveLength(checkpointsBefore);
    expect(fixture.checkpointStore.records.at(-1)?.state.dossierArtifactHash).toBeUndefined();
    expect(fixture.checkpointStore.records.at(-1)?.state.stagingPreviewArtifactHash).toBeUndefined();
  });

  it("requires staging-preview report and preview reads to have zero ledger delta", async () => {
    const fixture = workflowFixture();
    await fixture.workflow.inspect();
    await fixture.workflow.rawImport({ approvedBy: "actor_human_preview" });
    fixture.mutateOnNextRead("report");

    await expect(fixture.workflow.stagingPreview()).rejects.toThrow(
      "nominal preview read mutated the ledger"
    );
    expect(fixture.checkpointStore.records.at(-1)?.phase).toBe("staging-preview-required");
  });

  it("snapshots stage before report reads and rejects a premature otherwise-allowed approval event", async () => {
    const fixture = workflowFixture();
    await fixture.workflow.inspect();
    await fixture.workflow.rawImport({ approvedBy: "actor_human_preview" });
    await fixture.workflow.stagingPreview();
    fixture.mutateOnNextRead("premature-staging-approval");

    await expect(fixture.workflow.stage({
      approvedBy: "actor_human_preview",
      candidateIds: ["legacy_candidate_preview_001"]
    })).rejects.toThrow("nominal preview read mutated the ledger");
    expect(fixture.checkpointStore.records.at(-1)?.phase).toBe("staging-approval-required");
  });

  it("requires handoff report and quarantine reads to have zero ledger delta", async () => {
    const fixture = workflowFixture();
    await fixture.workflow.inspect();
    await fixture.workflow.rawImport({ approvedBy: "actor_human_preview" });
    await fixture.workflow.stagingPreview();
    await fixture.workflow.stage({
      approvedBy: "actor_human_preview",
      candidateIds: ["legacy_candidate_preview_001"]
    });
    fixture.mutateOnNextRead("quarantine");

    await expect(fixture.workflow.handoff()).rejects.toThrow(
      "nominal preview read mutated the ledger"
    );
    expect(fixture.checkpointStore.records.at(-1)?.phase).toBe("handoff-required");
  });

  it("loads Gate 2 material by checkpoint hash and rejects a rederived evidence binding swap", async () => {
    const fixture = workflowFixture();
    await fixture.workflow.inspect();
    await fixture.workflow.rawImport({ approvedBy: "actor_human_preview" });
    await fixture.workflow.stagingPreview();
    fixture.setStagingPreviewEvidenceId("ev_central_fl_preview_swapped");

    await expect(fixture.workflow.stage({
      approvedBy: "actor_human_preview",
      candidateIds: ["legacy_candidate_preview_001"]
    })).rejects.toThrow("stored staging preview");
    expect(fixture.calls).not.toContain("runtime.approveStaging");
  });

  it("rejects a raw approval whose ledger context actor is not the exact preview agent", async () => {
    const fixture = workflowFixture({ rawApprovalActorMismatch: true });
    await fixture.workflow.inspect();

    await expect(fixture.workflow.rawImport({
      approvedBy: "actor_human_preview"
    })).rejects.toThrow("authoritative raw approval");
    expect(fixture.checkpointStore.records.at(-1)?.phase).toBe("raw-approval-required");
  });

  for (const mutation of [
    "extra-approval",
    "extra-evidence",
    "extra-link",
    "extra-parse",
    "arbitrary-diagnostic",
    "extra-occurrence",
    "inconsistent-totals"
  ] as const) {
    it(`rejects Gate 1 ledger mutation ${mutation} outside the exact candidate set`, async () => {
      const fixture = workflowFixture({ rawLedgerMutation: mutation });
      await fixture.workflow.inspect();

      await expect(fixture.workflow.rawImport({
        approvedBy: "actor_human_preview"
      })).rejects.toThrow("exact Gate 1 candidate set");

      expect(fixture.checkpointStore.records.at(-1)?.phase).toBe("raw-approval-required");
    });
  }

  for (const mutation of [
    "approval-foreign-stream",
    "evidence-foreign-source",
    "link-foreign-actor",
    "parse-provider-lane",
    "completion-foreign-context"
  ] as const) {
    it(`rejects same-count Gate 1 substitution ${mutation}`, async () => {
      const fixture = workflowFixture({ rawLedgerMutation: mutation });
      await fixture.workflow.inspect();

      await expect(fixture.workflow.rawImport({
        approvedBy: "actor_human_preview"
      })).rejects.toThrow("canonical Gate 1 event material");

      expect(fixture.checkpointStore.records.at(-1)?.phase).toBe("raw-approval-required");
    });
  }

  it("rejects a staging approval whose ledger context actor is not the named human approver", async () => {
    const fixture = workflowFixture({ stagingApprovalActorMismatch: true });
    await fixture.workflow.inspect();
    await fixture.workflow.rawImport({ approvedBy: "actor_human_preview" });
    await fixture.workflow.stagingPreview();

    await expect(fixture.workflow.stage({
      approvedBy: "actor_human_preview",
      candidateIds: ["legacy_candidate_preview_001"]
    })).rejects.toThrow("authoritative staging approval");
    expect(fixture.checkpointStore.records.at(-1)?.phase).toBe("staging-approval-required");
  });

  it("rejects every assertion proposal outside the exact approved Gate 2 subset", async () => {
    const fixture = workflowFixture({ extraStageProposal: true });
    await fixture.workflow.inspect();
    await fixture.workflow.rawImport({ approvedBy: "actor_human_preview" });
    const preview = await fixture.workflow.stagingPreview();

    await expect(fixture.workflow.stage({
      approvedBy: "actor_human_preview",
      candidateIds: [...(preview.state.stagingCandidateIds ?? [])]
    })).rejects.toThrow("exact approved Gate 2 subset");

    expect(fixture.checkpointStore.records.at(-1)?.phase).toBe("staging-approval-required");
  });

  for (const mutation of [
    "approval-batch",
    "approval-stream",
    "approval-version",
    "proposal-stream"
  ] as const) {
    it(`rejects same-count Gate 2 substitution ${mutation}`, async () => {
      const fixture = workflowFixture({ stagingLedgerMutation: mutation });
      await fixture.workflow.inspect();
      await fixture.workflow.rawImport({ approvedBy: "actor_human_preview" });
      const preview = await fixture.workflow.stagingPreview();

      await expect(fixture.workflow.stage({
        approvedBy: "actor_human_preview",
        candidateIds: [...(preview.state.stagingCandidateIds ?? [])]
      })).rejects.toThrow();

      expect(fixture.checkpointStore.records.at(-1)?.phase).toBe("staging-approval-required");
    });
  }

  it("runs both human gates, imports evidence, proposes only selected evidence-bound assertions, blocks provider dispatch, replays, and manifests", async () => {
    const fixture = workflowFixture();
    await fixture.workflow.inspect();
    const imported = await fixture.workflow.rawImport({
      approvedBy: "actor_human_preview"
    });
    expect(imported.phase).toBe("staging-preview-required");
    expect(imported.state.counts).toMatchObject({
      evidenceCreated: 1,
      occurrencesLinked: 1
    });
    expect(imported.state).toEqual(expect.objectContaining({
      rawApprovalEventId: expect.stringMatching(/^evt_/),
      rawApprovedBy: "actor_human_preview"
    }));

    await expect(fixture.workflow.stage({
      approvedBy: "actor_human_preview",
      candidateIds: ["legacy_candidate_preview_001"]
    })).rejects.toThrow("stage approval is not the allowed next transition");

    const preview = await fixture.workflow.stagingPreview();
    expect(preview.phase).toBe("staging-approval-required");
    expect(preview.state.stagingCandidateIds).toEqual([
      "legacy_candidate_preview_001"
    ]);
    await expect(fixture.workflow.stage({
      approvedBy: "actor_human_preview",
      candidateIds: ["legacy_candidate_not_present"]
    })).rejects.toThrow("exact staging preview");
    const staged = await fixture.workflow.stage({
      approvedBy: "actor_human_preview",
      candidateIds: ["legacy_candidate_preview_001"]
    });
    expect(staged.phase).toBe("handoff-required");
    expect(staged.state).toEqual(expect.objectContaining({
      stagingApprovalEventId: expect.stringMatching(/^evt_/),
      stagingApprovedBy: "actor_human_preview",
      approvedStagingCandidateIds: ["legacy_candidate_preview_001"]
    }));
    const events = await fixture.ledger.readAll();
    expect(events.filter((event) => event.type === "assertion.proposed")).toHaveLength(1);
    expect(events.map((event) => event.type)).not.toContain("assertion.accepted");
    expect(events.map((event) => event.type)).not.toContain("agent.tool.completed");

    const handoff = await fixture.workflow.handoff();
    expect(handoff.phase).toBe("replay-verification-required");
    expect(handoff.state.blockers).toContainEqual(expect.objectContaining({
      code: "provider-mounted-authority-unavailable",
      resumable: true,
      resumableWithinMission: false,
      resumeScope: "fresh-approved-provider-mission",
      repairAction: expect.stringContaining("fresh approved provider mission")
    }));
    expect(handoff.state.blockers[0]).not.toHaveProperty("allowedNextCommand");
    const handoffBytes = await fixture.workspace.derivativeStore.get(
      handoff.state.handoffArtifactHash!
    );
    const handoffValue = JSON.parse(handoffBytes.toString("utf8"));
    expect(handoffValue.specialist).toEqual(expect.objectContaining({
      status: "blocked"
    }));
    expect(handoffValue.draftTaskCandidates[0]).toEqual(expect.objectContaining({
      status: "draft",
      sendPermitted: false
    }));
    expect(handoffValue.draftPrrCandidates[0]).toEqual(expect.objectContaining({
      status: "draft",
      sendPermitted: false
    }));

    const replay = await fixture.workflow.verifyReplay();
    expect(replay.phase).toBe("manifest-required");
    expect(replay.state.counts).toMatchObject({
      evidenceLinks: 1,
      replayedProposals: 1
    });
    const complete = await fixture.workflow.manifest();
    expect(complete.phase).toBe("complete");
    expect(complete.allowedNextCommand).toBeNull();
    expect(complete.state.finalManifestArtifactHash).toMatch(/^sha256:/);
    const manifestBytes = await fixture.workspace.derivativeStore.get(
      complete.state.finalManifestArtifactHash!
    );
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    expect(manifest.commands).toEqual([
      "inspect",
      "raw-import",
      "staging-preview",
      "stage",
      "handoff",
      "verify-replay",
      "manifest"
    ]);
    expect(manifest.source.identity).toEqual(expect.objectContaining({
      mountSource: CENTRAL_FL_ICE_PREVIEW.sourceDevice,
      fileCount: 1,
      totalBytes: fixture.bytes.byteLength
    }));
    expect(manifest.destination.identity).toEqual(expect.objectContaining({
      initiallyPresent: true,
      mountSource: "/dev/internal"
    }));
    expect(manifest.hashes).toEqual(expect.objectContaining({
      candidateArtifactHash: fixture.inspection.candidateSetHash,
      scannerInventoryHash: imported.state.inventoryHash,
      inspectionArtifactHash: expect.stringMatching(/^sha256:/),
      quarantineArtifactHash: expect.stringMatching(/^sha256:/),
      dossierArtifactHash: expect.stringMatching(/^sha256:/),
      stagingPreviewArtifactHash: expect.stringMatching(/^sha256:/)
    }));
    expect(manifest.approvals).toEqual({
      rawImport: {
        eventId: imported.state.rawApprovalEventId,
        approvedBy: "actor_human_preview"
      },
      staging: {
        eventId: staged.state.stagingApprovalEventId,
        approvedBy: "actor_human_preview",
        candidateIds: ["legacy_candidate_preview_001"]
      }
    });
    expect(manifest.commandReceipts.map((receipt: { argv: string[] }) => receipt.argv))
      .toEqual([
        ["npx", "tsx", "packages/ingestion/src/central-fl-ice-preview-cli.ts", "inspect"],
        ["npx", "tsx", "packages/ingestion/src/central-fl-ice-preview-cli.ts", "raw-import", "--approved-by", "actor_human_preview"],
        ["npx", "tsx", "packages/ingestion/src/central-fl-ice-preview-cli.ts", "staging-preview"],
        ["npx", "tsx", "packages/ingestion/src/central-fl-ice-preview-cli.ts", "stage", "--approved-by", "actor_human_preview", "--candidate", "legacy_candidate_preview_001"],
        ["npx", "tsx", "packages/ingestion/src/central-fl-ice-preview-cli.ts", "handoff"],
        ["npx", "tsx", "packages/ingestion/src/central-fl-ice-preview-cli.ts", "verify-replay"],
        ["npx", "tsx", "packages/ingestion/src/central-fl-ice-preview-cli.ts", "manifest"]
      ]);
    expect(manifest.validationReceipts).toEqual([{
      argv: ["fixture-validation"],
      exitCode: 0,
      result: "passed"
    }]);
    expect(fixture.workspace.close).toHaveBeenCalled();
  });

  it("fails closed on a foreign portable workspace identity", async () => {
    const fixture = workflowFixture({ foreignWorkspace: true });

    await expect(fixture.workflow.inspect()).rejects.toThrow("inspection blocked");
    expect(fixture.checkpointStore.records.at(-1)?.phase).toBe("inspection-blocked");
    expect(fixture.calls).not.toContain("runtime.inspect");
  });

  it("does not persist a final manifest when an exact engineering validation fails", async () => {
    const fixture = workflowFixture();
    await fixture.workflow.inspect();
    await fixture.workflow.rawImport({ approvedBy: "actor_human_preview" });
    const preview = await fixture.workflow.stagingPreview();
    await fixture.workflow.stage({
      approvedBy: "actor_human_preview",
      candidateIds: [...(preview.state.stagingCandidateIds ?? [])]
    });
    await fixture.workflow.handoff();
    await fixture.workflow.verifyReplay();
    fixture.failEngineeringValidation();

    await expect(fixture.workflow.manifest()).rejects.toThrow(
      "engineering validation failed"
    );

    expect(fixture.checkpointStore.records.at(-1)?.phase).toBe("manifest-required");
    expect(fixture.checkpointStore.records.at(-1)?.state.finalManifestArtifactHash)
      .toBeUndefined();
  });

  it("rechecks clean exact execution identity after manifest validations before writes", async () => {
    const fixture = workflowFixture();
    await fixture.workflow.inspect();
    await fixture.workflow.rawImport({ approvedBy: "actor_human_preview" });
    const preview = await fixture.workflow.stagingPreview();
    await fixture.workflow.stage({
      approvedBy: "actor_human_preview",
      candidateIds: [...(preview.state.stagingCandidateIds ?? [])]
    });
    await fixture.workflow.handoff();
    await fixture.workflow.verifyReplay();
    const artifactsBefore = regularFileMaterials(fixture.derivativeRoot);
    const checkpointsBefore = structuredClone(fixture.checkpointStore.records);
    fixture.driftExecutionDuringValidation("dirty");

    await expect(fixture.workflow.manifest()).rejects.toThrow(
      "preview Git execution identity is dirty"
    );

    expect(regularFileMaterials(fixture.derivativeRoot)).toEqual(artifactsBefore);
    expect(fixture.checkpointStore.records).toEqual(checkpointsBefore);
    expect(fixture.checkpointStore.records.at(-1)?.phase).toBe("manifest-required");
  });

  it("does not create, mutate, or checkpoint an existing foreign destination without preview state", async () => {
    const fixture = workflowFixture({
      foreignWorkspace: true,
      existingDestinationWithoutCheckpoint: true
    });

    await expect(fixture.workflow.inspect()).rejects.toThrow(
      "canonical portable preview workspace identity mismatch"
    );

    expect(fixture.createWorkspace).not.toHaveBeenCalled();
    expect(fixture.checkpointStore.records).toEqual([]);
    expect(await fixture.ledger.readAll()).toEqual([]);
  });

  it("rejects forbidden events appended by a delegated runtime", async () => {
    const fixture = workflowFixture({ forbiddenInspectEvent: true });

    await expect(fixture.workflow.inspect()).rejects.toThrow("inspection blocked");
    expect(fixture.checkpointStore.records.at(-1)?.phase).toBe("inspection-blocked");
  });

  it("ignores a runtime proposal ID claim and persists exact authoritative ledger readback", async () => {
    const fixture = workflowFixture({ proposalIdMismatch: true });
    await fixture.workflow.inspect();
    await fixture.workflow.rawImport({
      approvedBy: "actor_human_preview"
    });
    await fixture.workflow.stagingPreview();

    const checkpoint = await fixture.workflow.stage({
      approvedBy: "actor_human_preview",
      candidateIds: ["legacy_candidate_preview_001"]
    });
    expect(checkpoint.phase).toBe("handoff-required");
    expect(checkpoint.state.proposedAssertionIds).toEqual([
      stableLegacyAssertionId({
        sourceCollectionId: fixture.report.sourceCollectionId,
        scanBatchId: fixture.report.scanBatchId,
        stagingBatchId: CENTRAL_FL_ICE_PREVIEW.stagingBatchId,
        candidateSetHash: fixture.report.candidateSetHash
      }, "legacy_candidate_preview_001")
    ]);
    expect(checkpoint.state.proposedAssertionIds).not.toContain(
      "as_central_fl_preview_mismatched"
    );
  });

  it("has no provider or raw workspace capability in its dependency boundary", () => {
    const dependencies = {
      codeSha: () => "0123456789abcdef0123456789abcdef01234567"
    };
    let unsafeGetterReads = 0;
    Object.defineProperty(dependencies, "specialistGateway", {
      enumerable: true,
      get() {
        unsafeGetterReads += 1;
        return { workspace: {}, report: {} };
      }
    });

    createCentralFloridaIcePreviewWorkflow(dependencies);

    expect(unsafeGetterReads).toBe(0);
  });

  it("detects append-only checkpoint tampering on internal temporary storage", () => {
    const root = mkdtempSync(join(tmpdir(), "central-fl-preview-checkpoint-"));
    temporaryRoots.push(root);
    const store = createFileCentralFloridaIcePreviewCheckpointStore(root);
    store.append({
      phase: "raw-approval-required",
      command: "inspect",
      createdAt: "2026-07-27T12:00:00.000Z",
      allowedNextCommand: "raw-import",
      state: validRawGateCheckpointState()
    });
    const checkpointRoot = join(root, "jobs", "central-fl-ice-engineering-preview");
    const [name] = readdirSync(checkpointRoot);
    const path = join(checkpointRoot, name!);
    const tampered = JSON.parse(readFileSync(path, "utf8"));
    tampered.phase = "complete";
    writeFileSync(path, JSON.stringify(tampered), "utf8");

    expect(() => store.readAll()).toThrow("deterministic hash validation");
  });

  it("rejects renamed and unexpected checkpoint entries", () => {
    const root = mkdtempSync(join(tmpdir(), "central-fl-preview-checkpoint-name-"));
    temporaryRoots.push(root);
    const store = createFileCentralFloridaIcePreviewCheckpointStore(root);
    store.append({
      phase: "raw-approval-required",
      command: "inspect",
      createdAt: "2026-07-27T12:00:00.000Z",
      allowedNextCommand: "raw-import",
      state: validRawGateCheckpointState()
    });
    const checkpointRoot = join(root, "jobs", "central-fl-ice-engineering-preview");
    writeFileSync(join(checkpointRoot, "foreign.json"), "{}", "utf8");
    expect(() => store.readAll()).toThrow("unexpected entry");
  });

  it("rejects a valid-looking checkpoint filename rename", () => {
    const root = mkdtempSync(join(tmpdir(), "central-fl-preview-checkpoint-rename-"));
    temporaryRoots.push(root);
    const store = createFileCentralFloridaIcePreviewCheckpointStore(root);
    store.append({
      phase: "raw-approval-required",
      command: "inspect",
      createdAt: "2026-07-27T12:00:00.000Z",
      allowedNextCommand: "raw-import",
      state: validRawGateCheckpointState()
    });
    const checkpointRoot = join(root, "jobs", "central-fl-ice-engineering-preview");
    const [name] = readdirSync(checkpointRoot);
    renameSync(
      join(checkpointRoot, name!),
      join(checkpointRoot, name!.replace("000001-", "000002-"))
    );

    expect(() => store.readAll()).toThrow("filename does not match");
  });

  it("rejects recomputed checkpoint hashes when durable state schema drifts", () => {
    const root = mkdtempSync(join(tmpdir(), "central-fl-preview-checkpoint-schema-"));
    temporaryRoots.push(root);
    const store = createFileCentralFloridaIcePreviewCheckpointStore(root);
    store.append({
      phase: "raw-approval-required",
      command: "inspect",
      createdAt: "2026-07-27T12:00:00.000Z",
      allowedNextCommand: "raw-import",
      state: validRawGateCheckpointState()
    });
    const checkpointRoot = join(root, "jobs", "central-fl-ice-engineering-preview");
    const [name] = readdirSync(checkpointRoot);
    const originalPath = join(checkpointRoot, name!);
    const tampered = JSON.parse(readFileSync(originalPath, "utf8"));
    tampered.state.unexpected = "schema-drift";
    const { stateHash: _oldHash, ...material } = tampered;
    const newHash = sha256(stableJson(material));
    tampered.stateHash = newHash;
    rmSync(originalPath);
    writeFileSync(
      join(checkpointRoot, `000001-${newHash.replace(":", "-")}.json`),
      `${stableJson(tampered)}\n`,
      "utf8"
    );

    expect(() => store.readAll()).toThrow("deterministic hash validation");
  });

  it("rejects a hash-valid nonadjacent raw-gate to complete checkpoint transition", () => {
    const root = mkdtempSync(join(tmpdir(), "central-fl-preview-checkpoint-transition-"));
    temporaryRoots.push(root);
    const store = createFileCentralFloridaIcePreviewCheckpointStore(root);
    const baseState = validRawGateCheckpointState();
    store.append({
      phase: "raw-approval-required",
      command: "inspect",
      createdAt: "2026-07-27T12:00:00.000Z",
      allowedNextCommand: "raw-import",
      state: baseState
    });

    expect(() => store.append({
      phase: "complete",
      command: "manifest",
      createdAt: "2026-07-27T12:01:00.000Z",
      allowedNextCommand: null,
      state: {
        ...baseState,
        dossierArtifactHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
        stagingPreviewArtifactHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
        stagingCandidateIds: ["legacy_candidate_transition"],
        proposedAssertionIds: ["as_transition"],
        handoffArtifactHash: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
        replayArtifactHash: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
        finalManifestArtifactHash: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
        commands: ["inspect", "manifest"]
      }
    })).toThrow("checkpoint transition");
  });

  it("CLI rejects extra, duplicate, missing, and odd approval arguments without invoking a workflow", async () => {
    const factory = vi.fn(() => workflowFixture().workflow);

    await expect(runCentralFloridaIcePreviewCli([
      "raw-import",
      "--approved-by",
      "actor_human_preview",
      "--candidate",
      "legacy_candidate_preview_001"
    ], factory)).rejects.toThrow("arguments are invalid");
    await expect(runCentralFloridaIcePreviewCli([
      "raw-import",
      "--approved-by",
      "actor_human_preview",
      "--approved-by",
      "actor_human_second"
    ], factory)).rejects.toThrow("exactly one");
    await expect(runCentralFloridaIcePreviewCli([
      "stage",
      "--approved-by",
      "actor_human_preview",
      "--candidate"
    ], factory)).rejects.toThrow("arguments are invalid");
  });
});

describe("exact selected legacy filesystem seam", () => {
  it("keeps the real legacy inspect and raw-import runtimes on the exact selection and accepts inert local parse jobs", async () => {
    const root = mkdtempSync(join(tmpdir(), "central-fl-selected-runtime-"));
    temporaryRoots.push(root);
    const safePath = join(root, "evidence.txt");
    const forbiddenPath = join(root, ".env");
    writeFileSync(safePath, "safe evidence", "utf8");
    writeFileSync(forbiddenPath, "must-not-be-opened", "utf8");
    const bytes = readFileSync(safePath);
    const metadata = statSync(safePath, { bigint: true });
    const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
    const sourceCollectionId = "src_selected_runtime";
    const scanBatchId = "scan_selected_runtime_001";
    const importBatchId = "imp_selected_runtime_001";
    const occurrenceId = stableLocalFilesystemOccurrenceId({
      kind: "file",
      sourceCollectionId,
      scanBatchId,
      sourcePath: "evidence.txt",
      contentHash
    });
    const workspaceRoot = join(root, "workspace");
    const ledger = new InMemoryEventLedger();
    const workspace: MountedWorkspace = {
      workspaceId: "ws_selected_runtime",
      label: "Selected runtime",
      ledger,
      blobStore: new FileBlobStore(join(workspaceRoot, "blobs")),
      derivativeStore: new FileBlobStore(join(workspaceRoot, "derivatives")),
      jobStateRoot: join(workspaceRoot, "jobs"),
      capabilities: mountedWorkspaceCapabilities({
        canReadLedger: true,
        canAppendLedger: true,
        canWriteBlobs: true,
        canWriteDerivatives: true,
        canWriteJobState: true
      })
    };
    const runtime = createLegacyImportRuntime({
      mountedWorkspace: workspace,
      actor: { id: "actor_selected_runtime", kind: "agent", label: "Selected runtime" }
    });
    const selectedFiles = [{
      occurrenceId,
      sourcePath: "evidence.txt",
      contentHash,
      sizeBytes: bytes.byteLength,
      deviceId: metadata.dev.toString(),
      inode: metadata.ino.toString()
    }];

    let inspectSelectionReads = 0;
    const inspectCommand = {
      sourceCollectionId,
      label: "Selected runtime source",
      sourceRoot: root,
      scanBatchId
    };
    Object.defineProperty(inspectCommand, "selectedFiles", {
      get() {
        inspectSelectionReads += 1;
        if (inspectSelectionReads > 1) {
          throw new Error("raw inspect selection was reread");
        }
        return selectedFiles;
      }
    });
    const inspected = await runtime.inspect(
      inspectCommand as Parameters<LegacyImportRuntime["inspect"]>[0]
    );
    expect(inspected.ok).toBe(true);
    expect(inspectSelectionReads).toBe(1);
    const approved = await runtime.approveRawImport({
      sourceCollectionId,
      scanBatchId,
      importBatchId,
      approvedBy: "actor_human_selected_runtime"
    });
    expect(approved.ok).toBe(true);
    let importSelectionReads = 0;
    const importCommand = {
      sourceCollectionId,
      scanBatchId,
      importBatchId
    };
    Object.defineProperty(importCommand, "selectedFiles", {
      get() {
        importSelectionReads += 1;
        if (importSelectionReads > 1) {
          throw new Error("raw import selection was reread");
        }
        return selectedFiles;
      }
    });
    const imported = await runtime.importApproved(
      importCommand as Parameters<LegacyImportRuntime["importApproved"]>[0]
    );

    expect(imported.ok).toBe(true);
    expect(importSelectionReads).toBe(1);
    const events = await ledger.readAll();
    expect(events.filter((event) => event.type === "ingestion.occurrence.observed")
      .map((event) => event.type === "ingestion.occurrence.observed"
        ? event.payload.sourcePath
        : "")).toEqual(["evidence.txt"]);
    expect(events.map((event) => event.type)).toContain("ingestion.parse.job.created");
    expect(events.map((event) => event.type)).not.toContain("ingestion.provider.approved");
    expect(readFileSync(forbiddenPath, "utf8")).toBe("must-not-be-opened");
  });

  it("never enumerates or opens an unselected forbidden file", async () => {
    const root = mkdtempSync(join(tmpdir(), "central-fl-selected-scan-"));
    temporaryRoots.push(root);
    mkdirSync(join(root, "safe"), { recursive: true });
    const safePath = join(root, "safe", "evidence.txt");
    const forbiddenPath = join(root, ".env");
    writeFileSync(safePath, "safe evidence", "utf8");
    writeFileSync(forbiddenPath, "must-not-be-opened", "utf8");
    const safeBytes = readFileSync(safePath);
    const metadata = statSync(safePath, { bigint: true });
    const contentHash = `sha256:${createHash("sha256").update(safeBytes).digest("hex")}` as const;
    const occurrenceId = stableLocalFilesystemOccurrenceId({
      kind: "file",
      sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
      scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
      sourcePath: "safe/evidence.txt",
      contentHash
    });
    const ledger = new InMemoryEventLedger();
    const scanner = new LocalFilesystemScanner({
      ledger,
      actor: { id: "actor_selected_scan", kind: "system", label: "Selected scan" }
    });

    const result = await scanner.scan({
      sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
      scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
      rootDir: root,
      selectedFiles: [{
        occurrenceId,
        sourcePath: "safe/evidence.txt",
        contentHash,
        sizeBytes: safeBytes.byteLength,
        deviceId: metadata.dev.toString(),
        inode: metadata.ino.toString()
      }]
    });

    expect(result.occurrences.map((item) => item.sourcePath)).toEqual([
      "safe/evidence.txt"
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(readFileSync(forbiddenPath, "utf8")).toBe("must-not-be-opened");
  });

  it("rejects a symlink swap at the selected descriptor boundary", async () => {
    const root = mkdtempSync(join(tmpdir(), "central-fl-selected-race-"));
    temporaryRoots.push(root);
    const path = join(root, "evidence.txt");
    writeFileSync(path, "approved bytes", "utf8");
    const bytes = readFileSync(path);
    const metadata = statSync(path, { bigint: true });
    const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
    const occurrenceId = stableLocalFilesystemOccurrenceId({
      kind: "file",
      sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
      scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
      sourcePath: "evidence.txt",
      contentHash
    });
    rmSync(path);
    writeFileSync(join(root, "other.txt"), "other bytes", "utf8");
    // A symlink created after the metadata-first selection must not be followed.
    const { symlinkSync } = await import("node:fs");
    symlinkSync("other.txt", path);
    const scanner = new LocalFilesystemScanner({
      ledger: new InMemoryEventLedger(),
      actor: { id: "actor_selected_race", kind: "system", label: "Selected race" }
    });

    await expect(scanner.scan({
      sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
      scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
      rootDir: root,
      selectedFiles: [{
        occurrenceId,
        sourcePath: "evidence.txt",
        contentHash,
        sizeBytes: bytes.byteLength,
        deviceId: metadata.dev.toString(),
        inode: metadata.ino.toString()
      }]
    })).rejects.toThrow();
  });
});

function portableCrashWorkflowFixture(
  failAt:
    | "raw-approval-required"
    | "staging-preview-required"
    | "handoff-required"
    | "after-inspect"
    | "after-report"
    | "after-raw-approval"
    | "after-staging-approval"
    | "all-inspect-checkpoints",
  options: {
    readonly multipleCandidates?: boolean;
    readonly emptyStagingCandidates?: boolean;
  } = {}
) {
  const root = mkdtempSync(join(tmpdir(), "central-fl-portable-crash-"));
  temporaryRoots.push(root);
  const sourceRoot = join(root, "selected-source");
  const workspaceRoot = join(root, "portable-workspace");
  mkdirSync(join(sourceRoot, "ontology"), { recursive: true });
  const sourceFiles = options.emptyStagingCandidates === true
    ? [{
        sourcePath: "ontology/field-notes.md",
        mediaType: "text/markdown",
        sourceBytes: Buffer.from(
          "# Central Florida field notes\n\nNo ontology claims are encoded here.\n",
          "utf8"
        )
      }]
    : [
    {
      sourcePath: "ontology/claims.json",
      mediaType: "application/json",
      sourceBytes: Buffer.from(JSON.stringify({
        legacyCestusType: "claims",
        claims: [{
          id: "legacy_claim_preview_crash",
          predicate: "agency.name",
          object: "Example Agency"
        }]
      }, null, 2), "utf8")
    },
    ...(options.multipleCandidates === true
      ? [{
          sourcePath: "ontology/field-notes.md",
          mediaType: "text/markdown",
          sourceBytes: Buffer.from("# Central Florida field notes\n", "utf8")
        }, {
          sourcePath: "ontology/source-record.pdf",
          mediaType: "application/pdf",
          sourceBytes: Buffer.from("%PDF-1.7\npreview fixture\n%%EOF\n", "utf8")
        }]
      : [])
    ];
  const candidates = sourceFiles.map(({ sourcePath, sourceBytes, mediaType }) => {
    const absolutePath = join(sourceRoot, sourcePath);
    writeFileSync(absolutePath, sourceBytes);
    const metadata = statSync(absolutePath, { bigint: true });
    const contentHash =
      `sha256:${createHash("sha256").update(sourceBytes).digest("hex")}` as const;
    return {
      occurrenceId: stableLocalFilesystemOccurrenceId({
        kind: "file",
        sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
        scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
        sourcePath,
        contentHash
      }),
      sourcePath,
      contentHash,
      mediaType,
      sizeBytes: sourceBytes.byteLength,
      deviceId: metadata.dev.toString(),
      inode: metadata.ino.toString(),
      scanStatus: "new" as const,
      preservationStatus: "current" as const,
      sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
      scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId
    };
  });
  const sourcePath = sourceFiles[0]!.sourcePath;
  const sourceBytes = sourceFiles[0]!.sourceBytes;
  const absoluteSourcePath = join(sourceRoot, sourcePath);
  const totalBytes = sourceFiles.reduce(
    (total, file) => total + file.sourceBytes.byteLength,
    0
  );
  const canonicalCandidateMaterial = stableJson({
    version: 1,
    candidates,
    exclusions: []
  });
  const destinationAuthority = {
    destinationPath: CENTRAL_FL_ICE_PREVIEW.destinationRoot,
    nearestExistingParent: workspaceRoot,
    mountTarget: "/home",
    mountSource: "/dev/internal",
    fileSystem: "btrfs",
    mountOptions: ["rw"],
    mountDeviceId: "destination-dev",
    parentDeviceId: "destination-dev",
    initiallyPresent: true
  };
  const inspection: CentralFloridaIceCandidateInspection = {
    version: 1,
    workspaceId: CENTRAL_FL_ICE_PREVIEW.workspaceId,
    sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
    scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
    importBatchId: CENTRAL_FL_ICE_PREVIEW.importBatchId,
    stagingBatchId: CENTRAL_FL_ICE_PREVIEW.stagingBatchId,
    sourceIdentity: {
      rootRealpath: sourceRoot,
      mountTarget: CENTRAL_FL_ICE_PREVIEW.sourceMount,
      mountSource: CENTRAL_FL_ICE_PREVIEW.sourceDevice,
      fileSystem: "apfs",
      mountOptions: ["gid=1000", "nodev", "noexec", "nosuid", "ro", "uid=1000"],
      mountDeviceId: "source-dev",
      rootDeviceId: "source-dev",
      fileCount: candidates.length,
      totalBytes
    },
    destinationIdentity: destinationAuthority,
    code: {
      baseSha: CENTRAL_FL_ICE_PREVIEW.codeBaseSha,
      codeSha: "0123456789abcdef0123456789abcdef01234567"
    },
    candidates,
    exclusions: [],
    canonicalCandidateMaterial,
    candidateSetHash: sha256(canonicalCandidateMaterial)
  };
  const baseStore = createFileCentralFloridaIcePreviewCheckpointStore(workspaceRoot);
  let failureInjected = false;
  let failuresEnabled = true;
  const checkpointStore: CentralFloridaIcePreviewCheckpointStore = {
    readAll: () => baseStore.readAll(),
    append(draft) {
      if (
        failuresEnabled
        && failAt === "all-inspect-checkpoints"
        && draft.command === "inspect"
      ) {
        throw new Error("injected all inspect checkpoint writes");
      }
      if (!failureInjected && draft.phase === failAt) {
        failureInjected = true;
        throw new Error(`injected ${failAt} checkpoint crash`);
      }
      return baseStore.append(draft);
    }
  };
  let workspaceCreated = false;
  const portableResolver = createPortableIngestionMountResolver();
  const createWorkflow = () => createCentralFloridaIcePreviewWorkflow({
    codeSha: () => inspection.code.codeSha,
    now: () => "2026-07-27T12:00:00.000Z",
    initialInspection: () => ({
      ...inspection,
      destinationIdentity: {
        ...destinationAuthority,
        initiallyPresent: false
      }
    }),
    resumeInspection: () => inspection,
    createWorkspace: () => {
      createPortableWorkspace({
        rootDir: workspaceRoot,
        workspaceId: CENTRAL_FL_ICE_PREVIEW.workspaceId,
        label: "Central Florida ICE crash fixture",
        createdBy: "actor_central_fl_ice_preview",
        description: "Portable crash-retry fixture."
      });
      workspaceCreated = true;
    },
    destinationExists: () => workspaceCreated,
    revalidateDestinationAuthority: () => destinationAuthority,
    mountResolver: {
      resolve: () => portableResolver.resolve({ workspaceRoot })
    },
    legacyRuntimeFactory: (workspace, actorOverride) => {
      const runtime = createLegacyImportRuntime({
        mountedWorkspace: workspace,
        actor: actorOverride ?? {
          id: "actor_central_fl_ice_preview",
          kind: "agent",
          label: "Central Florida ICE preview"
        }
      });
      return {
        ...runtime,
        async inspect(command) {
          const result = await runtime.inspect({ ...command, sourceRoot });
          if (!failureInjected && failAt === "after-inspect") {
            failureInjected = true;
            throw new Error("injected after-inspect crash");
          }
          return result;
        },
        async report(command) {
          const result = await runtime.report(command);
          if (!failureInjected && failAt === "after-report") {
            failureInjected = true;
            throw new Error("injected after-report crash");
          }
          return result;
        },
        async importApproved(command) {
          if (!failureInjected && failAt === "after-raw-approval") {
            failureInjected = true;
            throw new Error("injected after-raw-approval crash");
          }
          return runtime.importApproved(command);
        },
        async stageApproved(command) {
          if (!failureInjected && failAt === "after-staging-approval") {
            failureInjected = true;
            throw new Error("injected after-staging-approval crash");
          }
          return runtime.stageApproved(command);
        }
      };
    },
    checkpointStore
  });
  return {
    createWorkflow,
    checkpointStore,
    workspaceRoot,
    get workspaceCreated() {
      return workspaceCreated;
    },
    disableFailures() {
      failuresEnabled = false;
    },
    corruptByRemovingInspectionEvent(type: KnowledgeEvent["type"]) {
      const database = new DatabaseSync(join(workspaceRoot, "ledger", "ontology.sqlite"));
      try {
        const result = database.prepare(
          "DELETE FROM ontology_events WHERE type = ?"
        ).run(type);
        if (result.changes !== 1) {
          throw new Error(`portable crash fixture expected one ${type} event to remove`);
        }
      } finally {
        database.close();
      }
    },
    corruptInspectionEvent(
      mutation:
        | "source-label"
        | "occurrence-adapter"
        | "completion-totals"
        | "report-generator"
    ) {
      const eventType = {
        "source-label": "ingestion.source.registered",
        "occurrence-adapter": "ingestion.occurrence.observed",
        "completion-totals": "ingestion.scan.completed",
        "report-generator": "legacy.import.report.generated"
      }[mutation];
      const database = new DatabaseSync(join(workspaceRoot, "ledger", "ontology.sqlite"));
      try {
        const row = database.prepare(
          "SELECT global_sequence, payload_json FROM ontology_events WHERE type = ? LIMIT 1"
        ).get(eventType) as { global_sequence: number; payload_json: string } | undefined;
        if (row === undefined) {
          throw new Error(`portable crash fixture expected ${eventType} to corrupt`);
        }
        const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
        if (mutation === "source-label") {
          payload.label = "Foreign replacement source";
        } else if (mutation === "occurrence-adapter") {
          payload.adapter = { name: "foreign-adapter", version: "0.1.0" };
        } else if (mutation === "completion-totals") {
          payload.totals = {
            observedFiles: 1,
            uniqueContent: 1,
            duplicateOccurrences: 0,
            skipped: 1,
            bytes: sourceBytes.byteLength,
            estimatedNewBlobBytes: sourceBytes.byteLength
          };
        } else {
          payload.generator = { name: "foreign-generator", version: "0.1.0" };
        }
        database.prepare(
          "UPDATE ontology_events SET payload_json = ? WHERE global_sequence = ?"
        ).run(JSON.stringify(payload), row.global_sequence);
      } finally {
        database.close();
      }
    },
    async replaceReportEventAndArtifactCoherently() {
      const mounted = await portableResolver.resolve({ workspaceRoot });
      if (!mounted.ok) throw new Error("portable crash fixture did not mount");
      let originalReport: LegacyMigrationReport | undefined;
      try {
        const runtime = createLegacyImportRuntime({
          mountedWorkspace: mounted.workspace,
          actor: {
            id: "actor_central_fl_ice_preview",
            kind: "agent",
            label: "Central Florida ICE preview"
          }
        });
        const readback = await runtime.report({
          sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId
        });
        if (!readback.ok) {
          throw new Error("portable crash fixture could not read its report");
        }
        originalReport = readback.report;
        const foreignReport = buildLegacyMigrationReport({
          sourceCollectionId: originalReport.sourceCollectionId,
          scanBatchId: originalReport.scanBatchId,
          files: originalReport.files.map((file) => ({
            ...file,
            mediaType: "text/plain"
          })),
          detections: originalReport.detections,
          proposedAssertionCandidates: originalReport.proposedAssertionCandidates,
          quarantineEntries: originalReport.quarantineEntries
        });
        const stored = await mounted.workspace.derivativeStore.put(
          Buffer.from(reportArtifactJson(foreignReport), "utf8")
        );
        if (stored.contentHash !== foreignReport.reportHash) {
          throw new Error("portable crash fixture foreign report hash mismatch");
        }
        const database = new DatabaseSync(join(workspaceRoot, "ledger", "ontology.sqlite"));
        try {
          const row = database.prepare(
            "SELECT global_sequence, context_json FROM ontology_events "
              + "WHERE type = 'legacy.import.report.generated' LIMIT 1"
          ).get() as { global_sequence: number; context_json: string } | undefined;
          if (row === undefined) {
            throw new Error("portable crash fixture report event is missing");
          }
          const context = JSON.parse(row.context_json) as Record<string, unknown>;
          context.correlationId = `corr_${foreignReport.legacyReportId}`;
          database.prepare(
            "UPDATE ontology_events "
              + "SET stream_id = ?, context_json = ?, payload_json = ? "
              + "WHERE global_sequence = ?"
          ).run(
            `legacy_report_${foreignReport.sourceCollectionId}`
              + `_${foreignReport.scanBatchId}_${foreignReport.legacyReportId}`,
            JSON.stringify(context),
            JSON.stringify({
              legacyReportId: foreignReport.legacyReportId,
              sourceCollectionId: foreignReport.sourceCollectionId,
              scanBatchId: foreignReport.scanBatchId,
              reportHash: foreignReport.reportHash,
              candidateSetHash: foreignReport.candidateSetHash,
              generatedAt: foreignReport.generatedAt,
              generator: foreignReport.generator,
              totals: foreignReport.totals
            }),
            row.global_sequence
          );
        } finally {
          database.close();
        }
      } finally {
        (mounted.workspace as MountedWorkspace & { close?: () => void }).close?.();
      }
      if (originalReport === undefined) {
        throw new Error("portable crash fixture original report is missing");
      }
      const digest = originalReport.reportHash.replace("sha256:", "");
      rmSync(join(
        workspaceRoot,
        "derivatives",
        "sha256",
        digest.slice(0, 2),
        digest
      ));
    },
    mutateSelectedSourceBytes() {
      const changed = Buffer.from(sourceBytes);
      changed[0] = changed[0] === 0x7b ? 0x5b : 0x7b;
      writeFileSync(absoluteSourcePath, changed);
    },
    restoreSelectedSourceBytes() {
      writeFileSync(absoluteSourcePath, sourceBytes);
    },
    async appendForeignInspectionEvent() {
      const mounted = await portableResolver.resolve({ workspaceRoot });
      if (!mounted.ok) throw new Error("portable crash fixture did not mount");
      try {
        await mounted.workspace.ledger.append({
          type: "ingestion.source.registered",
          version: 1,
          streamId: "ingestion_source_src_foreign_recovery",
          context: {
            actor: {
              id: "actor_central_fl_ice_preview",
              kind: "agent",
              label: "Central Florida ICE preview"
            },
            occurredAt: "2026-07-27T12:00:00.000Z",
            correlationId: "corr_foreign_recovery",
            coreVersion: "0.1.0",
            packVersions: { core: "0.1.0", ingestion: "0.1.0" }
          },
          payload: {
            sourceCollectionId: "src_foreign_recovery",
            label: "Foreign recovery source",
            mode: "read-only",
            adapter: { name: "local-filesystem", version: "0.1.0" },
            rootUri: "file:///tmp/foreign-recovery",
            workspaceUri: `cestus-workspace://${CENTRAL_FL_ICE_PREVIEW.workspaceId}`
          }
        });
      } finally {
        (mounted.workspace as MountedWorkspace & { close?: () => void }).close?.();
      }
    },
    async ledgerEvents() {
      const mounted = await portableResolver.resolve({ workspaceRoot });
      if (!mounted.ok) throw new Error("portable crash fixture did not mount");
      try {
        return await mounted.workspace.ledger.readAll();
      } finally {
        (mounted.workspace as MountedWorkspace & { close?: () => void }).close?.();
      }
    }
  };
}

describe("Central Florida ICE real portable-runtime crash reconciliation", () => {
  it("reconciles a crash after inspect and report read effects", async () => {
    for (const failAt of ["after-inspect", "after-report"] as const) {
      const fixture = portableCrashWorkflowFixture(failAt);
      await expect(fixture.createWorkflow().inspect()).rejects.toThrow("inspection blocked");
      const eventIds = (await fixture.ledgerEvents()).map((event) => event.id);

      const checkpoint = await fixture.createWorkflow().inspect();

      expect(checkpoint.phase).toBe("raw-approval-required");
      expect((await fixture.ledgerEvents()).map((event) => event.id)).toEqual(eventIds);
    }
  });

  it("reconciles inspect/report effects after checkpoint failure without duplicate events", async () => {
    const fixture = portableCrashWorkflowFixture("raw-approval-required");
    await expect(fixture.createWorkflow().inspect()).rejects.toThrow("inspection blocked");
    const eventIds = (await fixture.ledgerEvents()).map((event) => event.id);

    const checkpoint = await fixture.createWorkflow().inspect();

    expect(checkpoint.phase).toBe("raw-approval-required");
    expect((await fixture.ledgerEvents()).map((event) => event.id)).toEqual(eventIds);
  });

  it("recovers a complete exact preview workspace when no checkpoint survived the crash", async () => {
    const fixture = portableCrashWorkflowFixture("all-inspect-checkpoints");
    await expect(fixture.createWorkflow().inspect()).rejects.toThrow(
      "injected all inspect checkpoint writes"
    );
    const eventIds = (await fixture.ledgerEvents()).map((event) => event.id);
    expect(fixture.checkpointStore.readAll()).toEqual([]);

    // The fixture now reports an existing destination; its exact ledger must
    // reconcile without re-creating or duplicating runtime effects.
    fixture.disableFailures();
    const checkpoint = await fixture.createWorkflow().inspect();

    expect(checkpoint.phase).toBe("raw-approval-required");
    expect((await fixture.ledgerEvents()).map((event) => event.id)).toEqual(eventIds);
  });

  it("rejects a no-checkpoint workspace containing an extra allowed-type foreign inspection event", async () => {
    const fixture = portableCrashWorkflowFixture("all-inspect-checkpoints");
    await expect(fixture.createWorkflow().inspect()).rejects.toThrow(
      "injected all inspect checkpoint writes"
    );
    await fixture.appendForeignInspectionEvent();
    const eventIds = (await fixture.ledgerEvents()).map((event) => event.id);
    fixture.disableFailures();

    await expect(fixture.createWorkflow().inspect()).rejects.toThrow(
      "complete exact preview inspection ledger"
    );

    expect(fixture.checkpointStore.readAll()).toEqual([]);
    expect((await fixture.ledgerEvents()).map((event) => event.id)).toEqual(eventIds);
  });

  it("rejects a no-checkpoint workspace missing an expected inspection event", async () => {
    const fixture = portableCrashWorkflowFixture("all-inspect-checkpoints");
    await expect(fixture.createWorkflow().inspect()).rejects.toThrow(
      "injected all inspect checkpoint writes"
    );
    fixture.corruptByRemovingInspectionEvent("legacy.import.report.generated");
    const eventIds = (await fixture.ledgerEvents()).map((event) => event.id);
    fixture.disableFailures();

    await expect(fixture.createWorkflow().inspect()).rejects.toThrow(
      "complete exact preview inspection ledger"
    );

    expect(fixture.checkpointStore.readAll()).toEqual([]);
    expect((await fixture.ledgerEvents()).map((event) => event.id)).toEqual(eventIds);
  });

  it("rejects a coordinated foreign report event and artifact without any recovery write", async () => {
    const fixture = portableCrashWorkflowFixture("all-inspect-checkpoints");
    await expect(fixture.createWorkflow().inspect()).rejects.toThrow(
      "injected all inspect checkpoint writes"
    );
    await fixture.replaceReportEventAndArtifactCoherently();
    const eventsBefore = await fixture.ledgerEvents();
    const artifactsBefore = regularFileMaterials(
      join(fixture.workspaceRoot, "derivatives")
    );
    fixture.disableFailures();

    await expect(fixture.createWorkflow().inspect()).rejects.toThrow(
      "independently derived report"
    );

    expect(await fixture.ledgerEvents()).toEqual(eventsBefore);
    expect(regularFileMaterials(join(fixture.workspaceRoot, "derivatives")))
      .toEqual(artifactsBefore);
    expect(fixture.checkpointStore.readAll()).toEqual([]);
  });

  for (const mutation of [
    "source-label",
    "occurrence-adapter",
    "completion-totals",
    "report-generator"
  ] as const) {
    it(`rejects same-count no-checkpoint inspection replacement ${mutation} without a blocked checkpoint`, async () => {
      const fixture = portableCrashWorkflowFixture("all-inspect-checkpoints");
      await expect(fixture.createWorkflow().inspect()).rejects.toThrow(
        "injected all inspect checkpoint writes"
      );
      fixture.corruptInspectionEvent(mutation);
      const eventIds = (await fixture.ledgerEvents()).map((event) => event.id);
      fixture.disableFailures();

      await expect(fixture.createWorkflow().inspect()).rejects.toThrow();

      expect(fixture.checkpointStore.readAll()).toEqual([]);
      expect((await fixture.ledgerEvents()).map((event) => event.id)).toEqual(eventIds);
    });
  }

  it("carries an exact stale-source diagnostic into provenance after restored-byte retry", async () => {
    const fixture = portableCrashWorkflowFixture("handoff-required");
    await fixture.createWorkflow().inspect();
    fixture.mutateSelectedSourceBytes();

    await expect(fixture.createWorkflow().rawImport({
      approvedBy: "actor_human_preview"
    })).rejects.toThrow("legacy import failed closed");
    const staleDiagnostic = (await fixture.ledgerEvents()).find((event) =>
      event.type === "diagnostic.recorded"
      && event.payload.diagnosticId.startsWith("diag_ingestion_stale_")
    );
    expect(staleDiagnostic).toBeDefined();

    fixture.restoreSelectedSourceBytes();
    const checkpoint = await fixture.createWorkflow().rawImport({
      approvedBy: "actor_human_preview"
    });

    expect(checkpoint.phase).toBe("staging-preview-required");
    expect(checkpoint.state.eventIds).toContain(staleDiagnostic!.id);
  });

  it("checkpoints the actual multi-candidate portable raw-import event sequence", async () => {
    const fixture = portableCrashWorkflowFixture("handoff-required", {
      multipleCandidates: true
    });
    const inspected = await fixture.createWorkflow().inspect();

    const checkpoint = await fixture.createWorkflow().rawImport({
      approvedBy: "actor_human_preview"
    });
    const phaseEventTypes = (await fixture.ledgerEvents())
      .filter((event) => !inspected.state.eventIds.includes(event.id))
      .map((event) => event.type);

    expect(checkpoint.phase).toBe("staging-preview-required");
    expect(checkpoint.state.counts).toMatchObject({
      evidenceCreated: 3,
      occurrencesLinked: 3
    });
    const evidenceMediaTypes = (await fixture.ledgerEvents())
      .filter((event) => event.type === "evidence.ingested")
      .map((event) => event.payload.mediaType)
      .sort();
    expect(evidenceMediaTypes).toEqual([
      "application/json",
      "application/pdf",
      "text/markdown"
    ]);
    expect(phaseEventTypes).toEqual([
      "ingestion.import.approved",
      "evidence.ingested",
      "ingestion.evidence.linked",
      "evidence.ingested",
      "ingestion.evidence.linked",
      "evidence.ingested",
      "ingestion.evidence.linked",
      "ingestion.import.completed",
      "ingestion.parse.job.created",
      "ingestion.parse.job.created",
      "ingestion.parse.job.created"
    ]);
  });

  it("reconciles multi-candidate raw approval/import effects after checkpoint failure without duplicate events or blobs", async () => {
    const fixture = portableCrashWorkflowFixture("staging-preview-required", {
      multipleCandidates: true
    });
    await fixture.createWorkflow().inspect();
    await expect(fixture.createWorkflow().rawImport({
      approvedBy: "actor_human_preview"
    })).rejects.toThrow("injected staging-preview-required checkpoint crash");
    const eventIds = (await fixture.ledgerEvents()).map((event) => event.id);
    const blobCount = countRegularFiles(join(fixture.workspaceRoot, "blobs"));

    const checkpoint = await fixture.createWorkflow().rawImport({
      approvedBy: "actor_human_preview"
    });

    expect(checkpoint.phase).toBe("staging-preview-required");
    expect(checkpoint.state.counts).toMatchObject({
      evidenceCreated: 3,
      occurrencesLinked: 3
    });
    expect((await fixture.ledgerEvents()).map((event) => event.id)).toEqual(eventIds);
    expect(countRegularFiles(join(fixture.workspaceRoot, "blobs"))).toBe(blobCount);
  });

  it("reconciles a crash after raw approval before import without duplicate approval", async () => {
    const fixture = portableCrashWorkflowFixture("after-raw-approval");
    await fixture.createWorkflow().inspect();
    await expect(fixture.createWorkflow().rawImport({
      approvedBy: "actor_human_preview"
    })).rejects.toThrow("after-raw-approval");
    const approvalsBefore = (await fixture.ledgerEvents()).filter((event) =>
      event.type === "ingestion.import.approved"
    );
    expect(approvalsBefore).toHaveLength(1);

    const checkpoint = await fixture.createWorkflow().rawImport({
      approvedBy: "actor_human_preview"
    });

    expect(checkpoint.phase).toBe("staging-preview-required");
    expect((await fixture.ledgerEvents()).filter((event) =>
      event.type === "ingestion.import.approved"
    )).toHaveLength(1);
  });

  it("reconciles staging approval/proposals after checkpoint failure without duplicates", async () => {
    const fixture = portableCrashWorkflowFixture("handoff-required");
    await fixture.createWorkflow().inspect();
    await fixture.createWorkflow().rawImport({ approvedBy: "actor_human_preview" });
    const preview = await fixture.createWorkflow().stagingPreview();
    const candidateIds = [...(preview.state.stagingCandidateIds ?? [])];
    await expect(fixture.createWorkflow().stage({
      approvedBy: "actor_human_preview",
      candidateIds
    })).rejects.toThrow("injected handoff-required checkpoint crash");
    const eventIds = (await fixture.ledgerEvents()).map((event) => event.id);
    const blobCount = countRegularFiles(join(fixture.workspaceRoot, "blobs"));

    const checkpoint = await fixture.createWorkflow().stage({
      approvedBy: "actor_human_preview",
      candidateIds
    });

    expect(checkpoint.phase).toBe("handoff-required");
    expect((await fixture.ledgerEvents()).map((event) => event.id)).toEqual(eventIds);
    expect(countRegularFiles(join(fixture.workspaceRoot, "blobs"))).toBe(blobCount);
  });

  it("records one empty human staging approval and no proposals through the portable workflow", async () => {
    const fixture = portableCrashWorkflowFixture("handoff-required", {
      emptyStagingCandidates: true
    });
    await fixture.createWorkflow().inspect();
    await fixture.createWorkflow().rawImport({ approvedBy: "actor_human_preview" });
    const preview = await fixture.createWorkflow().stagingPreview();
    expect(preview.state.stagingCandidateIds).toEqual([]);

    await expect(runCentralFloridaIcePreviewCli([
      "stage",
      "--approved-by",
      "actor_human_preview"
    ], fixture.createWorkflow)).rejects.toThrow("injected handoff-required checkpoint crash");
    const eventIds = (await fixture.ledgerEvents()).map((event) => event.id);
    const checkpoint = await runCentralFloridaIcePreviewCli([
      "stage",
      "--approved-by",
      "actor_human_preview"
    ], fixture.createWorkflow);

    expect("phase" in checkpoint).toBe(true);
    if (!("phase" in checkpoint)) return;
    expect(checkpoint.phase).toBe("handoff-required");
    expect(checkpoint.state).toMatchObject({
      stagingApprovedBy: "actor_human_preview",
      approvedStagingCandidateIds: [],
      proposedAssertionIds: [],
      counts: {
        approvedStagingCandidates: 0,
        proposedAssertions: 0
      }
    });
    const events = await fixture.ledgerEvents();
    expect(events.map((event) => event.id)).toEqual(eventIds);
    const approvals = events.filter((event) =>
      event.type === "legacy.ontology.staging.approved"
    );
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({
      context: {
        actor: {
          id: "actor_human_preview",
          kind: "human"
        }
      },
      payload: {
        approvedBy: "actor_human_preview",
        approvedAssertionCandidateIds: []
      }
    });
    expect(events.filter((event) => event.type === "assertion.proposed")).toHaveLength(0);

    const handoff = await fixture.createWorkflow().handoff();
    expect(handoff.phase).toBe("replay-verification-required");
    expect(handoff.state.proposedAssertionIds).toEqual([]);
  });

  it("reconciles a crash after staging approval before proposals without duplicate approval", async () => {
    const fixture = portableCrashWorkflowFixture("after-staging-approval");
    await fixture.createWorkflow().inspect();
    await fixture.createWorkflow().rawImport({ approvedBy: "actor_human_preview" });
    const preview = await fixture.createWorkflow().stagingPreview();
    const candidateIds = [...(preview.state.stagingCandidateIds ?? [])];
    await expect(fixture.createWorkflow().stage({
      approvedBy: "actor_human_preview",
      candidateIds
    })).rejects.toThrow("after-staging-approval");
    const approvalsBefore = (await fixture.ledgerEvents()).filter((event) =>
      event.type === "legacy.ontology.staging.approved"
    );
    expect(approvalsBefore).toHaveLength(1);

    const checkpoint = await fixture.createWorkflow().stage({
      approvedBy: "actor_human_preview",
      candidateIds
    });

    expect(checkpoint.phase).toBe("handoff-required");
    const events = await fixture.ledgerEvents();
    expect(events.filter((event) =>
      event.type === "legacy.ontology.staging.approved"
    )).toHaveLength(1);
    expect(events.filter((event) => event.type === "assertion.proposed")).toHaveLength(1);
  });
});

function countRegularFiles(root: string): number {
  if (!statSync(root).isDirectory()) {
    return 0;
  }
  return readdirSync(root, { withFileTypes: true }).reduce((total, entry) => {
    const path = join(root, entry.name);
    return total + (entry.isDirectory() ? countRegularFiles(path) : entry.isFile() ? 1 : 0);
  }, 0);
}

function regularFileMaterials(root: string): readonly string[] {
  if (!existsSync(root)) {
    return [];
  }
  const materials: string[] = [];
  const visit = (current: string, prefix: string): void => {
    const entries = readdirSync(current, { withFileTypes: true })
      .sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0
      );
    for (const entry of entries) {
      const relativePath = prefix.length === 0
        ? entry.name
        : `${prefix}/${entry.name}`;
      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        const contentHash = createHash("sha256")
          .update(readFileSync(absolutePath))
          .digest("hex");
        materials.push(`${relativePath}\u0000${contentHash}`);
      }
    }
  };
  visit(root, "");
  return materials;
}
