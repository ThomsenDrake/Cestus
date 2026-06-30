import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  ".opencode/AGENTS.md",
  "docs/agentic/software-factory.md",
  "docs/agentic/task-template.md",
  "docs/agentic/review-template.md",
  "docs/superpowers/specs/2026-06-30-ontology-layer-design.md",
  "docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md"
];

const forbiddenWords = [
  "T" + "BD",
  "TO" + "DO",
  "FIX" + "ME",
  "implement " + "later",
  "fill in " + "details",
  "add " + "appropriate",
  "similar to " + "Task"
];
const forbidden = new RegExp(`\\b(${forbiddenWords.join("|")})\\b`, "i");
const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    failures.push(`missing ${file}`);
    continue;
  }
  const text = readFileSync(file, "utf8");
  if (forbidden.test(text)) {
    failures.push(`forbidden unfinished marker in ${file}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("factory-readiness passed");
