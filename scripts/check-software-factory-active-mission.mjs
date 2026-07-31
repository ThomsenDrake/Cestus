import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";

const canonicalSelectorPath =
  "docs/agentic/contracts/software-factory-active-mission.v1.json";
const canonicalMissionPath =
  "docs/agentic/contracts/resident-agent-full-vision-mission-state.v1.json";
const canonicalCheckerPath = "scripts/check-software-factory-active-mission.mjs";
const canonicalRegistryPath =
  "docs/agentic/resident-agent-full-vision-program-registry.md";
const historicalMissionPath =
  "docs/agentic/contracts/software-factory-mission-state.v1.json";
const historicalCheckerPath = "scripts/check-software-factory-mission-state.mjs";
const historicalTestPath = "scripts/check-software-factory-mission-state.test.mjs";
const expectedSelectorSchema = "software-factory-active-mission-selector.v1";
const expectedMissionSchema = "resident-agent-full-vision-mission-state.v1";
const expectedSummarySchema = "software-factory-active-mission-summary.v1";
const expectedMissionId = "resident-agent-full-vision";
const expectedSelectorId = "cestus-software-factory-active-mission";
const expectedActiveMissionImmutableEnvelopeFingerprint =
  "sha256:4c909946e9c86f2c07100e0245aa662d9493f376391052b3b54c7f93a2901b36";
const successorControlAuthorizationSha =
  "639ff359f67d7cd156bc1b6be5ac56a842dbb030";
const integrationStates = ["pending", "integrated", "released"];
const registryStatuses = [
  "claimed",
  "implementing",
  "candidate",
  "reviewing",
  "approved",
  "integrated",
  "released"
];
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
const expectedFeatureIds = [
  ...serializedFeatureIds,
  ...wave3FeatureIds,
  "A-FIXTURE",
  ...acceptanceFeatureIds,
  "Task153"
];
const expectedMilestones = [
  {
    milestoneId: "FV-M1-TASK140-READINESS",
    featureIds: ["Task140P", "Task140R0", "Task140H", "Task140R1"],
    unlocksFeatureIds: ["Task131"]
  },
  {
    milestoneId: "FV-M2-WAVE2-READINESS",
    featureIds: ["Task131", "Task141"],
    unlocksFeatureIds: wave3FeatureIds
  },
  {
    milestoneId: "FV-M3-WAVE3",
    featureIds: wave3FeatureIds,
    unlocksFeatureIds: ["A-FIXTURE"]
  },
  {
    milestoneId: "FV-M4-WAVE4",
    featureIds: ["A-FIXTURE", ...acceptanceFeatureIds],
    unlocksFeatureIds: ["Task153"],
    requiredGateFacts: [
      "ten-authenticated-acceptance-verdicts",
      "accepted-repairs-integrated",
      "downstream-worktrees-rebased",
      "subscription-feasibility-recorded",
      "safe-live-and-deployment-evidence"
    ]
  },
  {
    milestoneId: "FV-M5-RELEASE",
    featureIds: ["Task153"],
    unlocksFeatureIds: [],
    requiredGateFacts: [
      "Task153-reviewed-and-integrated",
      "all-Wave-0-through-4-integration-SHAs",
      "human-release-decision"
    ]
  }
];
const expectedPrerequisites = new Map([
  ["Task140P", []],
  ["Task140R0", ["Task140P"]],
  ["Task140H", ["Task140R0"]],
  ["Task140R1", ["Task140H"]],
  ["Task131", ["Task140R1"]],
  ["Task141", ["Task131"]],
  ...wave3FeatureIds.map((featureId) => [featureId, ["Task141"]]),
  ["A-FIXTURE", wave3FeatureIds],
  ["A-01", ["A-FIXTURE"]],
  ["A-02", ["A-01"]],
  ["A-03", ["A-02"]],
  ["A-04", ["A-03"]],
  ["A-05", ["A-04"]],
  ["A-06", ["A-05"]],
  ["A-07", ["A-06"]],
  ["A-08", ["A-07"]],
  ["A-09", ["A-08"]],
  ["A-10", ["A-09"]],
  ["Task153", acceptanceFeatureIds]
]);
const exactTask140PPaths = [
  "packages/agent/src/task-orchestrator-approval-admission.ts",
  "packages/agent/src/task-orchestrator-approval.ts",
  "packages/agent/src/task-orchestrator-handoff-port.ts",
  "packages/agent/src/task-orchestrator.ts",
  "packages/agent/test/task-orchestrator-approval-admission.test.ts",
  "packages/agent/test/task-orchestrator-approval.test.ts",
  "packages/agent/test/task-orchestrator-handoff-port.test.ts",
  "packages/agent/test/task-orchestrator-dispatch.test.ts",
  "packages/agent/test/task-orchestrator-recovery.test.ts",
  "packages/local-runtime/test/task-orchestrator-handoff-port-imports.test.ts",
  "docs/agentic/claims/task-140-p-private-prompt-admission.md"
];
const exactTask140PCommand =
  "npm test -- packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/local-runtime/test/task-orchestrator-handoff-port-imports.test.ts && npm run typecheck && ! rg -n 'task-orchestrator-approval-admission|task-orchestrator-handoff-port' packages/agent/src/index.ts && git diff --check && npm run factory:check";
const expectedAuthorityReferences = new Map([
  [
    "full-vision-design",
    [
      "docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md",
      "9040fa396fba48bfdc7ac2d8c9c90715f41c2c58959948d163975e97080e9d24"
    ]
  ],
  [
    "full-vision-plan",
    [
      "docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md",
      "913ff2723e3e7a1217f7d75086bc240c321955ab5dadf07882f5ce2439b6b3bf"
    ]
  ],
  [
    "cf1-freeze",
    [
      "docs/agentic/resident-agent-full-vision-contract-freeze.md",
      "63bc52aa306f3da6bc58b9e91047c4a945111b25f5cc55eb1642241a3ba5e807"
    ]
  ],
  [
    "cf1-terminal-amendments",
    [
      "docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md",
      "54b255332e85147e38c663000eff7ef2c877a17d0a1da5cca97d42d084b855ac"
    ]
  ],
  [
    "acceptance-matrix",
    [
      "docs/agentic/resident-agent-full-vision-acceptance-matrix.md",
      "9b35396e36f9cee89c871089bc8bc44e173cc175d91f6714aaa5609cb3dd66d7"
    ]
  ],
  [
    "acceptance-design",
    [
      "docs/superpowers/specs/2026-07-12-resident-agent-acceptance-design.md",
      "45fc7947aa3026ad9d74dfd848d891022cb4096098ab62df9b9b1b6763303bbb"
    ]
  ],
  [
    "acceptance-plan",
    [
      "docs/superpowers/plans/2026-07-12-resident-agent-acceptance-implementation.md",
      "89b9422a2d87cf0bae1752525dd33e7dfea6cadb34fbf361d74b5d61bcc24a6c"
    ]
  ],
  [
    "task140-prerequisite-checker",
    [
      "scripts/check-resident-task-prerequisites.mjs",
      "953200e4aafca9f39cf6d1be3f856e8fced34f72d171c63a8d4b9761213e04a6"
    ]
  ]
]);

