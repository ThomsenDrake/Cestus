import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const checkerPath = join(root, "scripts/check-software-factory-mission-state.mjs");
const sourcePath = join(root, "docs/agentic/contracts/software-factory-mission-state.v1.json");

function runChecker(contractPath = sourcePath) {
  try {
    return execFileSync(process.execPath, [checkerPath, contractPath, "--json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? error.stderr : "";
    throw new Error(String(stderr).trim());
  }
}

function withFixture(mutate, assertion) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "cestus-factory-mission-"));
  const fixturePath = join(fixtureDir, "mission-state.json");
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  mutate(source);
  writeFileSync(fixturePath, `${JSON.stringify(source, null, 2)}\n`);
  try {
    assertion(fixturePath);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

test("derives the deterministic calibrated mission summary from the canonical source", () => {
  const summary = JSON.parse(runChecker());

  assert.equal(summary.schemaVersion, "software-factory-mission-state.v1");
  assert.equal(summary.missionId, "software-factory-calibration");
  assert.deepEqual(summary.orderedFeatureIds, ["SFC-001", "SFC-002", "SFC-003"]);
  assert.deepEqual(summary.eligibleFeatureIds, []);
  assert.deepEqual(summary.counts, {
    allowedPaths: 9,
    features: 3,
    milestones: 1,
    validationAssertions: 8
  });
  assert.match(summary.fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test("rejects duplicate owned paths instead of silently transferring ownership", () => {
  withFixture(
    (source) => {
      source.features[1].ownership.allowedPaths.push(
        "scripts/check-software-factory-mission-state.mjs"
      );
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /owned path conflict/);
    }
  );
});

test("rejects a Level 3 milestone that removes its black-box validator", () => {
  withFixture(
    (source) => {
      delete source.riskLevels.level3.milestoneValidation.blackBoxValidator;
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /Level 3 milestone validation/);
    }
  );
});

test("rejects a calibration milestone that removes its executability validator", () => {
  withFixture(
    (source) => {
      delete source.milestones[0].validation.executabilityValidator;
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /Level 2 milestone executability validation/);
    }
  );
});
