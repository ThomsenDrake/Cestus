import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  ".opencode/AGENTS.md",
  ".agents/skills/cestus-software-factory/SKILL.md",
  "docs/agentic/software-factory.md",
  "docs/agentic/executable-spec-template.md",
  ".github/workflows/verify.yml"
];

const requiredText = new Map([
  [
    "AGENTS.md",
    [
      "docs/agentic/software-factory.md",
      "docs/agentic/executable-spec-template.md",
      "$sol-advisor:orchestration",
      "Terra / High",
      "Luna task lane",
      "Development coordination is not part of the product ledger"
    ]
  ],
  [
    ".agents/skills/cestus-software-factory/SKILL.md",
    [
      "## Assemble Bounded Context",
      "## Execute The Line",
      "at most two focused repair attempts",
      "$sol-advisor:orchestration",
      "Terra / High"
    ]
  ],
  [
    "docs/agentic/software-factory.md",
    [
      "Status: authoritative.",
      "## Delivery Line",
      "## Risk Lanes",
      "## Mandatory Overhead Limits",
      "Factory V1 and Factory V2 are preserved as history",
      "$sol-advisor:orchestration",
      "Primary Sol / High",
      "Terra / High",
      "fresh Sol verdict"
    ]
  ],
  [
    "docs/agentic/executable-spec-template.md",
    [
      "## Desired Behavior",
      "## Observable Acceptance Examples",
      "## Allowed Scope",
      "## Relevant Context Entry Points",
      "## Risk Lane",
      "## Targeted Verification",
      "## Integration Verification",
      "## Escalation Conditions"
    ]
  ]
]);

const maximumLines = new Map([
  ["AGENTS.md", 80],
  [".agents/skills/cestus-software-factory/SKILL.md", 160],
  ["docs/agentic/software-factory.md", 350],
  ["docs/agentic/executable-spec-template.md", 100]
]);

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    failures.push(`missing ${file}`);
  }
}

for (const [file, snippets] of requiredText) {
  if (!existsSync(file)) {
    continue;
  }
  const text = readFileSync(file, "utf8");
  for (const snippet of snippets) {
    if (!text.includes(snippet)) {
      failures.push(`${file} is missing required text: ${snippet}`);
    }
  }
}

for (const [file, maximum] of maximumLines) {
  if (!existsSync(file)) {
    continue;
  }
  const lineCount = readFileSync(file, "utf8").split(/\r?\n/).length;
  if (lineCount > maximum) {
    failures.push(`${file} exceeds the ${maximum}-line thin-contract limit (${lineCount})`);
  }
}

if (existsSync(".github/workflows/verify.yml")) {
  const workflow = readFileSync(".github/workflows/verify.yml", "utf8");
  if (!/^\s*-\s+neo\s*$/mu.test(workflow)) {
    failures.push(".github/workflows/verify.yml does not observe integration branch neo");
  }
}

if (existsSync("package.json")) {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  if (packageJson.scripts?.["factory:check"] !== "node scripts/check-agent-readiness.mjs") {
    failures.push("package.json factory:check does not use the thin readiness check");
  }
  if (!packageJson.scripts?.verify?.includes("npm run factory:check")) {
    failures.push("package.json verify does not include thin factory readiness");
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("factory-readiness passed");