const options = parseOptions(process.argv.slice(2));
const repositoryRoot = process.cwd();
const selectorPath = options.selectorPath ?? canonicalSelectorPath;
const missionOverridePath = options.missionPath;
const registryFixturePath = options.registryFixturePath;

try {
  const selector = readJson(selectorPath, "active mission selector");
  const historicalCalibration = validateSelector(selector);
  const missionPath = missionOverridePath ?? selector.activeMission.source.path;
  const mission = readJson(missionPath, "active mission");
  const summary = validateMission(mission, selector, {
    enforceImmutableEnvelope: missionOverridePath === undefined,
    registryFixturePath
  });
  const output = {
    schemaVersion: expectedSummarySchema,
    selectorId: selector.selectorId,
    ...summary,
    historicalCalibration
  };
  if (options.json) {
    console.log(JSON.stringify(output));
  } else {
    console.log(
      `software-factory-active-mission passed ${output.missionId} eligible=${output.eligibleFeatureIds.join(",")}`
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`software-factory-active-mission failed: ${message}`);
  process.exitCode = 1;
}

function parseOptions(args) {
  const parsed = {
    json: false,
    selectorPath: undefined,
    missionPath: undefined,
    registryFixturePath: undefined
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if (
      argument === "--selector" ||
      argument === "--mission" ||
      argument === "--registry-fixture"
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        fail(`${argument} requires a path`);
      }
      if (argument === "--selector") {
        parsed.selectorPath = value;
      } else if (argument === "--mission") {
        parsed.missionPath = value;
      } else {
        parsed.registryFixturePath = value;
      }
      index += 1;
      continue;
    }
    fail(`unknown argument ${argument}`);
  }
  if (parsed.registryFixturePath !== undefined && parsed.missionPath === undefined) {
    fail("--registry-fixture is test-only and requires --mission");
  }
  return parsed;
}

