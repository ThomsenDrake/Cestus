import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const checkerPath = join(root, "scripts/check-software-factory-active-mission.mjs");
const selectorPath = join(
  root,
  "docs/agentic/contracts/software-factory-active-mission.v1.json"
);
const missionPath = join(
  root,
  "docs/agentic/contracts/resident-agent-full-vision-mission-state.v1.json"
);
const historicalCheckerPath = join(
  root,
  "scripts/check-software-factory-mission-state.mjs"
);
const readinessPath = join(root, "scripts/check-agent-readiness.mjs");

const serializedFeatureIds = [
  "Task140P",
  "Task140R0",
  "Task140H",
  "Task140R1",
  "Task131",
  "Task141"
];
const wave3FeatureIds = Array.from({ length: 11 }, (_, index) => `Task${142 + index}`);
const acceptanceFeatureIds = Array.from(
  { length: 10 },
  (_, index) => `A-${String(index + 1).padStart(2, "0")}`
);
const orderedFeatureIds = [
  ...serializedFeatureIds,
  ...wave3FeatureIds,
  "A-FIXTURE",
  ...acceptanceFeatureIds,
  "Task153"
];
const initiallyEligibleAcceptanceFeatureIds = ["A-01"];
const candidateControlPaths = [
  ".agents/skills/cestus-software-factory/SKILL.md",
  "AGENTS.md",
  "docs/agentic/software-factory.md",
  "docs/agentic/claims/resident-agent-full-vision-successor-mission-control.md",
  "docs/agentic/contracts/resident-agent-full-vision-mission-state.v1.json",
  "docs/agentic/contracts/software-factory-active-mission.v1.json",
  "scripts/check-agent-readiness.mjs",
  "scripts/check-software-factory-active-mission.mjs",
  "scripts/check-software-factory-active-mission.test.mjs"
];

function runJson(executablePath, args = []) {
  try {
    return JSON.parse(
      execFileSync(process.execPath, [executablePath, ...args, "--json"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      })
    );
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? error.stderr : "";
    throw new Error(String(stderr).trim());
  }
}

function runChecker({ selector, mission, registryFixture } = {}) {
  const args = [];
  if (selector) {
    args.push("--selector", selector);
  }
  if (mission) {
    args.push("--mission", mission);
  }
  if (registryFixture) {
    args.push("--registry-fixture", registryFixture);
  }
  return runJson(checkerPath, args);
}

function findFeature(source, featureId) {
  const feature = source.features.find((candidate) => candidate.featureId === featureId);
  assert.ok(feature, `fixture must contain ${featureId}`);
  return feature;
}

function markIntegrated(source, featureIds) {
  const reachableSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8"
  }).trim();
  for (const [index, featureId] of featureIds.entries()) {
    const feature = findFeature(source, featureId);
    feature.integrationState = "integrated";
    feature.acceptedIntegrationSha = reachableSha;
    source.reviewedIntegrationEvidence[featureId] = {
      candidateSha: reachableSha,
      reviewEventId: `RV-1-E-${9000 + index * 2}`,
      reviewRegistryCommitSha: reachableSha,
      integrationEventId: `RV-1-E-${9001 + index * 2}`,
      integrationSha: reachableSha,
      integrationRegistryCommitSha: reachableSha
    };
  }
}

function markControlPlaneIntegrated(source) {
  const reachableSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8"
  }).trim();
  source.mission.controlPlaneStatus = "integrated";
  source.mission.acceptedIntegrationSha = reachableSha;
  source.controlPlaneIntegrationEvidence = {
    candidateSha: reachableSha,
    reviewEventId: "RV-1-E-8800",
    reviewRegistryCommitSha: reachableSha,
    integrationEventId: "RV-1-E-8801",
    integrationSha: reachableSha,
    integrationRegistryCommitSha: reachableSha
  };
}

