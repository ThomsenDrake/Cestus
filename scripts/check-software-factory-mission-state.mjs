import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const canonicalSourcePath = "docs/agentic/contracts/software-factory-mission-state.v1.json";
const canonicalFrozenAuthorityPath = "docs/agentic/contracts/task136-bounded-assurance-v4.json";
const expectedSchemaVersion = "software-factory-mission-state.v1";
const expectedImmutableEnvelopeFingerprint = "sha256:ac80fb8d78cbd1c8abb135604327b284c638304796cc74dc094ce6168aaa5ce5";
const acceptedStatuses = [
  "claimed",
  "implementing",
  "candidate",
  "reviewing",
  "approved",
  "integrated",
  "released"
];
const riskLevelIds = ["level1", "level2", "level3"];
const level1AppliesTo = ["documentation", "mechanical-cleanup", "bounded-behavior-neutral-refactor"];
const level2AppliesTo = ["normal-feature", "bug-fix"];
const level2DualReviewBoundaries = [
  "public-or-cross-package-interface",
  "durable-or-portable-state",
  "provenance-or-projection",
  "security-auth-or-secrets",
  "human-gate",
  "irreversible-or-external-effect",
  "mission-critical-orchestration"
];
const level2PermanentRedCases = ["safety", "frozen-p0-p1", "reproduced-p0-p1", "difficult-recovery"];
const level3RequiredPractices = [
  "collaborative-plan",
  "finite-behavioral-contract-before-implementation",
  "meaningful-milestones",
  "fresh-bounded-workers",
  "externalized-shared-state",
  "fresh-scrutiny",
  "black-box-running-user-flow-validation",
  "targeted-defect-fixes",
  "full-live-release-gates-at-milestones-and-releases"
];
const level3RequiredGates = ["full", "live", "release"];

const argumentsWithoutFlags = process.argv.slice(2).filter((argument) => argument !== "--json");
const sourcePath = argumentsWithoutFlags[0] ?? canonicalSourcePath;
const jsonOutput = process.argv.includes("--json");

