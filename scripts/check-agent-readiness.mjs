import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  ".opencode/AGENTS.md",
  ".agents/skills/cestus-software-factory/SKILL.md",
  "docs/agentic/software-factory.md",
  "docs/agentic/contracts/software-factory-active-mission.v1.json",
  "docs/agentic/contracts/resident-agent-full-vision-mission-state.v1.json",
  "docs/agentic/claims/resident-agent-full-vision-successor-mission-control.md",
  "scripts/check-software-factory-active-mission.mjs",
  "scripts/check-software-factory-active-mission.test.mjs",
  "docs/agentic/task-template.md",
  "docs/agentic/review-template.md",
  "docs/superpowers/specs/2026-06-30-ontology-layer-design.md",
  "docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md",
  "docs/superpowers/specs/2026-07-01-public-records-request-workflow-design.md",
  "docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md",
  "docs/superpowers/specs/2026-07-03-ledger-backed-prr-workspace-design.md",
  "docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md",
  "docs/superpowers/specs/2026-07-04-requests-detail-modal-design.md",
  "docs/superpowers/plans/2026-07-04-requests-detail-modal-implementation.md",
  "docs/superpowers/specs/2026-07-04-requests-detail-floating-modal-design.md",
  "docs/superpowers/plans/2026-07-04-requests-detail-floating-modal-implementation.md",
  "docs/superpowers/specs/2026-07-05-security-threat-model-data-governance-design.md",
  "docs/superpowers/plans/2026-07-05-security-threat-model-data-governance-implementation.md",
  "docs/superpowers/specs/2026-07-05-durable-local-prr-runtime-design.md",
  "docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md",
  "docs/superpowers/specs/2026-07-05-public-ingestion-pipeline-design.md",
  "docs/superpowers/plans/2026-07-05-public-ingestion-pipeline-implementation.md",
  "docs/superpowers/specs/2026-07-06-portable-workspace-mount-design.md",
  "docs/superpowers/plans/2026-07-06-portable-workspace-mount-implementation.md",
  "docs/superpowers/specs/2026-07-06-portable-workspace-ops-design.md",
  "docs/superpowers/plans/2026-07-06-portable-workspace-ops-implementation.md",
  "docs/superpowers/specs/2026-07-06-portable-workspace-attachment-ops-design.md",
  "docs/superpowers/plans/2026-07-06-portable-workspace-attachment-ops-implementation.md",
  "docs/superpowers/specs/2026-07-06-ingestion-runtime-wiring-design.md",
  "docs/superpowers/plans/2026-07-06-ingestion-runtime-wiring-implementation.md",
  "docs/superpowers/specs/2026-07-06-local-workspace-readiness-smoke-design.md",
  "docs/superpowers/plans/2026-07-06-local-workspace-readiness-smoke-implementation.md",
  "docs/superpowers/specs/2026-07-06-legacy-cestus-import-design.md",
  "docs/superpowers/plans/2026-07-06-legacy-cestus-import-implementation.md",
  "docs/superpowers/specs/2026-07-06-legacy-cestus-operator-cli-design.md",
  "docs/superpowers/plans/2026-07-06-legacy-cestus-operator-cli-implementation.md",
  "docs/superpowers/specs/2026-07-06-operator-workspace-status-import-bridge-design.md",
  "docs/superpowers/plans/2026-07-06-operator-workspace-status-import-bridge-implementation.md",
  "docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md",
  "docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md",
  "docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md",
  "docs/superpowers/plans/2026-07-07-resident-agent-execution-approval-implementation.md",
  "docs/superpowers/specs/2026-07-07-resident-agent-provider-auth-design.md",
  "docs/superpowers/plans/2026-07-07-resident-agent-provider-auth-implementation.md",
  "docs/superpowers/specs/2026-07-07-ontology-bootstrap-specialist-design.md",
  "docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md",
  "docs/superpowers/plans/2026-07-08-provider-readiness-health-ux-implementation.md",
  "docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md",
  "docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md",
  "docs/superpowers/plans/2026-07-08-ontology-bootstrap-resident-agent-workflow-implementation.md",
  "docs/superpowers/plans/2026-07-09-resident-agent-domain-execution-adapters-implementation.md",
  "docs/agentic/claims/task-9-resident-agent-domain-adapter-registry.md",
  "packages/agent/src/domain-execution-adapter-registry.ts",
  "packages/agent/test/domain-execution-adapter-registry.test.ts",
  "docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md",
  "docs/superpowers/specs/2026-07-09-mvp-specialist-workflows-design.md",
  "docs/superpowers/plans/2026-07-09-mvp-specialist-workflows-implementation.md",
  "docs/superpowers/specs/2026-07-10-resident-lifecycle-bootstrap-design.md",
  "docs/superpowers/plans/2026-07-10-resident-lifecycle-bootstrap-implementation.md",
  "docs/superpowers/specs/2026-07-10-durable-specialist-handoff-production-design.md",
  "docs/superpowers/plans/2026-07-10-durable-specialist-handoff-production-implementation.md",
  "docs/superpowers/specs/2026-07-10-prr-jurisdiction-context-packs-design.md",
  "docs/superpowers/plans/2026-07-10-prr-jurisdiction-context-packs-implementation.md",
  "docs/superpowers/specs/2026-07-10-resident-task-orchestrator-design.md",
  "docs/superpowers/plans/2026-07-10-resident-task-orchestrator-implementation.md"
];
const activeMissionCheck = [
  process.execPath,
  "scripts/check-software-factory-active-mission.mjs"
];
const activeMissionSelectorPath =
  "docs/agentic/contracts/software-factory-active-mission.v1.json";
const activeMissionCheckerPath = "scripts/check-software-factory-active-mission.mjs";
const expectedActiveMissionSelectorSha256 =
  "3a65d4f16c668d1d740a12c219b5905f15f70b8329074f7f79e2bc1b677ce9e8";
const forbiddenSkillLocations = [
  ".factory/skills/cestus-software-factory/SKILL.md",
  ".codex/skills/cestus-software-factory/SKILL.md"
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

for (const file of forbiddenSkillLocations) {
  if (existsSync(file)) {
    failures.push(`move ${file} to .agents/skills/cestus-software-factory/SKILL.md`);
  }
}

try {
  requireRegularFile(activeMissionSelectorPath, "active mission selector");
  const selectorBytes = readFileSync(activeMissionSelectorPath);
  if (sha256(selectorBytes) !== expectedActiveMissionSelectorSha256) {
    failures.push("active mission selector digest changed");
  } else {
    const selector = JSON.parse(selectorBytes.toString("utf8"));
    const checker = selector?.activeMission?.checker;
    if (checker?.path !== activeMissionCheckerPath) {
      failures.push("active mission checker path changed");
    } else {
      requireRegularFile(activeMissionCheckerPath, "active mission checker");
      if (sha256(readFileSync(activeMissionCheckerPath)) !== checker.sha256) {
        failures.push("active mission checker digest changed");
      }
    }
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

try {
  if (failures.length === 0) {
    execFileSync(activeMissionCheck[0], activeMissionCheck.slice(1), { stdio: "pipe" });
  }
} catch (error) {
  const stderr = error && typeof error === "object" && "stderr" in error ? error.stderr : "";
  failures.push(`software factory active mission failed${stderr ? `: ${String(stderr).trim()}` : ""}`);
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

function requireRegularFile(path, label) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