function markMilestoneGates(source, milestoneIds) {
  const reachableSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8"
  }).trim();
  for (const [index, milestoneId] of milestoneIds.entries()) {
    const milestone = source.milestones.find((candidate) => candidate.milestoneId === milestoneId);
    assert.ok(milestone, `fixture must contain ${milestoneId}`);
    const blackBoxEventId = `RV-1-E-${9700 + index * 3}`;
    const fullGateEventId = `RV-1-E-${9701 + index * 3}`;
    source.milestoneGateEvidence[milestoneId] = {
      registryEventId: `RV-1-E-${9800 + index}`,
      registryCommitSha: reachableSha,
      evidenceSha: reachableSha,
      blackBoxEvidence: {
        registryEventId: blackBoxEventId,
        registryCommitSha: reachableSha,
        resultSha256: createHash("sha256").update(`${milestoneId}:black-box`).digest("hex")
      },
      fullGateEvidence: {
        registryEventId: fullGateEventId,
        registryCommitSha: reachableSha,
        resultSha256: createHash("sha256").update(`${milestoneId}:full-gate`).digest("hex")
      },
      liveGateEvidenceRef: `policy:${milestone.validation.liveGate}`
    };
  }
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fixtureGit(repository, args) {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function appendLifecycleEvent(repository, eventId, title, marker) {
  const registryPath = join(
    repository,
    "docs/agentic/resident-agent-full-vision-program-registry.md"
  );
  const current = readFileSync(registryPath, "utf8");
  writeFileSync(
    registryPath,
    `${current}${current.endsWith("\n") ? "\n" : "\n\n"}## ${eventId} — ${title}\n\n${marker}\n`
  );
  fixtureGit(repository, [
    "add",
    "--",
    "docs/agentic/resident-agent-full-vision-program-registry.md"
  ]);
  fixtureGit(repository, ["commit", "-m", title]);
  return fixtureGit(repository, ["rev-parse", "HEAD"]);
}

function controlReviewMarker(candidateSha, reviewEventId) {
  return `<!-- resident-full-vision-control-plane-review-v1 ${stableJson({
    candidateSha,
    controlPlaneId: "successor-mission-control",
    reviewEventId,
    verdict: "APPROVED"
  })} -->`;
}

function controlIntegrationMarker(evidence) {
  return `<!-- resident-full-vision-control-plane-integration-v1 ${stableJson({
    candidateSha: evidence.candidateSha,
    controlPlaneId: "successor-mission-control",
    integrationEventId: evidence.integrationEventId,
    integrationSha: evidence.integrationSha,
    reviewEventId: evidence.reviewEventId,
    reviewRegistryCommitSha: evidence.reviewRegistryCommitSha
  })} -->`;
}

function featureReviewMarker(featureId, candidateSha, reviewEventId) {
  return `<!-- resident-full-vision-feature-review-v1 ${stableJson({
    candidateSha,
    featureId,
    reviewEventId,
    verdict: "APPROVED"
  })} -->`;
}

function featureIntegrationMarker(featureId, evidence) {
  return `<!-- resident-full-vision-feature-integration-v1 ${stableJson({
    candidateSha: evidence.candidateSha,
    featureId,
    integrationEventId: evidence.integrationEventId,
    integrationSha: evidence.integrationSha,
    reviewEventId: evidence.reviewEventId,
    reviewRegistryCommitSha: evidence.reviewRegistryCommitSha
  })} -->`;
}

function writeProjectedMission(repository, name, controlEvidence, featureEvidence) {
  const source = JSON.parse(
    readFileSync(
      join(
        repository,
        "docs/agentic/contracts/resident-agent-full-vision-mission-state.v1.json"
      ),
      "utf8"
    )
  );
  source.mission.controlPlaneStatus = "integrated";
  source.mission.acceptedIntegrationSha = controlEvidence.integrationSha;
  source.controlPlaneIntegrationEvidence = controlEvidence;
  if (featureEvidence !== undefined) {
    const feature = source.features.find(({ featureId }) => featureId === featureEvidence.featureId);
    assert.ok(feature, `fixture must contain ${featureEvidence.featureId}`);
    feature.integrationState = "integrated";
    feature.acceptedIntegrationSha = featureEvidence.integrationSha;
    source.reviewedIntegrationEvidence[featureEvidence.featureId] = {
      candidateSha: featureEvidence.candidateSha,
      reviewEventId: featureEvidence.reviewEventId,
      reviewRegistryCommitSha: featureEvidence.reviewRegistryCommitSha,
      integrationEventId: featureEvidence.integrationEventId,
      integrationSha: featureEvidence.integrationSha,
      integrationRegistryCommitSha: featureEvidence.integrationRegistryCommitSha
    };
  }
  const path = join(repository, "..", `${name}.json`);
  writeFileSync(path, `${JSON.stringify(source, null, 2)}\n`);
  return path;
}

function topologyOutcome(repository, projectedMissionPath) {
  try {
    execFileSync(
      process.execPath,
      ["scripts/check-software-factory-active-mission.mjs", "--mission", projectedMissionPath],
      {
        cwd: repository,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    return "accepted";
  } catch (error) {
    const stderr = String(
      error && typeof error === "object" && "stderr" in error ? error.stderr : error
    );
    if (/integration first parent must equal/.test(stderr)) {
      return "first-parent-rejected";
    }
    if (/integration tree must equal/.test(stderr)) {
      return "merge-tree-rejected";
    }
    if (/Task140P candidate changed path/.test(stderr)) {
      return "scope-rejected";
    }
    return stderr.trim();
  }
}

function createTopologyFixture() {
  const fixtureDir = mkdtempSync(join(tmpdir(), "cestus-active-mission-topology-"));
  const repository = join(fixtureDir, "repo");
  execFileSync("git", ["clone", "--quiet", "--no-local", root, repository], {
    stdio: "pipe"
  });
  fixtureGit(repository, ["config", "user.email", "mission-fixture@example.test"]);
  fixtureGit(repository, ["config", "user.name", "Mission Fixture"]);
  fixtureGit(repository, [
    "switch",
    "--detach",
    "639ff359f67d7cd156bc1b6be5ac56a842dbb030"
  ]);
  fixtureGit(repository, ["switch", "-c", "fixture-candidate"]);
  for (const path of candidateControlPaths) {
    copyFileSync(join(root, path), join(repository, path));
  }
  fixtureGit(repository, ["add", "--", ...candidateControlPaths]);
  fixtureGit(repository, ["commit", "-m", "fixture: successor mission candidate"]);
  const candidateSha = fixtureGit(repository, ["rev-parse", "HEAD"]);

  fixtureGit(repository, [
    "switch",
    "-c",
    "fixture-review",
    "639ff359f67d7cd156bc1b6be5ac56a842dbb030"
  ]);
  const reviewEventId = "RV-1-E-8800";
  const reviewRegistryCommitSha = appendLifecycleEvent(
    repository,
    reviewEventId,
    "fixture successor control approved",
    controlReviewMarker(candidateSha, reviewEventId)
  );
  return {
    candidateSha,
    fixtureDir,
    repository,
    reviewEventId,
    reviewRegistryCommitSha
  };
}

function integrateControlFixture(fixture, integrationEventId, mergeMessage) {
  fixtureGit(fixture.repository, ["merge", "--no-ff", fixture.candidateSha, "-m", mergeMessage]);
  const integrationSha = fixtureGit(fixture.repository, ["rev-parse", "HEAD"]);
  const evidence = {
    candidateSha: fixture.candidateSha,
    reviewEventId: fixture.reviewEventId,
    reviewRegistryCommitSha: fixture.reviewRegistryCommitSha,
    integrationEventId,
    integrationSha
  };
  evidence.integrationRegistryCommitSha = appendLifecycleEvent(
    fixture.repository,
    integrationEventId,
    `${mergeMessage} recorded`,
    controlIntegrationMarker(evidence)
  );
  return evidence;
}

function renderRegistryFixture(source) {
  const events = [];
  if (source.controlPlaneIntegrationEvidence !== null) {
    const evidence = source.controlPlaneIntegrationEvidence;
    events.push({
      eventId: evidence.reviewEventId,
      title: "successor mission control independently approved",
      marker: `<!-- resident-full-vision-control-plane-review-v1 ${stableJson({
        candidateSha: evidence.candidateSha,
        controlPlaneId: "successor-mission-control",
        reviewEventId: evidence.reviewEventId,
        verdict: "APPROVED"
      })} -->`
    });
    events.push({
      eventId: evidence.integrationEventId,
      title: "successor mission control integrated",
      marker: `<!-- resident-full-vision-control-plane-integration-v1 ${stableJson({
        candidateSha: evidence.candidateSha,
        controlPlaneId: "successor-mission-control",
        integrationEventId: evidence.integrationEventId,
        integrationSha: evidence.integrationSha,
        reviewEventId: evidence.reviewEventId,
        reviewRegistryCommitSha: evidence.reviewRegistryCommitSha
      })} -->`
    });
  }
  for (const [featureId, evidence] of Object.entries(source.reviewedIntegrationEvidence)) {
    events.push({
      eventId: evidence.reviewEventId,
      title: `${featureId} independently approved`,
      marker: `<!-- resident-full-vision-feature-review-v1 ${stableJson({
        candidateSha: evidence.candidateSha,
        featureId,
        reviewEventId: evidence.reviewEventId,
        verdict: "APPROVED"
      })} -->`
    });
    events.push({
      eventId: evidence.integrationEventId,
      title: `${featureId} integrated`,
      marker: `<!-- resident-full-vision-feature-integration-v1 ${stableJson({
        candidateSha: evidence.candidateSha,
        featureId,
        integrationEventId: evidence.integrationEventId,
        integrationSha: evidence.integrationSha,
        reviewEventId: evidence.reviewEventId,
        reviewRegistryCommitSha: evidence.reviewRegistryCommitSha
      })} -->`
    });
  }
  for (const [milestoneId, evidence] of Object.entries(source.milestoneGateEvidence)) {
    const milestone = source.milestones.find((candidate) => candidate.milestoneId === milestoneId);
    assert.ok(milestone, `fixture must contain ${milestoneId}`);
    events.push({
      eventId: evidence.blackBoxEvidence.registryEventId,
      title: `${milestoneId} black-box evidence`,
      marker: `<!-- resident-full-vision-black-box-evidence-v1 ${stableJson({
        milestoneId,
        registryEventId: evidence.blackBoxEvidence.registryEventId,
        resultSha256: evidence.blackBoxEvidence.resultSha256
      })} -->`
    });
    events.push({
      eventId: evidence.fullGateEvidence.registryEventId,
      title: `${milestoneId} full-gate evidence`,
      marker: `<!-- resident-full-vision-full-gate-evidence-v1 ${stableJson({
        milestoneId,
        registryEventId: evidence.fullGateEvidence.registryEventId,
        resultSha256: evidence.fullGateEvidence.resultSha256
      })} -->`
    });
    events.push({
      eventId: evidence.registryEventId,
      title: `${milestoneId} gate recorded`,
      marker: `<!-- resident-full-vision-milestone-gate-v1 ${stableJson({
        blackBoxEvidence: evidence.blackBoxEvidence,
        evidenceSha: evidence.evidenceSha,
        fullGateEvidence: evidence.fullGateEvidence,
        liveGateEvidenceRef: evidence.liveGateEvidenceRef,
        milestoneId,
        registryEventId: evidence.registryEventId,
        requiredGateFacts: milestone.validation.requiredGateFacts ?? []
      })} -->`
    });
  }
  return `# Fixture registry\n\n${events
    .map(({ eventId, marker, title }) => `## ${eventId} — ${title}\n\n${marker}\n`)
    .join("\n")}`;
}

function withMissionFixture(
  mutate,
  assertion,
  { integrateControlPlane = true, mutateRegistry = (value) => value } = {}
) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "cestus-active-mission-"));
  const fixturePath = join(fixtureDir, "mission-state.json");
  const registryPath = join(fixtureDir, "registry.md");
  const source = JSON.parse(readFileSync(missionPath, "utf8"));
  if (integrateControlPlane) {
    markControlPlaneIntegrated(source);
  }
  mutate(source);
  writeFileSync(fixturePath, `${JSON.stringify(source, null, 2)}\n`);
  writeFileSync(registryPath, mutateRegistry(renderRegistryFixture(source), source));
  try {
    assertion(fixturePath, registryPath);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

function fixtureSummary(fixturePath, registryPath) {
  return runChecker({ mission: fixturePath, registryFixture: registryPath });
}

if (!existsSync(checkerPath)) {
  test("requires the successor active-mission checker", () => {
    assert.ok(existsSync(checkerPath), `missing ${checkerPath}`);
  });
} else {
  test("selects the full-vision successor while preserving historical calibration", () => {
    const summary = runChecker();
    const explicit = runChecker({ selector: selectorPath });
    const historical = runJson(historicalCheckerPath);

    assert.deepEqual(explicit, summary);
    assert.equal(summary.schemaVersion, "software-factory-active-mission-summary.v1");
    assert.equal(summary.missionId, "resident-agent-full-vision");
    assert.deepEqual(summary.orderedFeatureIds, orderedFeatureIds);
    assert.deepEqual(summary.eligibleFeatureIds, []);
    assert.deepEqual(summary.prospectiveEligibleFeatureIds, ["Task140P"]);
    assert.deepEqual(summary.blockedFeatureIds, orderedFeatureIds);
    assert.deepEqual(summary.historicalCalibration, {
      missionId: historical.missionId,
      fingerprint: historical.fingerprint,
      immutableEnvelopeFingerprint: historical.immutableEnvelopeFingerprint
    });
  });

  test("routes factory readiness through the authenticated active-mission selector", () => {
    const readinessSource = readFileSync(readinessPath, "utf8");
    assert.match(
      readinessSource,
      /const activeMissionCheck = \[\s*process\.execPath,\s*"scripts\/check-software-factory-active-mission\.mjs"\s*\]/
    );
    assert.equal(
      execFileSync(process.execPath, [readinessPath], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }).trim(),
      "factory-readiness passed"
    );
  });

  test("keeps Task140R0 blocked until integrated Task140P and then makes it solely eligible", () => {
    withMissionFixture(
      () => {},
      (fixturePath, registryPath) => {
        const summary = fixtureSummary(fixturePath, registryPath);
        assert.deepEqual(summary.eligibleFeatureIds, ["Task140P"]);
        assert.ok(summary.blockedFeatureIds.includes("Task140R0"));
      }
    );

    withMissionFixture(
      (source) => markIntegrated(source, ["Task140P"]),
      (fixturePath, registryPath) => {
        assert.deepEqual(fixtureSummary(fixturePath, registryPath).eligibleFeatureIds, ["Task140R0"]);
      }
    );
  });

  test("enforces every serialized and wave barrier through the sole Task153 release gate", () => {
    for (let index = 2; index < serializedFeatureIds.length; index += 1) {
      withMissionFixture(
        (source) => {
          markIntegrated(source, serializedFeatureIds.slice(0, index));
          if (index >= 4) {
            markMilestoneGates(source, ["FV-M1-TASK140-READINESS"]);
          }
        },
        (fixturePath, registryPath) => {
          assert.deepEqual(fixtureSummary(fixturePath, registryPath).eligibleFeatureIds, [
            serializedFeatureIds[index]
          ]);
        }
      );
    }

    withMissionFixture(
      (source) => {
        markIntegrated(source, serializedFeatureIds);
        markMilestoneGates(source, [
          "FV-M1-TASK140-READINESS",
          "FV-M2-WAVE2-READINESS"
        ]);
      },
      (fixturePath, registryPath) => {
        assert.deepEqual(fixtureSummary(fixturePath, registryPath).eligibleFeatureIds, wave3FeatureIds);
      }
    );

    withMissionFixture(
      (source) => {
        markIntegrated(source, [...serializedFeatureIds, ...wave3FeatureIds]);
        markMilestoneGates(source, [
          "FV-M1-TASK140-READINESS",
          "FV-M2-WAVE2-READINESS",
          "FV-M3-WAVE3"
        ]);
      },
      (fixturePath, registryPath) => {
        assert.deepEqual(fixtureSummary(fixturePath, registryPath).eligibleFeatureIds, [
          "A-FIXTURE"
        ]);
      }
    );

    withMissionFixture(
      (source) => {
        markIntegrated(source, [
          ...serializedFeatureIds,
          ...wave3FeatureIds,
          "A-FIXTURE"
        ]);
        markMilestoneGates(source, [
          "FV-M1-TASK140-READINESS",
          "FV-M2-WAVE2-READINESS",
          "FV-M3-WAVE3"
        ]);
      },
      (fixturePath, registryPath) => {
        assert.deepEqual(
          fixtureSummary(fixturePath, registryPath).eligibleFeatureIds,
          initiallyEligibleAcceptanceFeatureIds
        );
      }
    );

    withMissionFixture(
      (source) => {
        markIntegrated(source, [
          ...serializedFeatureIds,
          ...wave3FeatureIds,
          "A-FIXTURE",
          ...acceptanceFeatureIds
        ]);
        markMilestoneGates(source, [
          "FV-M1-TASK140-READINESS",
          "FV-M2-WAVE2-READINESS",
          "FV-M3-WAVE3",
          "FV-M4-WAVE4"
        ]);
      },
      (fixturePath, registryPath) => {
        assert.deepEqual(fixtureSummary(fixturePath, registryPath).eligibleFeatureIds, ["Task153"]);
      }
    );
  });

  test("accepts shared-path ownership across strict prerequisite ancestry", () => {
    withMissionFixture(
      (source) => {
        const ownedPath = findFeature(source, "Task140P").ownership.allowedPaths[0];
        assert.equal(typeof ownedPath, "string");
        const task140R0 = findFeature(source, "Task140R0");
        task140R0.ownership.allowedPaths.push(ownedPath);
        task140R0.ownership.pathCeiling += 1;
      },
      (fixturePath, registryPath) => {
        assert.doesNotThrow(() => fixtureSummary(fixturePath, registryPath));
      }
    );
  });

  test("rejects shared-path ownership between incomparable features", () => {
    withMissionFixture(
      (source) => {
        const ownedPath = findFeature(source, "Task142").ownership.allowedPaths[0];
        assert.equal(typeof ownedPath, "string");
        const task143 = findFeature(source, "Task143");
        task143.ownership.allowedPaths.push(ownedPath);
        task143.ownership.pathCeiling += 1;
      },
      (fixturePath, registryPath) => {
        assert.throws(
          () => fixtureSummary(fixturePath, registryPath),
          /incomparable owned path conflict/
        );
      }
    );
  });

  test("rejects forged registry projections and milestone-bypass state", () => {
    withMissionFixture(
      (source) => {
        const authority = source.authorityReferences.find(
          (reference) => reference.authorityRefId === "successor-control-authorization"
        );
        assert.ok(authority, "fixture must contain E1329 authority");
        authority.gitBlobSha = "0".repeat(40);
      },
      (fixturePath, registryPath) => {
        assert.throws(
          () => fixtureSummary(fixturePath, registryPath),
          /E1329 blob must equal/
        );
      }
    );

    withMissionFixture(
      (source) => {
        source.mission.controlPlaneStatus = "integrated";
        source.mission.acceptedIntegrationSha = execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: root,
          encoding: "utf8"
        }).trim();
      },
      (fixturePath, registryPath) => {
        assert.throws(
          () => fixtureSummary(fixturePath, registryPath),
          /controlPlaneIntegrationEvidence must be an object/
        );
      },
      { integrateControlPlane: false }
    );

    withMissionFixture(
      (source) => markIntegrated(source, ["Task140P"]),
      (fixturePath, registryPath) => {
        assert.throws(
          () => fixtureSummary(fixturePath, registryPath),
          /candidate control plane cannot carry feature or milestone progress/
        );
      },
      { integrateControlPlane: false }
    );

    withMissionFixture(
      (source) => {
        markIntegrated(source, ["Task140P"]);
        source.reviewedIntegrationEvidence.Task140P.reviewEventId =
          source.controlPlaneIntegrationEvidence.reviewEventId;
      },
      (fixturePath, registryPath) => {
        assert.throws(
          () => fixtureSummary(fixturePath, registryPath),
          /duplicate or reused lifecycle registry event ID/
        );
      }
    );

    withMissionFixture(
      (source) => {
        markIntegrated(source, ["Task140P"]);
        source.reviewedIntegrationEvidence.Task140P.reviewEventId = "RV-1-E-1329";
      },
      (fixturePath, registryPath) => {
        assert.throws(
          () => fixtureSummary(fixturePath, registryPath),
          /duplicate or reused lifecycle registry event ID RV-1-E-1329/
        );
      }
    );

    withMissionFixture(
      (source) => markIntegrated(source, ["Task140P"]),
      (fixturePath, registryPath) => {
        assert.throws(
          () => fixtureSummary(fixturePath, registryPath),
          /registry marker is missing or duplicated/
        );
      },
      {
        mutateRegistry: (registry) =>
          registry.replace("resident-full-vision-feature-integration-v1", "forged-integration")
      }
    );

    withMissionFixture(
      (source) => {
        markIntegrated(source, ["Task140P", "Task140R0", "Task140H", "Task140R1"]);
        markMilestoneGates(source, ["FV-M1-TASK140-READINESS"]);
      },
      (fixturePath, registryPath) => {
        assert.throws(
          () => fixtureSummary(fixturePath, registryPath),
          /black-box evidence registry marker is missing or duplicated/
        );
      },
      {
        mutateRegistry: (registry) =>
          registry.replace("resident-full-vision-black-box-evidence-v1", "forged-black-box")
      }
    );

    withMissionFixture(
      (source) => markIntegrated(source, [...serializedFeatureIds.slice(0, 5)]),
      (fixturePath, registryPath) => {
        assert.throws(
          () => fixtureSummary(fixturePath, registryPath),
          /Task131 integration requires authenticated FV-M1-TASK140-READINESS gate evidence/
        );
      }
    );

    withMissionFixture(
      (source) => {
        markIntegrated(source, orderedFeatureIds);
        markMilestoneGates(source, [
          "FV-M1-TASK140-READINESS",
          "FV-M2-WAVE2-READINESS",
          "FV-M3-WAVE3",
          "FV-M4-WAVE4"
        ]);
        findFeature(source, "Task153").integrationState = "released";
      },
      (fixturePath, registryPath) => {
        assert.throws(
          () => fixtureSummary(fixturePath, registryPath),
          /Task153 release requires authenticated FV-M5-RELEASE gate evidence/
        );
      }
    );
  });

  test("rejects non-exact integration topology and out-of-scope feature candidates", () => {
    const fixture = createTopologyFixture();
    try {
      fixtureGit(fixture.repository, [
        "switch",
        "-c",
        "fixture-intervening-parent",
        fixture.reviewRegistryCommitSha
      ]);
      writeFileSync(
        join(fixture.repository, "docs/agentic/topology-intervening.txt"),
        "intervening bytes\n"
      );
      fixtureGit(fixture.repository, [
        "add",
        "--",
        "docs/agentic/topology-intervening.txt"
      ]);
      fixtureGit(fixture.repository, ["commit", "-m", "fixture: add intervening bytes"]);
      const interveningEvidence = integrateControlFixture(
        fixture,
        "RV-1-E-8801",
        "fixture: merge after intervening bytes"
      );
      const interveningOutcome = topologyOutcome(
        fixture.repository,
        writeProjectedMission(
          fixture.repository,
          "intervening-parent-mission",
          interveningEvidence
        )
      );

      fixtureGit(fixture.repository, [
        "switch",
        "-c",
        "fixture-nondeterministic-tree",
        fixture.reviewRegistryCommitSha
      ]);
      fixtureGit(fixture.repository, [
        "merge",
        "--no-ff",
        "--no-commit",
        fixture.candidateSha
      ]);
      fixtureGit(fixture.repository, [
        "restore",
        "--source",
        fixture.reviewRegistryCommitSha,
        "--staged",
        "--worktree",
        "--",
        "AGENTS.md"
      ]);
      fixtureGit(fixture.repository, [
        "commit",
        "-m",
        "fixture: merge with substituted candidate bytes"
      ]);
      const substitutedIntegrationSha = fixtureGit(fixture.repository, ["rev-parse", "HEAD"]);
      const substitutedEvidence = {
        candidateSha: fixture.candidateSha,
        reviewEventId: fixture.reviewEventId,
        reviewRegistryCommitSha: fixture.reviewRegistryCommitSha,
        integrationEventId: "RV-1-E-8802",
        integrationSha: substitutedIntegrationSha
      };
      substitutedEvidence.integrationRegistryCommitSha = appendLifecycleEvent(
        fixture.repository,
        substitutedEvidence.integrationEventId,
        "fixture substituted integration recorded",
        controlIntegrationMarker(substitutedEvidence)
      );
      const substitutedOutcome = topologyOutcome(
        fixture.repository,
        writeProjectedMission(
          fixture.repository,
          "substituted-tree-mission",
          substitutedEvidence
        )
      );

      fixtureGit(fixture.repository, [
        "switch",
        "-c",
        "fixture-feature-scope",
        fixture.reviewRegistryCommitSha
      ]);
      const validControlEvidence = integrateControlFixture(
        fixture,
        "RV-1-E-8803",
        "fixture: merge exact successor control"
      );
      const featureBase = fixtureGit(fixture.repository, ["rev-parse", "HEAD"]);
      fixtureGit(fixture.repository, [
        "switch",
        "-c",
        "fixture-feature-candidate",
        featureBase
      ]);
      writeFileSync(
        join(fixture.repository, "docs/agentic/task140p-out-of-scope.txt"),
        "out-of-scope bytes\n"
      );
      fixtureGit(fixture.repository, [
        "add",
        "--",
        "docs/agentic/task140p-out-of-scope.txt"
      ]);
      fixtureGit(fixture.repository, ["commit", "-m", "fixture: out-of-scope Task140P"]);
      const featureCandidateSha = fixtureGit(fixture.repository, ["rev-parse", "HEAD"]);
      fixtureGit(fixture.repository, [
        "switch",
        "-c",
        "fixture-feature-program",
        featureBase
      ]);
      const featureReviewEventId = "RV-1-E-8804";
      const featureReviewRegistryCommitSha = appendLifecycleEvent(
        fixture.repository,
        featureReviewEventId,
        "fixture Task140P approved",
        featureReviewMarker("Task140P", featureCandidateSha, featureReviewEventId)
      );
      fixtureGit(fixture.repository, [
        "merge",
        "--no-ff",
        featureCandidateSha,
        "-m",
        "fixture: merge out-of-scope Task140P"
      ]);
      const featureIntegrationSha = fixtureGit(fixture.repository, ["rev-parse", "HEAD"]);
      const featureEvidence = {
        featureId: "Task140P",
        candidateSha: featureCandidateSha,
        reviewEventId: featureReviewEventId,
        reviewRegistryCommitSha: featureReviewRegistryCommitSha,
        integrationEventId: "RV-1-E-8805",
        integrationSha: featureIntegrationSha
      };
      featureEvidence.integrationRegistryCommitSha = appendLifecycleEvent(
        fixture.repository,
        featureEvidence.integrationEventId,
        "fixture Task140P integration recorded",
        featureIntegrationMarker("Task140P", featureEvidence)
      );
      const scopeOutcome = topologyOutcome(
        fixture.repository,
        writeProjectedMission(
          fixture.repository,
          "out-of-scope-feature-mission",
          validControlEvidence,
          featureEvidence
        )
      );

      assert.deepEqual(
        [interveningOutcome, substitutedOutcome, scopeOutcome],
        ["first-parent-rejected", "merge-tree-rejected", "scope-rejected"]
      );
    } finally {
      rmSync(fixture.fixtureDir, { recursive: true, force: true });
    }
  });

  test("readiness rejects checker substitution and selector forgery", () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "cestus-active-mission-chain-"));
    const clonePath = join(fixtureDir, "repo");
    try {
      execFileSync("git", ["clone", "--quiet", "--no-local", root, clonePath], {
        stdio: "pipe"
      });
      for (const path of candidateControlPaths) {
        copyFileSync(join(root, path), join(clonePath, path));
      }

      writeFileSync(
        join(clonePath, "scripts/check-software-factory-active-mission.mjs"),
        'console.log("forged success");\n'
      );
      assert.throws(
        () =>
          execFileSync(process.execPath, ["scripts/check-agent-readiness.mjs"], {
            cwd: clonePath,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"]
          }),
        /active mission checker digest changed/
      );

      copyFileSync(checkerPath, join(clonePath, "scripts/check-software-factory-active-mission.mjs"));
      const forgedSelector = JSON.parse(readFileSync(selectorPath, "utf8"));
      forgedSelector.activeMission.immutableEnvelopeFingerprint = `sha256:${"f".repeat(64)}`;
      writeFileSync(
        join(clonePath, "docs/agentic/contracts/software-factory-active-mission.v1.json"),
        `${JSON.stringify(forgedSelector, null, 2)}\n`
      );
      assert.throws(
        () =>
          execFileSync(process.execPath, ["scripts/check-agent-readiness.mjs"], {
            cwd: clonePath,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"]
          }),
        /active mission selector digest changed/
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
}
