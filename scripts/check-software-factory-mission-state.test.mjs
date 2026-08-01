// Historical Factory V1 diagnostic coverage. These tests are optional and are
// not part of the active thin-factory gate.
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

test("rejects a mission integration SHA that does not resolve to a Git commit", () => {
  withFixture(
    (source) => {
      source.mission.status = "integrated";
      source.mission.acceptedIntegrationSha = "f".repeat(40);
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /mission\.acceptedIntegrationSha must resolve to a Git commit/);
    }
  );
});

test("rejects a feature release SHA that does not resolve to a Git commit", () => {
  withFixture(
    (source) => {
      source.features[0].status = "released";
      source.features[0].acceptedIntegrationSha = "e".repeat(40);
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /SFC-001\.acceptedIntegrationSha must resolve to a Git commit/);
    }
  );
});

test("rejects risk-level keys outside the calibrated three-level schema", () => {
  withFixture(
    (source) => {
      source.riskLevels.level4 = {};
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /riskLevels must contain exactly level1, level2, and level3/);
    }
  );
});

test("rejects weakened Level 3 full, live, and release gates", () => {
  withFixture(
    (source) => {
      source.riskLevels.level3.milestoneValidation.requiredGates = ["full", "release"];
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /Level 3 required gates must match the approved sequence/);
    }
  );
});

test("rejects an SFC-M1 risk-level downgrade", () => {
  withFixture(
    (source) => {
      source.milestones[0].riskLevel = "level1";
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /SFC-M1 must remain a Level 2 milestone/);
    }
  );
});

test("rejects a changed SFC-M1 architecture validator", () => {
  withFixture(
    (source) => {
      source.milestones[0].validation.architectureValidator = 2;
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /SFC-M1 must retain exactly one architecture validator/);
    }
  );
});

test("rejects feature-to-milestone membership disagreement", () => {
  withFixture(
    (source) => {
      source.milestones[0].featureIds = source.milestones[0].featureIds.filter(
        (featureId) => featureId !== "SFC-001"
      );
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /bidirectional milestone membership/);
    }
  );
});

test("rejects milestone-to-feature membership disagreement", () => {
  withFixture(
    (source) => {
      const secondMilestone = structuredClone(source.milestones[0]);
      secondMilestone.milestoneId = "SFC-M2";
      secondMilestone.featureIds = ["SFC-001"];
      source.milestones.push(secondMilestone);
      source.features[0].milestoneIds = ["SFC-M2"];
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /bidirectional milestone membership/);
    }
  );
});

test("rejects frozen V4 authority when unfinished-card precedence is not authoritative", () => {
  withFixture(
    (source) => {
      source.mission.frozenAuthority.unfinishedCardPrecedence = "advisory";
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /unfinished V4 card precedence must be authoritative/);
    }
  );
});

test("rejects removal of the no-fallback-writes calibration invariant", () => {
  withFixture(
    (source) => {
      source.invariants = source.invariants.filter((invariant) => invariant !== "no-fallback-writes");
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /immutable calibration envelope fingerprint/);
    }
  );
});

test("rejects a registry policy weakened to permit routine events", () => {
  withFixture(
    (source) => {
      source.stateModel.registryEventPolicy = "Allow lifecycle transitions, routine commands, and reviewer heartbeats.";
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /immutable calibration envelope fingerprint/);
    }
  );
});

test("rejects a topology weakened to unbounded work without isolation", () => {
  withFixture(
    (source) => {
      source.executionTopology.parallelism = "unbounded";
      source.executionTopology.worktrees = "never use worktrees";
      source.executionTopology.models = "minimum capability for every task";
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /immutable calibration envelope fingerprint/);
    }
  );
});

test("rejects expansion of calibration ownership into a product path", () => {
  withFixture(
    (source) => {
      const productPath = "packages/domain/src/ledger.ts";
      source.ownedPathScope.push(productPath);
      source.features[0].ownership.allowedPaths.push(productPath);
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /immutable calibration envelope fingerprint/);
    }
  );
});

test("rejects an SFC-001 risk-level downgrade", () => {
  withFixture(
    (source) => {
      source.features[0].riskLevel = "level1";
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /immutable calibration envelope fingerprint/);
    }
  );
});

test("rejects weakening the SFC-003 prerequisite set", () => {
  withFixture(
    (source) => {
      source.features[2].prerequisiteIds = ["SFC-001"];
    },
    (fixturePath) => {
      assert.throws(() => runChecker(fixturePath), /immutable calibration envelope fingerprint/);
    }
  );
});

test("accepts lifecycle status and reachable integration SHA updates", () => {
  const reachableCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  withFixture(
    (source) => {
      source.mission.status = "integrated";
      source.mission.acceptedIntegrationSha = reachableCommit;
      source.features[0].status = "integrated";
      source.features[0].acceptedIntegrationSha = reachableCommit;
    },
    (fixturePath) => {
      assert.doesNotThrow(() => runChecker(fixturePath));
    }
  );
});
