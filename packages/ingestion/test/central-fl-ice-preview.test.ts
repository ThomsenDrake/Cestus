import { createHash } from "node:crypto";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CENTRAL_FL_ICE_PREVIEW,
  type PreviewFilesystemPort,
  type PreviewMountInspectionPort,
  type PreviewMountRecord,
  type PreviewPathMetadata,
  inspectCentralFloridaIceCandidates
} from "../src/central-fl-ice-preview.js";

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
    let current = sourceRoot;

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

    const result = inspectCentralFloridaIceCandidates(
      { filesystem: harness.filesystem, mounts: harness.mounts },
      inputWithIgnoredPolicy
    );

    expect(result.sourceIdentity.rootRealpath).toBe(CENTRAL_FL_ICE_PREVIEW.sourceRoot);
    expect(result.destinationIdentity.destinationPath).toBe(CENTRAL_FL_ICE_PREVIEW.destinationRoot);
    expect(result.sourceIdentity.fileCount).toBe(CENTRAL_FL_ICE_PREVIEW.expectedFileCount);
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