try {
  const source = readJson(sourcePath, "mission state");
  const summary = validateMissionState(source);
  if (jsonOutput) {
    console.log(JSON.stringify(summary));
  } else {
    console.log(`software-factory-mission-state passed ${summary.fingerprint}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`software-factory-mission-state failed: ${message}`);
  process.exitCode = 1;
}

function validateMissionState(source) {
  requireObject(source, "mission state");
  requireEqual(source.schemaVersion, expectedSchemaVersion, "schemaVersion");
  requireObject(source.mission, "mission");
  requireString(source.mission.missionId, "mission.missionId");
  requireStatus(source.mission.status, "mission.status");
  requireAcceptedIntegrationSha(
    source.mission.acceptedIntegrationSha,
    source.mission.status,
    "mission.acceptedIntegrationSha"
  );
  validateFrozenAuthority(source.mission.frozenAuthority);

  const scope = requireUniqueStrings(source.ownedPathScope, "ownedPathScope");
  requireObject(source.stateModel, "stateModel");
  requireArrayEqual(
    source.stateModel.registryEventStatuses,
    acceptedStatuses,
    "stateModel.registryEventStatuses"
  );
  requireString(source.stateModel.registryEventPolicy, "stateModel.registryEventPolicy");

  validateRiskLevels(source.riskLevels);
  validateExecutionTopology(source.executionTopology);
  requireUniqueStrings(source.invariants, "invariants");

  const features = validateFeatures(source.features, scope);
  const orderedFeatures = orderFeatures(features);
  validateMilestones(source.milestones, features);
  const immutableEnvelopeFingerprint = validateImmutableCalibrationEnvelope(source);

  const statusSummary = Object.fromEntries(
    acceptedStatuses
      .map((status) => [status, [...features.values()].filter((feature) => feature.status === status).length])
      .filter(([, count]) => count > 0)
  );
  const eligibleFeatureIds = orderedFeatures
    .filter(
      (feature) =>
        feature.status === "claimed" &&
        feature.prerequisiteIds.every((id) => ["integrated", "released"].includes(features.get(id).status))
    )
    .map((feature) => feature.featureId);
  const blockedFeatureIds = orderedFeatures
    .filter((feature) => feature.status === "claimed" && !eligibleFeatureIds.includes(feature.featureId))
    .map((feature) => feature.featureId);
  const validationAssertions = orderedFeatures.flatMap((feature) => feature.validationAssertions);

  return {
    schemaVersion: source.schemaVersion,
    missionId: source.mission.missionId,
    fingerprint: `sha256:${hash(stableJson(source))}`,
    immutableEnvelopeFingerprint,
    orderedFeatureIds: orderedFeatures.map((feature) => feature.featureId),
    eligibleFeatureIds,
    blockedFeatureIds,
    statusSummary,
    counts: {
      allowedPaths: scope.length,
      features: features.size,
      milestones: source.milestones.length,
      validationAssertions: validationAssertions.length
    }
  };
}

function validateImmutableCalibrationEnvelope(source) {
  const normalized = JSON.parse(JSON.stringify(source));
  normalized.mission.status = "__lifecycle-status__";
  normalized.mission.acceptedIntegrationSha = "__lifecycle-accepted-integration-sha__";
  for (const feature of normalized.features) {
    feature.status = "__lifecycle-status__";
    feature.acceptedIntegrationSha = "__lifecycle-accepted-integration-sha__";
  }
  const fingerprint = `sha256:${hash(stableJson(normalized))}`;
  if (fingerprint !== expectedImmutableEnvelopeFingerprint) {
    fail("immutable calibration envelope fingerprint mismatch");
  }
  return fingerprint;
}

function validateFrozenAuthority(authority) {
  requireObject(authority, "mission.frozenAuthority");
  requireEqual(authority.path, canonicalFrozenAuthorityPath, "mission.frozenAuthority.path");
  requireSha(authority.sha256, "mission.frozenAuthority.sha256");
  requireEqual(
    authority.unfinishedCardPrecedence,
    "authoritative",
    "unfinished V4 card precedence must be authoritative"
  );
  if (!Number.isInteger(authority.cardCount) || authority.cardCount <= 0) {
    fail("mission.frozenAuthority.cardCount must be a positive integer");
  }
  if (!existsSync(authority.path)) {
    fail(`frozen authority missing ${authority.path}`);
  }
  const bytes = readFileSync(authority.path);
  if (hash(bytes) !== authority.sha256) {
    fail("frozen authority digest changed");
  }
  const frozenAuthority = readJson(authority.path, "frozen authority");
  if (!Array.isArray(frozenAuthority.releaseGraph?.cards) || frozenAuthority.releaseGraph.cards.length !== authority.cardCount) {
    fail("frozen authority card count changed");
  }
}

function validateRiskLevels(riskLevels) {
  requireObject(riskLevels, "riskLevels");
  requireExactObjectKeys(riskLevels, riskLevelIds, "riskLevels must contain exactly level1, level2, and level3");

  const level1 = riskLevels.level1;
  requireExactObjectKeys(level1, ["name", "appliesTo", "workflow", "reviewRules"], "Level 1 schema");
  requireEqual(level1.name, "low-risk-interactive", "Level 1 name");
  requireArrayEqual(level1.appliesTo, level1AppliesTo, "Level 1 applies-to sequence");
  requireExactObjectKeys(
    level1.workflow,
    [
      "scope",
      "inspection",
      "validation",
      "commits",
      "defaultSeparateClaimRedGreenCommits",
      "defaultDualReviews",
      "defaultFullVerification",
      "dedicatedWorktreeWhenCheckoutSafetyClear"
    ],
    "Level 1 workflow schema"
  );
  requireEqual(level1.workflow.scope, "concise", "Level 1 scope rule");
  requireEqual(level1.workflow.inspection, "relevant", "Level 1 inspection rule");
  requireEqual(level1.workflow.validation, "focused", "Level 1 validation rule");
  requireEqual(level1.workflow.commits, "atomic", "Level 1 commit rule");
  requireExactObjectKeys(level1.reviewRules, ["freshAutomatedReview"], "Level 1 review schema");
  requireEqual(
    level1.reviewRules.freshAutomatedReview,
    "required-only-when-production-code-changes",
    "Level 1 review rule"
  );
  requireEqual(riskLevels.level1.workflow.defaultSeparateClaimRedGreenCommits, false, "Level 1 separate commit rule");
  requireEqual(riskLevels.level1.workflow.defaultDualReviews, false, "Level 1 dual review rule");
  requireEqual(riskLevels.level1.workflow.defaultFullVerification, false, "Level 1 full verification rule");
  requireEqual(riskLevels.level1.workflow.dedicatedWorktreeWhenCheckoutSafetyClear, false, "Level 1 worktree rule");

  const level2 = riskLevels.level2;
  requireExactObjectKeys(level2, ["name", "appliesTo", "workflow", "reviewRules"], "Level 2 schema");
  requireEqual(level2.name, "bounded-feature", "Level 2 name");
  requireArrayEqual(level2.appliesTo, level2AppliesTo, "Level 2 applies-to sequence");
  requireExactObjectKeys(
    level2.workflow,
    ["owners", "durableStatus", "behaviorEditPrecondition", "implementation", "validation", "commits", "freshReviews", "integration"],
    "Level 2 workflow schema"
  );
  requireEqual(level2.workflow.owners, 1, "Level 2 owner rule");
  requireEqual(level2.workflow.durableStatus, "compact", "Level 2 durable status rule");
  requireEqual(level2.workflow.behaviorEditPrecondition, "test-or-exact-reproduction", "Level 2 behavior precondition");
  requireEqual(level2.workflow.implementation, "minimal", "Level 2 implementation rule");
  requireEqual(level2.workflow.validation, "focused-relevant-cross-boundary", "Level 2 validation rule");
  requireEqual(level2.workflow.commits, "atomic", "Level 2 commit rule");
  requireEqual(level2.workflow.freshReviews, 1, "Level 2 fresh review rule");
  requireEqual(level2.workflow.integration, "milestone", "Level 2 integration rule");
  requireExactObjectKeys(
    level2.reviewRules,
    ["dualReviewRequiredFor", "permanentRedCommitAllowedFor", "behaviorChanges"],
    "Level 2 review schema"
  );
  requireArrayEqual(level2.reviewRules.dualReviewRequiredFor, level2DualReviewBoundaries, "Level 2 dual review sequence");
  requireArrayEqual(level2.reviewRules.permanentRedCommitAllowedFor, level2PermanentRedCases, "Level 2 RED sequence");
  requireEqual(level2.reviewRules.behaviorChanges, "test-first", "Level 2 test rule");

  const level3 = riskLevels.level3;
  requireExactObjectKeys(level3, ["name", "requiredPractices", "milestoneValidation"], "Level 3 schema");
  requireEqual(level3.name, "mission-assurance", "Level 3 name");
  requireArrayEqual(level3.requiredPractices, level3RequiredPractices, "Level 3 required practice sequence");
  const validation = level3.milestoneValidation;
  requireObject(validation, "Level 3 milestone validation");
  requireExactObjectKeys(
    validation,
    ["freshConcurrentScrutinyValidator", "blackBoxValidator", "sourceOnlyReviewsCanSubstitute", "requiredGates"],
    "Level 3 milestone validation schema"
  );
  requireEqual(validation.freshConcurrentScrutinyValidator, 1, "Level 3 milestone validation");
  requireEqual(validation.blackBoxValidator, 1, "Level 3 milestone validation");
  requireEqual(validation.sourceOnlyReviewsCanSubstitute, false, "Level 3 milestone validation");
  requireArrayEqual(validation.requiredGates, level3RequiredGates, "Level 3 required gates must match the approved sequence");
}

function validateExecutionTopology(topology) {
  requireObject(topology, "executionTopology");
  requireEqual(topology.coordinatorLayers, 1, "executionTopology.coordinatorLayers");
  requireString(topology.parallelism, "executionTopology.parallelism");
  requireString(topology.worktrees, "executionTopology.worktrees");
  requireString(topology.models, "executionTopology.models");
}

function validateFeatures(rawFeatures, scope) {
  if (!Array.isArray(rawFeatures) || rawFeatures.length === 0) {
    fail("features must be a non-empty array");
  }
  const features = new Map();
  const ownedPathOwners = new Map();
  for (const feature of rawFeatures) {
    requireObject(feature, "feature");
    requireString(feature.featureId, "feature.featureId");
    if (features.has(feature.featureId)) {
      fail(`duplicate feature ID ${feature.featureId}`);
    }
    requireUniqueStrings(feature.prerequisiteIds, `${feature.featureId}.prerequisiteIds`, false);
    requireUniqueStrings(feature.milestoneIds, `${feature.featureId}.milestoneIds`);
    if (!Object.hasOwn(feature, "riskLevel") || !["level1", "level2", "level3"].includes(feature.riskLevel)) {
      fail(`${feature.featureId}.riskLevel is invalid`);
    }
    requireObject(feature.ownership, `${feature.featureId}.ownership`);
    requireString(feature.ownership.ownerId, `${feature.featureId}.ownership.ownerId`);
    for (const path of requireUniqueStrings(feature.ownership.allowedPaths, `${feature.featureId}.ownership.allowedPaths`)) {
      if (!scope.includes(path)) {
        fail(`${feature.featureId} owns path outside ownedPathScope: ${path}`);
      }
      if (ownedPathOwners.has(path)) {
        fail(`owned path conflict ${path}: ${ownedPathOwners.get(path)} and ${feature.featureId}`);
      }
      ownedPathOwners.set(path, feature.featureId);
    }
    requireStatus(feature.status, `${feature.featureId}.status`);
    validateAssertions(feature.validationAssertions, feature.featureId);
    requireUniqueStrings(feature.targetedCommands, `${feature.featureId}.targetedCommands`);
    requireAcceptedIntegrationSha(
      feature.acceptedIntegrationSha,
      feature.status,
      `${feature.featureId}.acceptedIntegrationSha`
    );
    requireUniqueStrings(feature.releaseEvidenceRefs, `${feature.featureId}.releaseEvidenceRefs`);
    features.set(feature.featureId, feature);
  }
  if (ownedPathOwners.size !== scope.length || scope.some((path) => !ownedPathOwners.has(path))) {
    fail("ownedPathScope must be covered exactly once by feature ownership");
  }
  for (const feature of features.values()) {
    for (const prerequisiteId of feature.prerequisiteIds) {
      if (!features.has(prerequisiteId)) {
        fail(`${feature.featureId} references missing prerequisite ${prerequisiteId}`);
      }
    }
  }
  return features;
}

function validateAssertions(assertions, featureId) {
  if (!Array.isArray(assertions) || assertions.length === 0) {
    fail(`${featureId}.validationAssertions must be non-empty`);
  }
  const ids = new Set();
  for (const assertion of assertions) {
    requireObject(assertion, `${featureId}.validationAssertion`);
    requireString(assertion.assertionId, `${featureId}.validationAssertion.assertionId`);
    requireString(assertion.description, `${featureId}.validationAssertion.description`);
    requireString(assertion.command, `${featureId}.validationAssertion.command`);
    if (ids.has(assertion.assertionId)) {
      fail(`duplicate validation assertion ${assertion.assertionId}`);
    }
    ids.add(assertion.assertionId);
  }
}

function validateMilestones(rawMilestones, features) {
  if (!Array.isArray(rawMilestones) || rawMilestones.length === 0) {
    fail("milestones must be a non-empty array");
  }
  const milestones = new Map();
  for (const milestone of rawMilestones) {
    requireObject(milestone, "milestone");
    requireString(milestone.milestoneId, "milestone.milestoneId");
    if (milestones.has(milestone.milestoneId)) {
      fail(`duplicate milestone ID ${milestone.milestoneId}`);
    }
    milestones.set(milestone.milestoneId, milestone);
    requireUniqueStrings(milestone.featureIds, `${milestone.milestoneId}.featureIds`);
    if (!riskLevelIds.includes(milestone.riskLevel)) {
      fail(`${milestone.milestoneId}.riskLevel is invalid`);
    }
    if (milestone.riskLevel === "level3") {
      requireObject(milestone.validation, `${milestone.milestoneId}.validation`);
      requireEqual(milestone.validation.freshConcurrentScrutinyValidator, 1, "Level 3 milestone validation");
      requireEqual(milestone.validation.blackBoxValidator, 1, "Level 3 milestone validation");
      requireEqual(milestone.validation.sourceOnlyReviewsCanSubstitute, false, "Level 3 milestone validation");
    }
    if (milestone.riskLevel === "level2" && milestone.milestoneId !== "SFC-M1") {
      requireObject(milestone.validation, `${milestone.milestoneId}.validation`);
      requireEqual(milestone.validation.architectureValidator, 1, "Level 2 milestone architecture validation");
      requireEqual(milestone.validation.executabilityValidator, 1, "Level 2 milestone executability validation");
    }
  }
  const calibrationMilestone = milestones.get("SFC-M1");
  if (!calibrationMilestone) {
    fail("SFC-M1 must remain a Level 2 milestone");
  }
  requireEqual(calibrationMilestone.riskLevel, "level2", "SFC-M1 must remain a Level 2 milestone");
  if (!Object.hasOwn(calibrationMilestone.validation, "executabilityValidator")) {
    fail("Level 2 milestone executability validation");
  }
  requireExactObjectKeys(
    calibrationMilestone.validation,
    ["architectureValidator", "executabilityValidator"],
    "SFC-M1 validation schema"
  );
  requireEqual(
    calibrationMilestone.validation.architectureValidator,
    1,
    "SFC-M1 must retain exactly one architecture validator"
  );
  requireEqual(
    calibrationMilestone.validation.executabilityValidator,
    1,
    "SFC-M1 must retain exactly one executability validator"
  );
  for (const feature of features.values()) {
    for (const milestoneId of feature.milestoneIds) {
      const milestone = milestones.get(milestoneId);
      if (!milestone || !milestone.featureIds.includes(feature.featureId)) {
        fail(`bidirectional milestone membership disagreement for ${feature.featureId} and ${milestoneId}`);
      }
    }
  }
  for (const milestone of milestones.values()) {
    for (const featureId of milestone.featureIds) {
      const feature = features.get(featureId);
      if (!feature || !feature.milestoneIds.includes(milestone.milestoneId)) {
        fail(`bidirectional milestone membership disagreement for ${featureId} and ${milestone.milestoneId}`);
      }
    }
  }
}

function orderFeatures(features) {
  const remainingPrerequisites = new Map(
    [...features.values()].map((feature) => [feature.featureId, new Set(feature.prerequisiteIds)])
  );
  const ordered = [];
  while (remainingPrerequisites.size > 0) {
    const ready = [...remainingPrerequisites.entries()]
      .filter(([, prerequisites]) => prerequisites.size === 0)
      .map(([featureId]) => featureId)
      .sort();
    if (ready.length === 0) {
      fail("feature prerequisite cycle detected");
    }
    for (const featureId of ready) {
      ordered.push(features.get(featureId));
      remainingPrerequisites.delete(featureId);
      for (const prerequisites of remainingPrerequisites.values()) {
        prerequisites.delete(featureId);
      }
    }
  }
  return ordered;
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

function requireSha(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must be a SHA-256 hex digest`);
  }
}

