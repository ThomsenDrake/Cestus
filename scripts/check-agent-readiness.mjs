import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  ".opencode/AGENTS.md",
  "docs/agentic/software-factory.md",
  "docs/agentic/task-template.md",
  "docs/agentic/review-template.md",
  "docs/superpowers/specs/2026-06-30-ontology-layer-design.md",
  "docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md",
  "docs/superpowers/specs/2026-07-01-public-records-request-workflow-design.md",
  "docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md"
];

const allowToken = "agent-readiness-allow";
const unfinishedMarkerPattern = new RegExp(
  [
    `\\b${"TO" + "DO"}\\b`,
    `\\b${"FIX" + "ME"}\\b`,
    `\\b${"T" + "BD"}\\b`,
    `${"implement"}\\s+${"later"}`,
    `${"fill"}\\s+${"in"}\\s+${"details"}`,
    `${"add"}\\s+${"appropriate"}`,
    `${"similar"}\\s+${"to"}\\s+${"Task"}`
  ].join("|"),
  "i"
);

const excludedExactPaths = new Set(["package-lock.json"]);
const excludedPrefixes = [
  ".git/",
  "coverage/",
  "dist/",
  "node_modules/"
];
const excludedExtensions = new Set([
  ".7z",
  ".avif",
  ".bmp",
  ".bz2",
  ".db",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".rar",
  ".sqlite",
  ".svg",
  ".tar",
  ".tgz",
  ".tif",
  ".tiff",
  ".webp",
  ".xz",
  ".zip"
]);
const failures = [];
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    failures.push(`missing ${file}`);
  }
}

for (const file of trackedTextFiles()) {
  const text = readTrackedUtf8File(file);
  if (text === undefined) {
    continue;
  }

  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.includes(allowToken)) {
      continue;
    }
    const match = line.match(unfinishedMarkerPattern);
    if (match) {
      failures.push(`${file}:${index + 1} unfinished marker "${match[0]}"`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("factory-readiness passed");

function trackedTextFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !isExcludedPath(file));
}

function isExcludedPath(file) {
  if (excludedExactPaths.has(file)) {
    return true;
  }
  if (excludedPrefixes.some((prefix) => file.startsWith(prefix))) {
    return true;
  }
  const lowerFile = file.toLowerCase();
  return [...excludedExtensions].some((extension) => lowerFile.endsWith(extension));
}

function readTrackedUtf8File(file) {
  try {
    const bytes = readFileSync(file);
    if (bytes.includes(0)) {
      return undefined;
    }
    return utf8Decoder.decode(bytes);
  } catch {
    return undefined;
  }
}