function validateSelector(selector) {
  requireObject(selector, "selector");
  requireEqual(selector.schemaVersion, expectedSelectorSchema, "selector.schemaVersion");
  requireEqual(selector.selectorId, expectedSelectorId, "selector.selectorId");
  requireObject(selector.historicalPredecessor, "selector.historicalPredecessor");
  requireEqual(
    selector.historicalPredecessor.missionId,
    "software-factory-calibration",
    "historical predecessor mission ID"
  );
  requireEqual(
    selector.historicalPredecessor.status,
    "integrated",
    "historical predecessor status"
  );
  requireEqual(
    selector.historicalPredecessor.acceptedIntegrationSha,
    "9bb902a5e201a4ab6a0e71339d1ff28a3dfaf95c",
    "historical predecessor integration SHA"
  );
  validatePinnedFile(
    selector.historicalPredecessor.source,
    historicalMissionPath,
    "4f86f78fbedfc27993513888bb349610e6e5a7bfcf2c6a82775e6d97ea2d05c3",
    "historical mission source"
  );
  validatePinnedFile(
    selector.historicalPredecessor.checker,
    historicalCheckerPath,
    "c5a83e917f2f9040fb522d3a078fb35dd0de752b84c1dc77c83ca6a2304f2792",
    "historical mission checker"
  );
  validatePinnedFile(
    selector.historicalPredecessor.test,
    historicalTestPath,
    "889329082267bc4d6efe76e1398eaf2139224804e99d17057d46699b9aab4e91",
    "historical mission test"
  );
  const historicalSummary = JSON.parse(
    execFileSync(process.execPath, [historicalCheckerPath, "--json"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
  );
  requireEqual(
    historicalSummary.missionId,
    selector.historicalPredecessor.missionId,
    "historical checker mission ID"
  );
  requireEqual(
    historicalSummary.fingerprint,
    selector.historicalPredecessor.expectedFingerprint,
    "historical mission fingerprint"
  );
  requireEqual(
    historicalSummary.immutableEnvelopeFingerprint,
    selector.historicalPredecessor.expectedImmutableEnvelopeFingerprint,
    "historical immutable envelope fingerprint"
  );
  requireArrayEqual(historicalSummary.eligibleFeatureIds, [], "historical eligibility");

  requireObject(selector.activeMission, "selector.activeMission");
  requireEqual(selector.activeMission.missionId, expectedMissionId, "active mission ID");
  requireEqual(
    selector.activeMission.schemaVersion,
    expectedMissionSchema,
    "active mission schema"
  );
  requireEqual(
    selector.activeMission.source.path,
    canonicalMissionPath,
    "active mission source path"
  );
  validateRelativePath(selector.activeMission.source.path, "active mission source path");
  validatePinnedFile(
    selector.activeMission.checker,
    canonicalCheckerPath,
    selector.activeMission.checker.sha256,
    "active mission checker"
  );
  requireSha256(
    selector.activeMission.immutableEnvelopeFingerprint,
    "active mission immutable envelope fingerprint"
  );
  requireEqual(
    selector.activeMission.immutableEnvelopeFingerprint,
    expectedActiveMissionImmutableEnvelopeFingerprint,
    "active mission immutable envelope trust anchor"
  );
  requireRegularFile(selector.activeMission.source.path, "active mission source");
  return {
    missionId: historicalSummary.missionId,
    fingerprint: historicalSummary.fingerprint,
    immutableEnvelopeFingerprint: historicalSummary.immutableEnvelopeFingerprint
  };
}

function validateMission(source, selector, { enforceImmutableEnvelope, registryFixturePath }) {
  requireObject(source, "active mission");
  requireEqual(source.schemaVersion, expectedMissionSchema, "active mission schemaVersion");
  requireObject(source.mission, "active mission.mission");
  requireEqual(source.mission.missionId, expectedMissionId, "active mission ID");
  if (!["candidate", "integrated"].includes(source.mission.controlPlaneStatus)) {
    fail("active mission controlPlaneStatus is invalid");
  }
  validateLifecycleEventIdUniqueness(source, registryFixturePath);
  requireEqual(source.mission.riskLevel, "level3", "active mission risk level");
  requireEqual(
    source.mission.historicalPredecessorMissionId,
    "software-factory-calibration",
    "active mission predecessor"
  );
  requireEqual(
    source.mission.registryLifecycleAuthority,
    "docs/agentic/resident-agent-full-vision-program-registry.md",
    "registry lifecycle authority"
  );
  requireString(source.mission.eligibilityMeaning, "mission.eligibilityMeaning");
  if (source.mission.controlPlaneStatus === "integrated") {
    requireReachableCommit(source.mission.acceptedIntegrationSha, "mission.acceptedIntegrationSha");
    requireObject(
      source.controlPlaneIntegrationEvidence,
      "controlPlaneIntegrationEvidence"
    );
    requireEqual(
      source.controlPlaneIntegrationEvidence.integrationSha,
      source.mission.acceptedIntegrationSha,
      "control-plane integration SHA"
    );
    validateControlPlaneRegistryEvidence(
      source.controlPlaneIntegrationEvidence,
      registryFixturePath
    );
  } else if (source.mission.acceptedIntegrationSha !== null) {
    fail("mission.acceptedIntegrationSha must be null before integration");
  } else if (source.controlPlaneIntegrationEvidence !== null) {
    fail("controlPlaneIntegrationEvidence must be null before integration");
  }
  if (
    source.mission.controlPlaneStatus === "candidate" &&
    (
      Object.keys(source.reviewedIntegrationEvidence ?? {}).length > 0 ||
      Object.keys(source.milestoneGateEvidence ?? {}).length > 0 ||
      (Array.isArray(source.features) &&
        source.features.some((feature) => feature?.integrationState !== "pending"))
    )
  ) {
    fail("candidate control plane cannot carry feature or milestone progress");
  }
  validateRecoveryBaseline(source.mission.recoveryBaseline);
  const authorityReferences = validateAuthorityReferences(source.authorityReferences);
  validateStateModel(source.stateModel);
  validateInvariants(source.invariants);
  validateFailureInventory(source.failureInventory);

  const milestones = validateMilestones(source.milestones);
  const features = validateFeatures(
    source.features,
    authorityReferences,
    source.reviewedIntegrationEvidence,
    registryFixturePath
  );
  validateMilestoneEvidence(
    source.milestoneGateEvidence,
    milestones,
    features,
    source.reviewedIntegrationEvidence,
    registryFixturePath
  );
  validateIntegratedFeatureMilestoneClosure(
    features,
    milestones,
    source.milestoneGateEvidence
  );
  validateOwnership(features);
  validateExactTask140P(features.get("Task140P"));

  const immutableEnvelopeFingerprint = `sha256:${hash(
    stableJson(normalizeImmutableEnvelope(source))
  )}`;
  if (
    enforceImmutableEnvelope &&
    immutableEnvelopeFingerprint !== expectedActiveMissionImmutableEnvelopeFingerprint
  ) {
    fail("active mission immutable envelope fingerprint mismatch");
  }
  const orderedFeatures = expectedFeatureIds.map((featureId) => features.get(featureId));
  const milestoneUnlockByFeature = new Map();
  for (const milestone of milestones.values()) {
    for (const featureId of milestone.unlocksFeatureIds) {
      milestoneUnlockByFeature.set(featureId, milestone.milestoneId);
    }
  }
  const prospectiveEligibleFeatureIds = orderedFeatures
    .filter((feature) => {
      if (feature.integrationState !== "pending") {
        return false;
      }
      const prerequisitesComplete = feature.prerequisiteIds.every((featureId) =>
        ["integrated", "released"].includes(features.get(featureId).integrationState)
      );
      const milestoneId = milestoneUnlockByFeature.get(feature.featureId);
      const milestoneComplete =
        milestoneId === undefined || Object.hasOwn(source.milestoneGateEvidence, milestoneId);
      return prerequisitesComplete && milestoneComplete;
    })
    .map((feature) => feature.featureId);
  const eligibleFeatureIds =
    source.mission.controlPlaneStatus === "integrated" ? prospectiveEligibleFeatureIds : [];
  const blockedFeatureIds = orderedFeatures
    .filter(
      (feature) =>
        feature.integrationState === "pending" &&
        !eligibleFeatureIds.includes(feature.featureId)
    )
    .map((feature) => feature.featureId);
  return {
    missionId: source.mission.missionId,
    controlPlaneStatus: source.mission.controlPlaneStatus,
    fingerprint: `sha256:${hash(stableJson(source))}`,
    immutableEnvelopeFingerprint,
    orderedFeatureIds: expectedFeatureIds,
    prospectiveEligibleFeatureIds,
    eligibleFeatureIds,
    blockedFeatureIds,
    completedMilestoneIds: Object.keys(source.milestoneGateEvidence),
    counts: {
      features: features.size,
      milestones: milestones.size,
      ownedPathEntries: [...features.values()].reduce(
        (count, feature) => count + feature.ownership.allowedPaths.length,
        0
      )
    }
  };
}

function validateRecoveryBaseline(baseline) {
  requireObject(baseline, "mission.recoveryBaseline");
  requireEqual(baseline.registryEventId, "RV-1-E-1328", "recovery registry event");
  requireEqual(
    baseline.programSha,
    "0e5b0e7d4b8bfae3f577c23dc8083623b5a25880",
    "recovery program SHA"
  );
  requireEqual(
    baseline.releasedTask136Sha,
    "21ac850894ff3e040069b4307c95e20148db96fc",
    "released Task136 SHA"
  );
  requireEqual(
    baseline.publishedNeoSha,
    "baab662fb6ecd79de9a34f1c3801aa76d3428848",
    "published neo SHA"
  );
  requireEqual(baseline.strictFrontier?.accepted, 29, "strict frontier accepted count");
  requireEqual(baseline.strictFrontier?.total, 29, "strict frontier total count");
  requireReachableCommit(baseline.programSha, "recovery program SHA");
  requireCommitObject(baseline.releasedTask136Sha, "released Task136 SHA");
  requireCommitObject(baseline.publishedNeoSha, "published neo SHA");
  requireAncestor(baseline.releasedTask136Sha, baseline.publishedNeoSha, "Task136 publication ancestry");
  requireAncestor(successorControlAuthorizationSha, "HEAD", "successor control ancestry");
}

function validateAuthorityReferences(rawReferences) {
  if (!Array.isArray(rawReferences)) {
    fail("authorityReferences must be an array");
  }
  const references = new Map();
  for (const reference of rawReferences) {
    requireObject(reference, "authority reference");
    requireString(reference.authorityRefId, "authorityRefId");
    if (references.has(reference.authorityRefId)) {
      fail(`duplicate authority reference ${reference.authorityRefId}`);
    }
    requireString(reference.locator, `${reference.authorityRefId}.locator`);
    validateRelativePath(reference.path, `${reference.authorityRefId}.path`);
    requireSha256Hex(reference.sha256, `${reference.authorityRefId}.sha256`);
    references.set(reference.authorityRefId, reference);
  }
  for (const [authorityRefId, [path, sha256]] of expectedAuthorityReferences) {
    const reference = references.get(authorityRefId);
    if (!reference) {
      fail(`missing authority reference ${authorityRefId}`);
    }
    requireEqual(reference.path, path, `${authorityRefId}.path`);
    requireEqual(reference.sha256, sha256, `${authorityRefId}.sha256`);
    requireRegularFile(path, authorityRefId);
    if (hash(readFileSync(resolve(repositoryRoot, path))) !== sha256) {
      fail(`${authorityRefId} digest changed`);
    }
  }
  validatePinnedRegistrySnapshot(references.get("e1328-failure-inventory"), {
    label: "E1328",
    eventId: "RV-1-E-1328",
    gitCommitSha: "0e5b0e7d4b8bfae3f577c23dc8083623b5a25880",
    gitBlobSha: "97389be913e06a236349bdefeb267962af1ce11e",
    sha256: "f34c7bf3cc2a4fcba795e314ee807fe6d34b4712bfb10742be915b8c90125d23"
  });
  validatePinnedRegistrySnapshot(references.get("successor-control-authorization"), {
    label: "E1329",
    eventId: "RV-1-E-1329",
    gitCommitSha: successorControlAuthorizationSha,
    gitBlobSha: "9eba27b1cd16516eea070ea269043e2fa7642c9c",
    sha256: "473d9c416ce6bae48b959926f747b681e387fe57b4ff8e4c2aeac2a24f422a60"
  });
  validateRegistryOnlyInsertionCommit(successorControlAuthorizationSha, {
    expectedParent: "0e5b0e7d4b8bfae3f577c23dc8083623b5a25880",
    expectedAdditions: 48,
    expectedEventId: "RV-1-E-1329",
    label: "E1329 authorization"
  });
  if (references.size !== expectedAuthorityReferences.size + 2) {
    fail("authorityReferences contains an unapproved reference");
  }
  return references;
}

function validatePinnedRegistrySnapshot(reference, expected) {
  if (!reference) {
    fail(`missing authority reference ${expected.label}`);
  }
  requireEqual(reference.path, canonicalRegistryPath, `${expected.label} path`);
  requireEqual(reference.gitCommitSha, expected.gitCommitSha, `${expected.label} commit`);
  requireEqual(reference.gitBlobSha, expected.gitBlobSha, `${expected.label} blob`);
  requireEqual(reference.sha256, expected.sha256, `${expected.label} digest`);
  requireEqual(reference.locator, expected.eventId, `${expected.label} locator`);
  requireAncestor(expected.gitCommitSha, "HEAD", `${expected.label} authority ancestry`);
  const resolvedBlob = execFileSync(
    "git",
    ["rev-parse", `${expected.gitCommitSha}:${canonicalRegistryPath}`],
    { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();
  requireEqual(resolvedBlob, expected.gitBlobSha, `${expected.label} snapshot blob`);
  const snapshot = readRegistryAtCommit(expected.gitCommitSha);
  if (hash(snapshot) !== expected.sha256) {
    fail(`${expected.label} snapshot digest changed`);
  }
  requireUniqueEventSection(snapshot.toString("utf8"), expected.eventId, expected.label);
}

function validateStateModel(stateModel) {
  requireObject(stateModel, "stateModel");
  requireArrayEqual(
    stateModel.featureIntegrationStates,
    integrationStates,
    "feature integration states"
  );
  requireArrayEqual(
    stateModel.registryEventStatuses,
    registryStatuses,
    "registry lifecycle states"
  );
  requireString(stateModel.eligibleWhen, "stateModel.eligibleWhen");
  requireString(stateModel.registryProjectionRule, "stateModel.registryProjectionRule");
}

function validateLifecycleEventIdUniqueness(source, registryFixturePath) {
  const eventIds = [];
  if (source.controlPlaneIntegrationEvidence && typeof source.controlPlaneIntegrationEvidence === "object") {
    eventIds.push(
      source.controlPlaneIntegrationEvidence.reviewEventId,
      source.controlPlaneIntegrationEvidence.integrationEventId
    );
  }
  if (source.reviewedIntegrationEvidence && typeof source.reviewedIntegrationEvidence === "object") {
    for (const evidence of Object.values(source.reviewedIntegrationEvidence)) {
      if (evidence && typeof evidence === "object") {
        eventIds.push(evidence.reviewEventId, evidence.integrationEventId);
      }
    }
  }
  if (source.milestoneGateEvidence && typeof source.milestoneGateEvidence === "object") {
    for (const evidence of Object.values(source.milestoneGateEvidence)) {
      if (evidence && typeof evidence === "object") {
        eventIds.push(
          evidence.blackBoxEvidence?.registryEventId,
          evidence.fullGateEvidence?.registryEventId,
          evidence.registryEventId
        );
      }
    }
  }
  const pinnedRegistry = readRegistryAtCommit(successorControlAuthorizationSha).toString("utf8");
  const seen = new Set(
    [...pinnedRegistry.matchAll(/^## (RV-1-E-[0-9]+) —[^\r\n]*$/gm)].map(
      (match) => match[1]
    )
  );
  const projectedEventIds = eventIds.filter((value) => typeof value === "string");
  for (const eventId of projectedEventIds) {
    if (seen.has(eventId)) {
      fail(`duplicate or reused lifecycle registry event ID ${eventId}`);
    }
    seen.add(eventId);
  }
  if (registryFixturePath === undefined) {
    const currentRegistry = readRegistryAtCommit("HEAD").toString("utf8");
    const successorHeadingCounts = new Map();
    for (const match of currentRegistry.matchAll(/^## (RV-1-E-([0-9]+)) —[^\r\n]*$/gm)) {
      if (Number(match[2]) > 1329) {
        successorHeadingCounts.set(match[1], (successorHeadingCounts.get(match[1]) ?? 0) + 1);
      }
    }
    for (const [eventId, count] of successorHeadingCounts) {
      if (count !== 1) {
        fail(`successor registry event heading is duplicated ${eventId}`);
      }
    }
    for (const eventId of projectedEventIds) {
      if (countEventHeadings(currentRegistry, eventId) !== 1) {
        fail(`projected lifecycle event is not unique in current registry ${eventId}`);
      }
    }
  }
}

function validateInvariants(invariants) {
  const expected = [
    "append-only-ledger",
    "provenance-required",
    "projection-rebuildability",
    "mounted-workspace-authority",
    "human-prr-send-gate",
    "legal-gate",
    "fail-closed-authority",
    "secret-safety",
    "no-fallback-writes",
    "provider-byte-transfer-requires-exact-committed-gate"
  ];
  requireArrayEqual(invariants, expected, "active mission invariants");
}

function validateFailureInventory(inventory) {
  requireObject(inventory, "failureInventory");
  requireEqual(inventory.sourceEventId, "RV-1-E-1328", "failure inventory source");
  requireEqual(inventory.baseline?.total, 3372, "failure inventory total");
  requireEqual(inventory.baseline?.passed, 3311, "failure inventory passed");
  requireEqual(inventory.baseline?.failed, 56, "failure inventory failed");
  requireEqual(inventory.baseline?.skipped, 5, "failure inventory skipped");
  const owners = inventory.semanticOwners;
  if (!Array.isArray(owners) || owners.length !== 3) {
    fail("failureInventory.semanticOwners must contain exactly three owners");
  }
  requireEqual(owners[0]?.featureId, "Task140R0", "first semantic owner");
  requireEqual(owners[0]?.failures, 37, "Task140R0 semantic failures");
  requireEqual(owners[1]?.featureId, "Task140R1", "second semantic owner");
  requireEqual(owners[1]?.failures, 1, "Task140R1 semantic failures");
  requireEqual(owners[2]?.featureId, "Task142", "third semantic owner");
  requireEqual(owners[2]?.failures, 7, "Task142 semantic failures");
  requireEqual(
    inventory.runnerCalibration?.timeoutOnlyOccurrences,
    11,
    "runner timeout-only occurrences"
  );
  requireEqual(
    inventory.runnerCalibration?.productRepairOwner,
    null,
    "runner timeout product owner"
  );
  requireEqual(
    inventory.runnerCalibration?.serializedAffectedSuites?.passed,
    39,
    "serialized runner passes"
  );
  requireEqual(
    inventory.runnerCalibration?.serializedAffectedSuites?.total,
    39,
    "serialized runner total"
  );
}

function validateMilestones(rawMilestones) {
  if (!Array.isArray(rawMilestones) || rawMilestones.length !== expectedMilestones.length) {
    fail("milestones must contain exactly five entries");
  }
  const milestones = new Map();
  for (const [index, expected] of expectedMilestones.entries()) {
    const milestone = rawMilestones[index];
    requireObject(milestone, "milestone");
    requireEqual(milestone.milestoneId, expected.milestoneId, "milestone order");
    requireEqual(milestone.riskLevel, "level3", `${milestone.milestoneId}.riskLevel`);
    requireArrayEqual(
      milestone.featureIds,
      expected.featureIds,
      `${milestone.milestoneId}.featureIds`
    );
    requireArrayEqual(
      milestone.unlocksFeatureIds,
      expected.unlocksFeatureIds,
      `${milestone.milestoneId}.unlocksFeatureIds`
    );
    requireObject(milestone.validation, `${milestone.milestoneId}.validation`);
    requireEqual(
      milestone.validation.freshConcurrentScrutinyValidator,
      1,
      `${milestone.milestoneId} scrutiny validator`
    );
    requireEqual(
      milestone.validation.blackBoxValidator,
      1,
      `${milestone.milestoneId} black-box validator`
    );
    requireEqual(
      milestone.validation.sourceOnlyReviewsCanSubstitute,
      false,
      `${milestone.milestoneId} source-only substitution`
    );
    requireString(milestone.validation.fullGate, `${milestone.milestoneId}.fullGate`);
    requireString(milestone.validation.liveGate, `${milestone.milestoneId}.liveGate`);
    requireString(milestone.validation.releaseGate, `${milestone.milestoneId}.releaseGate`);
    if (expected.requiredGateFacts === undefined) {
      if (milestone.validation.requiredGateFacts !== undefined) {
        fail(`${milestone.milestoneId}.requiredGateFacts is not authorized`);
      }
    } else {
      requireArrayEqual(
        milestone.validation.requiredGateFacts,
        expected.requiredGateFacts,
        `${milestone.milestoneId}.requiredGateFacts`
      );
    }
    milestones.set(milestone.milestoneId, milestone);
  }
  return milestones;
}

function validateFeatures(rawFeatures, authorityReferences, evidence, registryFixturePath) {
  if (!Array.isArray(rawFeatures) || rawFeatures.length !== expectedFeatureIds.length) {
    fail("features must contain exactly 29 entries");
  }
  requireObject(evidence, "reviewedIntegrationEvidence");
  const features = new Map();
  for (const [index, featureId] of expectedFeatureIds.entries()) {
    const feature = rawFeatures[index];
    requireObject(feature, "feature");
    requireEqual(feature.featureId, featureId, "feature order");
    if (features.has(featureId)) {
      fail(`duplicate feature ${featureId}`);
    }
    requireArrayEqual(
      feature.prerequisiteIds,
      expectedPrerequisites.get(featureId),
      `${featureId}.prerequisiteIds`
    );
    const expectedMilestone = expectedMilestones.find((milestone) =>
      milestone.featureIds.includes(featureId)
    );
    requireEqual(feature.milestoneId, expectedMilestone.milestoneId, `${featureId}.milestoneId`);
    if (!["level2", "level3"].includes(feature.riskLevel)) {
      fail(`${featureId}.riskLevel is invalid`);
    }
    requireObject(feature.scopeAuthority, `${featureId}.scopeAuthority`);
    if (!authorityReferences.has(feature.scopeAuthority.authorityRefId)) {
      fail(`${featureId} references unknown scope authority`);
    }
    requireString(feature.scopeAuthority.locator, `${featureId}.scopeAuthority.locator`);
    requireObject(feature.ownership, `${featureId}.ownership`);
    if (!Array.isArray(feature.ownership.allowedPaths)) {
      fail(`${featureId}.ownership.allowedPaths must be an array`);
    }
    if (
      !Number.isInteger(feature.ownership.pathCeiling) ||
      feature.ownership.pathCeiling !== feature.ownership.allowedPaths.length
    ) {
      fail(`${featureId}.ownership.pathCeiling must equal its allowed path count`);
    }
    if (new Set(feature.ownership.allowedPaths).size !== feature.ownership.allowedPaths.length) {
      fail(`${featureId}.ownership.allowedPaths contains duplicates`);
    }
    for (const path of feature.ownership.allowedPaths) {
      validateRelativePath(path, `${featureId} owned path`);
    }
    requireString(feature.externalEffectGate, `${featureId}.externalEffectGate`);
    if (!integrationStates.includes(feature.integrationState)) {
      fail(`${featureId}.integrationState is invalid`);
    }
    const featureEvidence = evidence[featureId];
    if (feature.integrationState === "pending") {
      if (feature.acceptedIntegrationSha !== null || featureEvidence !== undefined) {
        fail(`${featureId} pending integration state carries integration evidence`);
      }
    } else {
      requireReachableCommit(
        feature.acceptedIntegrationSha,
        `${featureId}.acceptedIntegrationSha`
      );
      requireObject(featureEvidence, `${featureId} reviewed integration evidence`);
      requireReachableCommit(featureEvidence.candidateSha, `${featureId}.candidateSha`);
      requireRegistryEventId(featureEvidence.reviewEventId, `${featureId}.reviewEventId`);
      requireReachableCommit(
        featureEvidence.reviewRegistryCommitSha,
        `${featureId}.reviewRegistryCommitSha`
      );
      requireRegistryEventId(featureEvidence.integrationEventId, `${featureId}.integrationEventId`);
      requireEqual(
        featureEvidence.integrationSha,
        feature.acceptedIntegrationSha,
        `${featureId}.integrationSha`
      );
      requireReachableCommit(featureEvidence.integrationSha, `${featureId}.integrationSha`);
      requireReachableCommit(
        featureEvidence.integrationRegistryCommitSha,
        `${featureId}.integrationRegistryCommitSha`
      );
      validateFeatureRegistryEvidence(featureId, featureEvidence, registryFixturePath);
    }
    features.set(featureId, feature);
  }
  for (const featureId of Object.keys(evidence)) {
    if (!features.has(featureId)) {
      fail(`reviewedIntegrationEvidence contains unknown feature ${featureId}`);
    }
  }
  for (const feature of features.values()) {
    if (feature.integrationState === "pending") {
      continue;
    }
    for (const prerequisiteId of feature.prerequisiteIds) {
      if (!["integrated", "released"].includes(features.get(prerequisiteId).integrationState)) {
        fail(`${feature.featureId} integration evidence is not prerequisite-closed`);
      }
    }
  }
  return features;
}

function validateMilestoneEvidence(
  rawEvidence,
  milestones,
  features,
  reviewedIntegrationEvidence,
  registryFixturePath
) {
  requireObject(rawEvidence, "milestoneGateEvidence");
  for (const [milestoneId, evidence] of Object.entries(rawEvidence)) {
    const milestone = milestones.get(milestoneId);
    if (!milestone) {
      fail(`milestoneGateEvidence contains unknown milestone ${milestoneId}`);
    }
    for (const featureId of milestone.featureIds) {
      if (!["integrated", "released"].includes(features.get(featureId).integrationState)) {
        fail(`${milestoneId} gate evidence exists before every member is integrated`);
      }
    }
    requireObject(evidence, `${milestoneId} gate evidence`);
    requireRegistryEventId(evidence.registryEventId, `${milestoneId}.registryEventId`);
    requireReachableCommit(evidence.registryCommitSha, `${milestoneId}.registryCommitSha`);
    requireReachableCommit(evidence.evidenceSha, `${milestoneId}.evidenceSha`);
    validateMilestoneSupportingEvidenceShape(
      evidence.blackBoxEvidence,
      `${milestoneId}.blackBoxEvidence`
    );
    validateMilestoneSupportingEvidenceShape(
      evidence.fullGateEvidence,
      `${milestoneId}.fullGateEvidence`
    );
    requireEqual(
      evidence.evidenceSha,
      evidence.fullGateEvidence.registryCommitSha,
      `${milestoneId}.evidenceSha`
    );
    requireEqual(
      evidence.liveGateEvidenceRef,
      `policy:${milestone.validation.liveGate}`,
      `${milestoneId}.liveGateEvidenceRef`
    );
    validateMilestoneRegistryEvidence(
      milestone,
      evidence,
      reviewedIntegrationEvidence,
      registryFixturePath
    );
  }
}

function validateMilestoneSupportingEvidenceShape(evidence, label) {
  requireObject(evidence, label);
  requireRegistryEventId(evidence.registryEventId, `${label}.registryEventId`);
  requireReachableCommit(evidence.registryCommitSha, `${label}.registryCommitSha`);
  requireSha256Hex(evidence.resultSha256, `${label}.resultSha256`);
}

function validateIntegratedFeatureMilestoneClosure(features, milestones, gateEvidence) {
  const milestoneUnlockByFeature = new Map();
  for (const milestone of milestones.values()) {
    for (const featureId of milestone.unlocksFeatureIds) {
      milestoneUnlockByFeature.set(featureId, milestone.milestoneId);
    }
  }
  for (const feature of features.values()) {
    if (feature.integrationState === "pending") {
      continue;
    }
    if (feature.integrationState === "released") {
      if (feature.featureId !== "Task153") {
        fail(`${feature.featureId} cannot carry the sole program released state`);
      }
      if (!Object.hasOwn(gateEvidence, "FV-M5-RELEASE")) {
        fail("Task153 release requires authenticated FV-M5-RELEASE gate evidence");
      }
    }
    const milestoneId = milestoneUnlockByFeature.get(feature.featureId);
    if (milestoneId !== undefined && !Object.hasOwn(gateEvidence, milestoneId)) {
      fail(
        `${feature.featureId} integration requires authenticated ${milestoneId} gate evidence`
      );
    }
  }
}

function validateFeatureRegistryEvidence(featureId, evidence, registryFixturePath) {
  validateRegistryLifecycleEvidence(featureId, evidence, registryFixturePath, {
    identityKey: "featureId",
    integrationMarkerName: "resident-full-vision-feature-integration-v1",
    reviewMarkerName: "resident-full-vision-feature-review-v1"
  });
}

function validateControlPlaneRegistryEvidence(evidence, registryFixturePath) {
  validateRegistryLifecycleEvidence("successor-mission-control", evidence, registryFixturePath, {
    identityKey: "controlPlaneId",
    integrationMarkerName: "resident-full-vision-control-plane-integration-v1",
    reviewMarkerName: "resident-full-vision-control-plane-review-v1"
  });
}

function validateRegistryLifecycleEvidence(
  lifecycleId,
  evidence,
  registryFixturePath,
  { identityKey, integrationMarkerName, reviewMarkerName }
) {
  const label = lifecycleId;
  requireObject(evidence, `${label} lifecycle evidence`);
  requireReachableCommit(evidence.candidateSha, `${label}.candidateSha`);
  requireRegistryEventId(evidence.reviewEventId, `${label}.reviewEventId`);
  requireReachableCommit(evidence.reviewRegistryCommitSha, `${label}.reviewRegistryCommitSha`);
  requireRegistryEventId(evidence.integrationEventId, `${label}.integrationEventId`);
  requireReachableCommit(evidence.integrationSha, `${label}.integrationSha`);
  requireReachableCommit(
    evidence.integrationRegistryCommitSha,
    `${label}.integrationRegistryCommitSha`
  );
  requireAncestor(
    successorControlAuthorizationSha,
    evidence.reviewRegistryCommitSha,
    `${label} review registry authority`
  );
  requireAncestor(
    successorControlAuthorizationSha,
    evidence.integrationRegistryCommitSha,
    `${label} integration registry authority`
  );
  requireAncestor(
    evidence.candidateSha,
    evidence.integrationSha,
    `${label} candidate integration ancestry`
  );
  requireAncestor(
    evidence.reviewRegistryCommitSha,
    evidence.integrationRegistryCommitSha,
    `${label} review-before-integration registry ancestry`
  );
  requireAncestor(
    evidence.integrationSha,
    evidence.integrationRegistryCommitSha,
    `${label} integration registry ancestry`
  );

  const reviewRegistry = readProjectionRegistry(
    evidence.reviewRegistryCommitSha,
    registryFixturePath
  );
  const reviewSection = requireUniqueEventSection(
    reviewRegistry,
    evidence.reviewEventId,
    `${label} review event`
  );
  const reviewMarker = `<!-- ${reviewMarkerName} ${stableJson({
    candidateSha: evidence.candidateSha,
    [identityKey]: lifecycleId,
    reviewEventId: evidence.reviewEventId,
    verdict: "APPROVED"
  })} -->`;
  requireUniqueMarker(
    reviewSection,
    reviewMarker,
    `${label} review registry marker`
  );

  const integrationRegistry = readProjectionRegistry(
    evidence.integrationRegistryCommitSha,
    registryFixturePath
  );
  const integrationSection = requireUniqueEventSection(
    integrationRegistry,
    evidence.integrationEventId,
    `${label} integration event`
  );
  const integrationMarker = `<!-- ${integrationMarkerName} ${stableJson({
    candidateSha: evidence.candidateSha,
    [identityKey]: lifecycleId,
    integrationEventId: evidence.integrationEventId,
    integrationSha: evidence.integrationSha,
    reviewEventId: evidence.reviewEventId,
    reviewRegistryCommitSha: evidence.reviewRegistryCommitSha
  })} -->`;
  requireUniqueMarker(
    integrationSection,
    integrationMarker,
    `${label} integration registry marker`
  );

  if (registryFixturePath === undefined) {
    validateRegistryOnlyInsertionCommit(evidence.reviewRegistryCommitSha, {
      expectedEventId: evidence.reviewEventId,
      expectedMarker: reviewMarker,
      label: `${label} review registry event`
    });
    validateHistoryPreservingIntegration(label, evidence);
    validateRegistryOnlyInsertionCommit(evidence.integrationRegistryCommitSha, {
      expectedParent: evidence.integrationSha,
      expectedEventId: evidence.integrationEventId,
      expectedMarker: integrationMarker,
      label: `${label} integration registry event`
    });
  }
}

function validateMilestoneRegistryEvidence(
  milestone,
  evidence,
  reviewedIntegrationEvidence,
  registryFixturePath
) {
  requireAncestor(
    successorControlAuthorizationSha,
    evidence.registryCommitSha,
    `${milestone.milestoneId} registry authority`
  );
  for (const featureId of milestone.featureIds) {
    requireAncestor(
      reviewedIntegrationEvidence[featureId].integrationRegistryCommitSha,
      evidence.blackBoxEvidence.registryCommitSha,
      `${milestone.milestoneId} member integration ancestry`
    );
  }
  requireAncestor(
    evidence.blackBoxEvidence.registryCommitSha,
    evidence.fullGateEvidence.registryCommitSha,
    `${milestone.milestoneId} black-box-before-full-gate ancestry`
  );
  requireAncestor(
    evidence.fullGateEvidence.registryCommitSha,
    evidence.registryCommitSha,
    `${milestone.milestoneId} full-gate-before-milestone ancestry`
  );
  validateMilestoneSupportingRegistryEvidence(
    milestone.milestoneId,
    evidence.blackBoxEvidence,
    "black-box",
    registryFixturePath
  );
  validateMilestoneSupportingRegistryEvidence(
    milestone.milestoneId,
    evidence.fullGateEvidence,
    "full-gate",
    registryFixturePath,
    evidence.blackBoxEvidence.registryCommitSha
  );
  const registry = readProjectionRegistry(evidence.registryCommitSha, registryFixturePath);
  const section = requireUniqueEventSection(
    registry,
    evidence.registryEventId,
    `${milestone.milestoneId} event`
  );
  const milestoneMarker = `<!-- resident-full-vision-milestone-gate-v1 ${stableJson({
    blackBoxEvidence: evidence.blackBoxEvidence,
    evidenceSha: evidence.evidenceSha,
    fullGateEvidence: evidence.fullGateEvidence,
    liveGateEvidenceRef: evidence.liveGateEvidenceRef,
    milestoneId: milestone.milestoneId,
    registryEventId: evidence.registryEventId,
    requiredGateFacts: milestone.validation.requiredGateFacts ?? []
  })} -->`;
  requireUniqueMarker(
    section,
    milestoneMarker,
    `${milestone.milestoneId} registry marker`
  );
  if (registryFixturePath === undefined) {
    validateRegistryOnlyInsertionCommit(evidence.registryCommitSha, {
      expectedParent: evidence.evidenceSha,
      expectedEventId: evidence.registryEventId,
      expectedMarker: milestoneMarker,
      label: `${milestone.milestoneId} registry event`
    });
  }
}

function validateMilestoneSupportingRegistryEvidence(
  milestoneId,
  evidence,
  evidenceKind,
  registryFixturePath,
  expectedParent
) {
  requireAncestor(
    successorControlAuthorizationSha,
    evidence.registryCommitSha,
    `${milestoneId} ${evidenceKind} registry authority`
  );
  const registry = readProjectionRegistry(evidence.registryCommitSha, registryFixturePath);
  const section = requireUniqueEventSection(
    registry,
    evidence.registryEventId,
    `${milestoneId} ${evidenceKind} evidence event`
  );
  const evidenceMarker = `<!-- resident-full-vision-${evidenceKind}-evidence-v1 ${stableJson({
    milestoneId,
    registryEventId: evidence.registryEventId,
    resultSha256: evidence.resultSha256
  })} -->`;
  requireUniqueMarker(
    section,
    evidenceMarker,
    `${milestoneId} ${evidenceKind} evidence`
  );
  if (registryFixturePath === undefined) {
    validateRegistryOnlyInsertionCommit(evidence.registryCommitSha, {
      expectedParent,
      expectedEventId: evidence.registryEventId,
      expectedMarker: evidenceMarker,
      label: `${milestoneId} ${evidenceKind} evidence event`
    });
  }
}

function validateOwnership(features) {
  const ownersByPath = new Map();
  for (const feature of features.values()) {
    for (const path of feature.ownership.allowedPaths) {
      const owners = ownersByPath.get(path) ?? [];
      owners.push(feature.featureId);
      ownersByPath.set(path, owners);
    }
  }
  for (const [path, owners] of ownersByPath) {
    for (let leftIndex = 0; leftIndex < owners.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < owners.length; rightIndex += 1) {
        const left = owners[leftIndex];
        const right = owners[rightIndex];
        if (!isFeatureAncestor(left, right, features) && !isFeatureAncestor(right, left, features)) {
          fail(`incomparable owned path conflict ${path}: ${left} and ${right}`);
        }
      }
    }
  }
}

function isFeatureAncestor(ancestorId, descendantId, features) {
  const pending = [...features.get(descendantId).prerequisiteIds];
  const visited = new Set();
  while (pending.length > 0) {
    const featureId = pending.pop();
    if (featureId === ancestorId) {
      return true;
    }
    if (visited.has(featureId)) {
      continue;
    }
    visited.add(featureId);
    pending.push(...features.get(featureId).prerequisiteIds);
  }
  return false;
}

function validateExactTask140P(feature) {
  requireEqual(feature.ownership.pathCeiling, 11, "Task140P path ceiling");
  requireArrayEqual(feature.ownership.allowedPaths, exactTask140PPaths, "Task140P allowed paths");
  requireEqual(feature.scopeAuthority.authorityRefId, "cf1-terminal-amendments", "Task140P authority");
  requireEqual(feature.scopeAuthority.locator, "CF-1R28.2", "Task140P authority locator");
  requireObject(feature.prerequisiteProfile, "Task140P prerequisite profile");
  requireEqual(
    feature.prerequisiteProfile.checkerAuthorityRefId,
    "task140-prerequisite-checker",
    "Task140P prerequisite checker"
  );
  requireEqual(feature.prerequisiteProfile.profile, "task140p", "Task140P profile");
  requireArrayEqual(feature.targetedCommands, [exactTask140PCommand], "Task140P command");
  requireEqual(feature.externalEffectGate, "none", "Task140P external effect gate");
}

function readProjectionRegistry(commitSha, registryFixturePath) {
  if (registryFixturePath !== undefined) {
    return readRegularFixtureFile(registryFixturePath, "registry fixture");
  }
  return readRegistryAtCommit(commitSha).toString("utf8");
}

function readRegistryAtCommit(commitSha) {
  try {
    return execFileSync("git", ["show", `${commitSha}:${canonicalRegistryPath}`], {
      cwd: repositoryRoot,
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch {
    fail(`${commitSha} does not contain the canonical registry`);
  }
}

function readRegularFixtureFile(path, label) {
  let stat;
  try {
    stat = lstatSync(resolve(path));
  } catch {
    fail(`${label} is missing`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(`${label} must be a regular non-symlink file`);
  }
  return readFileSync(resolve(path), "utf8");
}

function requireUniqueEventSection(registry, eventId, label) {
  const text = Buffer.isBuffer(registry) ? registry.toString("utf8") : registry;
  const escapedEventId = eventId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(`^## ${escapedEventId} —[^\\r\\n]*$`, "gm");
  const matches = [...text.matchAll(headingPattern)];
  if (matches.length !== 1) {
    fail(`${label} heading is missing or duplicated`);
  }
  const start = matches[0].index;
  const followingHeadingOffset = text.slice(start + 1).search(/^## /m);
  const end = followingHeadingOffset === -1 ? text.length : start + 1 + followingHeadingOffset;
  return text.slice(start, end);
}

function requireUniqueMarker(section, marker, label) {
  const first = section.indexOf(marker);
  if (first === -1 || section.indexOf(marker, first + marker.length) !== -1) {
    fail(`${label} registry marker is missing or duplicated`);
  }
}

function validateRegistryOnlyInsertionCommit(
  commitSha,
  { expectedParent, expectedAdditions, expectedEventId, expectedMarker, label }
) {
  const parentLine = execFileSync("git", ["rev-list", "--parents", "-n", "1", commitSha], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  })
    .trim()
    .split(/\s+/);
  if (parentLine.length !== 2) {
    fail(`${label} must be a one-parent commit`);
  }
  const parentSha = parentLine[1];
  if (expectedParent !== undefined) {
    requireEqual(parentSha, expectedParent, `${label} parent`);
  }
  const names = execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", parentSha, commitSha],
    { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  requireArrayEqual(names, [canonicalRegistryPath], `${label} changed paths`);
  const [additionsText, deletionsText, path] = execFileSync(
    "git",
    ["diff", "--numstat", "--no-renames", parentSha, commitSha, "--", canonicalRegistryPath],
    { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  )
    .trim()
    .split(/\s+/);
  const additions = Number(additionsText);
  const deletions = Number(deletionsText);
  if (path !== canonicalRegistryPath || !Number.isInteger(additions) || additions <= 0) {
    fail(`${label} must add registry lines`);
  }
  requireEqual(deletions, 0, `${label} registry deletions`);
  if (expectedAdditions !== undefined) {
    requireEqual(additions, expectedAdditions, `${label} registry additions`);
  }
  if (expectedEventId !== undefined) {
    const parentRegistry = readRegistryAtCommit(parentSha).toString("utf8");
    if (countEventHeadings(parentRegistry, expectedEventId) !== 0) {
      fail(`${label} reuses an event heading from its parent registry`);
    }
    if (expectedMarker !== undefined && parentRegistry.includes(expectedMarker)) {
      fail(`${label} reuses a marker from its parent registry`);
    }
    const commitRegistry = readRegistryAtCommit(commitSha).toString("utf8");
    const eventSection = requireUniqueEventSection(
      commitRegistry,
      expectedEventId,
      `${label} introduced event`
    );
    if (expectedMarker !== undefined) {
      requireUniqueMarker(eventSection, expectedMarker, `${label} introduced marker`);
    }
    const addedLines = execFileSync(
      "git",
      [
        "diff",
        "--unified=0",
        "--no-renames",
        parentSha,
        commitSha,
        "--",
        canonicalRegistryPath
      ],
      { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    )
      .split(/\r?\n/)
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .map((line) => line.slice(1));
    const escapedEventId = expectedEventId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const addedHeadingPattern = new RegExp(`^## ${escapedEventId} —[^\\r\\n]*$`);
    if (addedLines.filter((line) => addedHeadingPattern.test(line)).length !== 1) {
      fail(`${label} must add its exact event heading once`);
    }
    if (
      expectedMarker !== undefined &&
      addedLines.filter((line) => line === expectedMarker).length !== 1
    ) {
      fail(`${label} must add its exact marker once`);
    }
  }
}

function countEventHeadings(registry, eventId) {
  const escapedEventId = eventId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...registry.matchAll(new RegExp(`^## ${escapedEventId} —[^\\r\\n]*$`, "gm"))]
    .length;
}

function validateHistoryPreservingIntegration(featureId, evidence) {
  const parents = execFileSync(
    "git",
    ["rev-list", "--parents", "-n", "1", evidence.integrationSha],
    { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  )
    .trim()
    .split(/\s+/);
  if (parents.length !== 3) {
    fail(`${featureId} integration must be a two-parent history-preserving merge`);
  }
  requireEqual(parents[2], evidence.candidateSha, `${featureId} candidate second parent`);
  requireAncestor(
    evidence.reviewRegistryCommitSha,
    parents[1],
    `${featureId} approval-first integration ancestry`
  );
}

function normalizeImmutableEnvelope(source) {
  const normalized = JSON.parse(JSON.stringify(source));
  normalized.mission.controlPlaneStatus = "__control-plane-status__";
  normalized.mission.acceptedIntegrationSha = "__control-plane-integration-sha__";
  normalized.controlPlaneIntegrationEvidence = {};
  normalized.reviewedIntegrationEvidence = {};
  normalized.milestoneGateEvidence = {};
  for (const feature of normalized.features) {
    feature.integrationState = "__feature-integration-state__";
    feature.acceptedIntegrationSha = "__feature-integration-sha__";
  }
  return normalized;
}

function validatePinnedFile(value, expectedPath, expectedSha256, label) {
  requireObject(value, label);
  requireEqual(value.path, expectedPath, `${label} path`);
  requireEqual(value.sha256, expectedSha256, `${label} digest`);
  validateRelativePath(value.path, `${label} path`);
  requireRegularFile(value.path, label);
  if (hash(readFileSync(resolve(repositoryRoot, value.path))) !== value.sha256) {
    fail(`${label} digest changed`);
  }
}

function requireRegularFile(path, label) {
  const absolutePath = resolve(repositoryRoot, path);
  const repositoryPrefix = `${resolve(repositoryRoot)}${sep}`;
  if (absolutePath !== resolve(repositoryRoot) && !absolutePath.startsWith(repositoryPrefix)) {
    fail(`${label} escapes the repository`);
  }
  let stat;
  try {
    stat = lstatSync(absolutePath);
  } catch {
    fail(`${label} is missing`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(`${label} must be a regular non-symlink file`);
  }
}

function validateRelativePath(path, label) {
  requireString(path, label);
  if (isAbsolute(path) || path.includes("\\") || normalize(path) !== path) {
    fail(`${label} must be a normalized repository-relative path`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail(`${label} must not contain traversal segments`);
  }
  const fromRoot = relative(resolve(repositoryRoot), resolve(repositoryRoot, path));
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    fail(`${label} escapes the repository`);
  }
}

function requireReachableCommit(value, label) {
  requireCommitObject(value, label);
  requireAncestor(value, "HEAD", `${label} ancestry`);
}

function requireCommitObject(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) {
    fail(`${label} must be a Git SHA`);
  }
  let type;
  try {
    type = execFileSync("git", ["cat-file", "-t", value], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    fail(`${label} must resolve to a Git commit`);
  }
  if (type !== "commit") {
    fail(`${label} must resolve to a Git commit`);
  }
}

function requireAncestor(ancestor, descendant, label) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: repositoryRoot,
      stdio: "ignore"
    });
  } catch {
    fail(`${label} is not preserved`);
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`${label} cannot be read: ${message}`);
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

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must be a sha256 fingerprint`);
  }
}

function requireSha256Hex(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must be a SHA-256 hex digest`);
  }
}

function requireRegistryEventId(value, label) {
  if (typeof value !== "string" || !/^RV-1-E-[0-9]+$/.test(value)) {
    fail(`${label} must be a registry event ID`);
  }
}

function requireArrayEqual(value, expected, label) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((item, index) => item !== expected[index])
  ) {
    fail(`${label} must match the committed sequence`);
  }
}

function requireEqual(value, expected, label) {
  if (value !== expected) {
    fail(`${label} must equal ${JSON.stringify(expected)}`);
  }
}

function fail(message) {
  throw new Error(message);
}