function requireGitSha(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) {
    fail(`${label} must be a Git SHA`);
  }
}

function requireStatus(value, label) {
  if (!acceptedStatuses.includes(value)) {
    fail(`${label} is invalid`);
  }
}

function requireAcceptedIntegrationSha(value, status, label) {
  if (["integrated", "released"].includes(status)) {
    requireGitCommitSha(value, label);
    return;
  }
  if (value !== null) {
    fail(`${label} must be null before integration`);
  }
}

function requireGitCommitSha(value, label) {
  requireGitSha(value, label);
  let objectType;
  try {
    objectType = execFileSync("git", ["cat-file", "-t", value], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    fail(`${label} must resolve to a Git commit`);
  }
  if (objectType !== "commit") {
    fail(`${label} must resolve to a Git commit`);
  }
}

function requireUniqueStrings(value, label, requireNonEmpty = true) {
  if (!Array.isArray(value) || (requireNonEmpty && value.length === 0) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    fail(`${label} must be a ${requireNonEmpty ? "non-empty " : ""}string array`);
  }
  if (new Set(value).size !== value.length) {
    fail(`${label} must not contain duplicates`);
  }
  return value;
}

function requireArrayEqual(value, expected, label) {
  if (!Array.isArray(value) || value.length !== expected.length || value.some((item, index) => item !== expected[index])) {
    fail(`${label} must match the canonical lifecycle order`);
  }
}

function requireArrayIncludes(value, expected, label) {
  if (!Array.isArray(value) || !value.includes(expected)) {
    fail(`${label} must include ${expected}`);
  }
}

function requireExactObjectKeys(value, expectedKeys, label) {
  requireObject(value, label);
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actualKeys.length !== expected.length || actualKeys.some((key, index) => key !== expected[index])) {
    fail(label);
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
