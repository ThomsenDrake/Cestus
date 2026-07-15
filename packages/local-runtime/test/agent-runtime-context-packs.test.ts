import { describe, expect, it, vi } from "vitest";
import {
  buildResolvedContextPack,
  hashAgentContextPack,
  serializeContextPackPayload,
  type AgentContextPackJsonValue,
  type ContextPackDescriptor,
  type ContextPackPayloadParser,
  type ContextPackRegistry
} from "../../agent/src/index.js";
import { registerContextPackPayloadParserAuthority } from "../../agent/src/context-packs.js";
import {
  buildWorkspaceRuntimeStatusContextPack,
  operationalContextPackDescriptors,
  operationalContextPackPayloadParsers
} from "../../agent/src/operational-context-packs.js";
import {
  buildPrrReadModelContextPack,
  prrReadModelPayloadParser
} from "../../agent/src/prr-context-packs.js";
import {
  buildEvidenceSummaryContextPack,
  buildSelectionManifestHash,
  evidenceSummaryPayloadParser,
  investigativeRegistrationIdentity,
  type InvestigativeContextPackDependencies,
  type InvestigativeEvidenceRow,
  type InvestigativeSelectionManifestBody
} from "../../agent/src/investigative-context-packs.js";
import {
  createMountedAgentContextCapability,
  hasVerifiedContextBindingSet,
  type ContextRegistrationBinding,
  type MountedWorkspaceRuntimeAuthority
} from "../src/agent-runtime-context-packs.js";

const now = "2026-07-14T20:00:00.000Z";
const workspaceId = "workspace_a";
const mountInstanceId = "mount_a";
const workspaceIdentityEventId = "evt_workspace_identity_a";
const policyVersion = "resident-policy.v1";
const sourceHighWaterMark = 42;
const runId = "run_context_a";

describe("mounted runtime context packs", () => {
  it("accepts the bounded operational, selected-PRR, and investigative family contracts without conflating workspace authority with pack scope", async () => {
    const operational = buildOperationalPack();
    const prr = buildSelectedPrrPack();
    const investigative = await buildInvestigativeEvidencePack();
    const { authority } = mountedAuthority({ sourceHighWaterMark: 100 });
    const capability = createMountedAgentContextCapability({
      authority,
      registrations: Object.freeze([
        familyRegistration({
          descriptor: operationalContextPackDescriptors[0]!,
          resolved: operational,
          parserIdentity: "workspace-runtime-status.v1",
          producerIdentity: "packages/agent/src/operational-context-packs:workspace-runtime-status.v1",
          registrationIdentity: "operational-context-packs:mounted-workspace-provider",
          selectionProof: { kind: "operational-ref.v1" }
        }),
        familyRegistration({
          descriptor: prrDescriptor(),
          resolved: prr,
          parserIdentity: "prr-read-model.v1",
          producerIdentity: "packages/local-runtime/agent-prr-context-packs:prr-read-model.v1",
          registrationIdentity: "packages/local-runtime/agent-prr-context-packs:prr-read-model.v1@1",
          selectionProof: { kind: "prr-selected-request.v1", streamHighWaterMark: 9 }
        }),
        familyRegistration({
          descriptor: investigativeDescriptor(),
          resolved: investigative,
          parserIdentity: "evidence-summary.v1",
          producerIdentity: "packages/agent/src/investigative-context-packs:evidence-summary.v1",
          registrationIdentity: investigativeRegistrationIdentity.moduleId,
          selectionProof: {
            kind: "investigative-selection-manifest.v1",
            manifestHash: investigativeSelectionManifestHash(investigative.payload),
            sourceProjectionHighWaterMarks: [
              { projection: "graph", highWaterMark: 41 },
              { projection: "ingestion", highWaterMark: 42 }
            ]
          }
        })
      ]),
      registerBuilders: (registry) => {
        registry.register({
          descriptor: operationalContextPackDescriptors[0]!,
          parsePayload: parserWithStableIdentity(
            "workspace-runtime-status.v1",
            operationalContextPackPayloadParsers["workspace-runtime-status.v1@1"]!
          ),
          build: () => operational
        });
        registry.register({
          descriptor: prrDescriptor(),
          parsePayload: parserWithStableIdentity("prr-read-model.v1", prrReadModelPayloadParser),
          build: () => prr
        });
        registry.register({
          descriptor: investigativeDescriptor(),
          parsePayload: parserWithStableIdentity(
            "evidence-summary.v1",
            (payload, ref) => evidenceSummaryPayloadParser.parsePayload(payload, ref) as AgentContextPackJsonValue
          ),
          build: () => investigative
        });
      }
    });

    const bindingSet = await capability.verifyForRun(verifyForRun({
      sourceHighWaterMark: 100,
      requiredContextPackIds: [
        "workspace-runtime-status.v1",
        "prr-read-model.v1",
        "evidence-summary.v1"
      ]
    }));

    expect(bindingSet.contextPacks.map((pack) => pack.ref.contextPackId)).toEqual([
      "workspace-runtime-status.v1",
      "prr-read-model.v1",
      "evidence-summary.v1"
    ]);
    expect(bindingSet.bindings.map((binding) => binding.scope)).toEqual([
      { kind: "workspace", id: workspaceId },
      { kind: "prr-request", id: "prr_req_selected" },
      { kind: "workspace", id: workspaceId }
    ]);
    expect(bindingSet.bindings.map((binding) => binding.producerIdentity)).not.toEqual(
      bindingSet.bindings.map((binding) => binding.sourceProjection)
    );
    expect(bindingSet.bindings.map((binding) => binding.registrationIdentity)).not.toEqual(
      bindingSet.bindings.map((binding) => binding.producerIdentity)
    );
  });

  it("builds each required pack once only after the current mounted authority and run binding revalidate", async () => {
    const build = vi.fn(() => buildWorkspacePack());
    const { authority, revalidations } = mountedAuthority();
    const registration = contextRegistration();
    const capability = createMountedAgentContextCapability({
      authority,
      registrations: Object.freeze([registration]),
      registerBuilders: registerWorkspaceBuilder({ build })
    });

    const bindingSet = await capability.verifyForRun(verifyForRun());

    expect(build).toHaveBeenCalledTimes(1);
    expect(revalidations).toHaveLength(1);
    expect(bindingSet).toMatchObject({
      schemaVersion: "verified-context-binding-set.v1",
      workspaceId,
      mountInstanceId,
      workspaceIdentityEventId,
      policyVersion,
      runId,
      sourceHighWaterMark,
      bindings: [{
        contextPackId: "workspace-runtime-status.v1",
        version: 1,
        descriptorHash: hashAgentContextPack(workspaceDescriptor()),
        parserIdentity: "workspace-runtime-status.v1",
        producerIdentity: "runtime.workspace-status",
        contentHash: hashAgentContextPack(workspacePayload()),
        sizeBytes: serializeContextPackPayload(workspacePayload()).byteLength,
        sourceHighWaterMark,
        selectionManifestHash: hashAgentContextPack(selectionManifest()),
        policyVersion,
        provenanceRefs: ["evt_workspace_status_a"]
      }]
    });
    expect(bindingSet.contextPacks[0]?.payload).toEqual(workspacePayload());
    expect(Object.isFrozen(bindingSet)).toBe(true);
    expect(Object.isFrozen(bindingSet.bindings)).toBe(true);
    expect(hasVerifiedContextBindingSet(bindingSet)).toBe(true);
    expect(hasVerifiedContextBindingSet({ ...bindingSet })).toBe(false);
  });

  it("stops before any builder when the requested run has a switched mount or stale authority", async () => {
    const switchedBuild = vi.fn(() => buildWorkspacePack());
    const switched = createMountedAgentContextCapability({
      authority: mountedAuthority().authority,
      registrations: Object.freeze([contextRegistration()]),
      registerBuilders: registerWorkspaceBuilder({ build: switchedBuild })
    });

    await expect(switched.verifyForRun(verifyForRun({ mountInstanceId: "mount_b" })))
      .rejects.toThrow("blocked.workspace-identity-mismatch");
    expect(switchedBuild).toHaveBeenCalledTimes(0);

    const staleBuild = vi.fn(() => buildWorkspacePack());
    const stale = createMountedAgentContextCapability({
      authority: mountedAuthority({
        result: Object.freeze({
          schemaVersion: "mounted-runtime-authority-reverification.v1" as const,
          ok: false as const,
          category: "stale-authority" as const
        })
      }).authority,
      registrations: Object.freeze([contextRegistration()]),
      registerBuilders: registerWorkspaceBuilder({ build: staleBuild })
    });

    await expect(stale.verifyForRun(verifyForRun()))
      .rejects.toThrow("blocked.mounted-authority-unavailable");
    expect(staleBuild).toHaveBeenCalledTimes(0);
  });

  it("rejects stale factory registrations before resolution and every swapped resolved binding", async () => {
    const wrongDescriptor = workspaceDescriptor({
      contextPackId: "workspace-runtime-status.v2",
      version: 2
    });
    expect(() => createMountedAgentContextCapability({
      authority: mountedAuthority().authority,
      registrations: Object.freeze([contextRegistration()]),
      registerBuilders: registerWorkspaceBuilder({ descriptor: wrongDescriptor })
    })).toThrow("blocked.context-registration-mismatch");

    const producerSwap = contextRegistration({ producerIdentity: "runtime.other-status" });
    expect(createMountedAgentContextCapability({
      authority: mountedAuthority().authority,
      registrations: Object.freeze([producerSwap]),
      registerBuilders: registerWorkspaceBuilder()
    })).toMatchObject({ workspaceId, mountInstanceId });

    const cases = [
      {
        label: "swapped parser",
        registration: contextRegistration({ parserIdentity: "other-parser.v1" }),
        expectedCategory: "context-pack-parser-authority-mismatch"
      },
      {
        label: "swapped payload hash",
        registration: contextRegistration(),
        build: () => buildWorkspacePack({ payload: workspacePayload({ runtime: "changed" }) }),
        expectedCategory: "context-pack-content-mismatch"
      },
      {
        label: "swapped source high-water",
        registration: contextRegistration(),
        build: () => buildWorkspacePack({ projectionHighWaterMark: sourceHighWaterMark + 1 }),
        expectedCategory: "context-pack-source-high-water-mismatch"
      },
      {
        label: "swapped selection manifest",
        registration: contextRegistration({
          payload: workspacePayload({ selectionManifest: selectionManifest({ selection: ["other"] }) }),
          selectionManifestHash: hashAgentContextPack(selectionManifest())
        }),
        build: () => buildWorkspacePack({
          payload: workspacePayload({ selectionManifest: selectionManifest({ selection: ["other"] }) })
        }),
        expectedCategory: "context-pack-selection-manifest-mismatch"
      },
      {
        label: "swapped workspace scope",
        registration: contextRegistration({
          payload: workspacePayload()
        }),
        build: () => buildWorkspacePack({ scope: { kind: "workspace", id: "workspace_b" } }),
        expectedCategory: "workspace-identity-mismatch"
      },
      {
        label: "swapped policy",
        registration: contextRegistration(),
        build: () => buildWorkspacePack({ policyVersion: "resident-policy.v2" }),
        expectedCategory: "context-pack-policy-mismatch"
      },
      {
        label: "swapped provenance",
        registration: contextRegistration(),
        build: () => buildWorkspacePack({ provenanceRefs: ["evt_workspace_status_b"] }),
        expectedCategory: "context-pack-provenance-mismatch"
      }
    ] as const;

    for (const candidate of cases) {
      const build = vi.fn(candidate.build ?? (() => buildWorkspacePack()));
      const capability = createMountedAgentContextCapability({
        authority: mountedAuthority().authority,
        registrations: Object.freeze([candidate.registration]),
        registerBuilders: registerWorkspaceBuilder({ build })
      });

      await expect(capability.verifyForRun(verifyForRun()), candidate.label)
        .rejects.toThrow(`blocked.${candidate.expectedCategory}`);
      expect(build, candidate.label).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects duplicate required or mounted packs before a second builder can run", async () => {
    const duplicateRegistration = contextRegistration();
    expect(() => createMountedAgentContextCapability({
      authority: mountedAuthority().authority,
      registrations: Object.freeze([duplicateRegistration, duplicateRegistration]),
      registerBuilders: registerWorkspaceBuilder()
    })).toThrow("blocked.duplicate-context-pack-registration");

    const build = vi.fn(() => buildWorkspacePack());
    const capability = createMountedAgentContextCapability({
      authority: mountedAuthority().authority,
      registrations: Object.freeze([contextRegistration()]),
      registerBuilders: registerWorkspaceBuilder({ build })
    });

    await expect(capability.verifyForRun(verifyForRun({
      requiredContextPackIds: ["workspace-runtime-status.v1", "workspace-runtime-status.v1"]
    }))).rejects.toThrow("blocked.duplicate-context-pack-requirement");
    expect(build).toHaveBeenCalledTimes(0);
  });

  it("normalizes plain own-data inputs before field or array use and rejects hostile shapes without builder activity", async () => {
    const build = vi.fn(() => buildWorkspacePack());
    const capability = createMountedAgentContextCapability({
      authority: mountedAuthority().authority,
      registrations: Object.freeze([contextRegistration()]),
      registerBuilders: registerWorkspaceBuilder({ build })
    });

    let getterInvoked = false;
    const accessorRequest = verifyForRun() as Record<string, unknown>;
    Object.defineProperty(accessorRequest, "workspaceId", {
      enumerable: true,
      get: () => {
        getterInvoked = true;
        return workspaceId;
      }
    });

    const sparse = ["workspace-runtime-status.v1"] as string[];
    sparse.length = 2;
    const customArray = ["workspace-runtime-status.v1"] as string[];
    Object.setPrototypeOf(customArray, Object.create(Array.prototype));
    const extraArrayProperty = ["workspace-runtime-status.v1"] as string[] & { extra?: string };
    Object.defineProperty(extraArrayProperty, "extra", { value: "forbidden", enumerable: true });
    const symbolRequest = verifyForRun() as Record<PropertyKey, unknown>;
    symbolRequest[Symbol("forbidden")] = true;
    const nonEnumerableRequest = verifyForRun() as Record<string, unknown>;
    Object.defineProperty(nonEnumerableRequest, "hidden", { value: true, enumerable: false });
    const customObject = Object.assign(Object.create({}), verifyForRun());

    const malformed = [
      accessorRequest,
      verifyForRun({ requiredContextPackIds: sparse }),
      verifyForRun({ requiredContextPackIds: customArray }),
      verifyForRun({ requiredContextPackIds: extraArrayProperty }),
      symbolRequest,
      nonEnumerableRequest,
      customObject
    ];
    for (const request of malformed) {
      await expect(capability.verifyForRun(request as never)).rejects.toThrow("blocked.invalid-verify-mounted-context-for-run");
    }
    expect(getterInvoked).toBe(false);
    expect(build).toHaveBeenCalledTimes(0);

    let registrationGetterInvoked = false;
    const accessorRegistration = { ...contextRegistration() } as Record<string, unknown>;
    Object.defineProperty(accessorRegistration, "contextPackId", {
      enumerable: true,
      get: () => {
        registrationGetterInvoked = true;
        return "workspace-runtime-status.v1";
      }
    });
    expect(() => createMountedAgentContextCapability({
      authority: mountedAuthority().authority,
      registrations: Object.freeze([accessorRegistration as never]),
      registerBuilders: registerWorkspaceBuilder()
    })).toThrow("blocked.invalid-context-registration");
    expect(registrationGetterInvoked).toBe(false);
  });
});

function mountedAuthority(options: {
  readonly result?: unknown;
  readonly sourceHighWaterMark?: number;
} = {}): {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly revalidations: readonly unknown[];
} {
  const revalidations: unknown[] = [];
  const authority: MountedWorkspaceRuntimeAuthority = Object.freeze({
    authorityVersion: "mounted-workspace-runtime-authority.v1",
    workspaceId,
    mountInstanceId,
    workspaceIdentityEventId,
    policyVersion,
    sourceHighWaterMark: options.sourceHighWaterMark ?? sourceHighWaterMark,
    reverify: async (input) => {
      revalidations.push(input);
      return options.result ?? Object.freeze({
        schemaVersion: "mounted-runtime-authority-reverification.v1" as const,
        ok: true as const,
        workspaceId,
        mountInstanceId,
        workspaceIdentityEventId,
        policyVersion,
        sourceHighWaterMark: options.sourceHighWaterMark ?? sourceHighWaterMark,
        runId: input.runId
      });
    }
  });
  return Object.freeze({ authority, revalidations });
}

function verifyForRun(overrides: Partial<{
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workspaceIdentityEventId: string;
  readonly policyVersion: string;
  readonly sourceHighWaterMark: number;
  readonly runId: string;
  readonly requiredContextPackIds: readonly string[];
}> = {}) {
  return {
    schemaVersion: "verify-mounted-context-for-run.v1" as const,
    workspaceId: overrides.workspaceId ?? workspaceId,
    mountInstanceId: overrides.mountInstanceId ?? mountInstanceId,
    workspaceIdentityEventId: overrides.workspaceIdentityEventId ?? workspaceIdentityEventId,
    policyVersion: overrides.policyVersion ?? policyVersion,
    sourceHighWaterMark: overrides.sourceHighWaterMark ?? sourceHighWaterMark,
    runId: overrides.runId ?? runId,
    requiredContextPackIds: overrides.requiredContextPackIds ?? ["workspace-runtime-status.v1"]
  };
}

function familyRegistration(input: {
  readonly descriptor: ContextPackDescriptor;
  readonly resolved: { readonly ref: { readonly scope?: { readonly kind: string; readonly id: string }; readonly projectionHighWaterMark?: number; readonly policyVersion?: string; readonly provenanceRefs: readonly string[]; readonly contentHash: string; readonly sizeBytes: number }; readonly payload: AgentContextPackJsonValue };
  readonly parserIdentity: string;
  readonly producerIdentity: string;
  readonly registrationIdentity: string;
  readonly selectionProof: unknown;
}): ContextRegistrationBinding {
  if (input.resolved.ref.scope === undefined || input.resolved.ref.projectionHighWaterMark === undefined || input.resolved.ref.policyVersion === undefined) {
    throw new Error("test fixture requires scoped, policy-bound, high-water context pack");
  }
  return Object.freeze({
    schemaVersion: "context-registration-binding.v1",
    workspaceId,
    contextPackId: input.descriptor.contextPackId,
    version: input.descriptor.version,
    descriptorHash: hashAgentContextPack(input.descriptor),
    parserIdentity: input.parserIdentity,
    producerIdentity: input.producerIdentity,
    registrationIdentity: input.registrationIdentity,
    sourceProjection: input.descriptor.sourceProjection,
    scope: input.resolved.ref.scope,
    sourceHighWaterMark: input.resolved.ref.projectionHighWaterMark,
    selectionProof: input.selectionProof,
    contentHash: input.resolved.ref.contentHash,
    sizeBytes: input.resolved.ref.sizeBytes,
    policyVersion: input.resolved.ref.policyVersion,
    provenanceRefs: input.resolved.ref.provenanceRefs
  });
}

function parserWithStableIdentity(
  contextPackId: string,
  parse: ContextPackPayloadParser
): ContextPackPayloadParser {
  const parser: ContextPackPayloadParser = (payload, ref) => parse(payload, ref);
  Object.defineProperty(parser, "cestusContextPackParserId", {
    value: contextPackId,
    enumerable: false,
    writable: false,
    configurable: false
  });
  registerContextPackPayloadParserAuthority(parser);
  return parser;
}

function buildOperationalPack() {
  return buildWorkspaceRuntimeStatusContextPack({
    generatedAt: now,
    policyVersion,
    scope: { kind: "workspace", id: workspaceId },
    projectionHighWaterMark: 42,
    sizeBudgetBytes: 16_384,
    runtimeSource: {
      runtimeHighWaterMark: 42,
      workspaceMounted: true,
      workspaceId,
      storageStrategy: "repo-local",
      bindPosture: "loopback",
      authPosture: "local-disabled",
      providerStates: [],
      diagnostics: [],
      projectionHighWaterMarks: {},
      omissionCodes: []
    }
  });
}

function prrDescriptor(): ContextPackDescriptor {
  return Object.freeze({
    contextPackId: "prr-read-model.v1",
    version: 1,
    label: "Selected request PRR read model",
    maxBytes: 32_768,
    requiredProvenanceKinds: ["event-id", "content-hash"],
    redactionPolicy: "safe-normalized-summary",
    sourceProjection: "prr.projection.selected-request"
  });
}

function buildSelectedPrrPack() {
  const bodyHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
  const evidenceHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
  return buildPrrReadModelContextPack({
    generatedAt: now,
    policyVersion,
    scope: { kind: "prr-request", id: "prr_req_selected" },
    request: {
      prrRequestId: "prr_req_selected",
      status: "sent",
      agencyName: "Selected Agency",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Selected Agency", email: "foia@example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Safe request summary for selected records.",
      latestOutboundCorrespondence: {
        correspondenceId: "corr_selected_followup",
        provider: "gmail",
        providerMessageId: "msg_selected",
        subject: "Selected PRR follow-up",
        occurredAt: now,
        bodyHash,
        evidenceIds: ["ev_selected_attachment"],
        attachmentEvidenceIds: ["ev_selected_attachment"],
        approvedBy: "actor_investigator"
      },
      productionBatches: [],
      productionEvidenceIds: [],
      exemptions: [],
      possibleStalling: false,
      confirmedStalling: false,
      stallingSignals: []
    },
    timeline: [{
      eventId: "evt_prr_selected_created",
      type: "prr.request.created",
      occurredAt: now,
      payload: { prrRequestId: "prr_req_selected" } as never
    }],
    requestStream: {
      requestCreatedEventId: "evt_prr_selected_created",
      streamHeadEventId: "evt_prr_selected_created",
      streamHighWaterMark: 9,
      sourceEventIds: ["evt_prr_selected_created"]
    },
    projectionHighWaterMark: 77,
    workspace: { totalPrrRequestCount: 1 },
    correspondenceHashes: [{
      id: "corr_selected_followup_body",
      contentHash: bodyHash,
      sourceEventId: "evt_prr_selected_created"
    }],
    evidenceHashes: [{
      id: "ev_selected_attachment",
      contentHash: evidenceHash,
      sourceEventId: "evt_prr_selected_created"
    }],
    gates: [],
    sizeBudgetBytes: 32_768
  });
}

function investigativeDescriptor(): ContextPackDescriptor {
  return Object.freeze({
    contextPackId: "evidence-summary.v1",
    version: 1,
    label: "Evidence summary",
    maxBytes: 65_536,
    requiredProvenanceKinds: ["event-id", "content-hash", "evidence-id"],
    redactionPolicy: "provider-safe-resolved-payload",
    sourceProjection: "ingestion.evidence"
  });
}

async function buildInvestigativeEvidencePack() {
  const contentHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;
  const body: InvestigativeSelectionManifestBody = {
    manifestVersion: "investigative-selection-manifest.v1",
    scope: { kind: "workspace", id: workspaceId },
    sourceProjectionHighWaterMarks: { ingestion: 42, graph: 41 },
    ordering: "ref-kind-ref-id-content-hash-v1",
    window: {
      cursor: "cursor_workspace_001",
      offset: 0,
      limit: 1,
      stableSort: "ref-kind-ref-id-content-hash-v1"
    },
    totalEligibleCount: 1,
    includedRefs: [{
      refKind: "evidence",
      refId: "ev_context_001",
      sortKey: `evidence/ev_context_001/${contentHash}`,
      contentHash,
      sourceEventIds: ["evt_evidence_ingested_001"],
      mandatory: true
    }],
    aggregateOmissions: []
  };
  const manifest = Object.freeze({ ...body, manifestHash: buildSelectionManifestHash(body) });
  const evidence: InvestigativeEvidenceRow = {
    evidenceId: "ev_context_001",
    ingestionEventId: "evt_evidence_ingested_001",
    contentHash,
    occurrenceIds: [],
    parseJobs: [],
    governanceTags: []
  };
  const deps: InvestigativeContextPackDependencies = {
    selection: {
      capabilityVersion: "investigative-selection.v1",
      select: async () => manifest
    },
    evidenceReader: {
      readEvidenceByIds: async () => [evidence]
    },
    graphReader: { readAcceptedGraphByIds: async () => { throw new Error("unused graph reader"); } },
    governanceReader: { readActiveRestrictionsByIds: async () => { throw new Error("unused governance reader"); } },
    agentLockReader: { readActiveLocksByIds: async () => { throw new Error("unused lock reader"); } },
    eventReader: { readEventsByIds: async () => { throw new Error("unused event reader"); } },
    evidenceSourcePosture: {
      postureVersion: "ingestion-current-source-posture.v1",
      checkEvidence: async () => Object.freeze({
        ok: true as const,
        stalenessInputs: [{ kind: "source-byte-current-hash", ref: evidence.evidenceId, value: evidence.contentHash }]
      })
    },
    now: () => now,
    policyVersion,
    ontologyCoreVersion: "ontology.v1",
    packVersions: { ingestion: "ingestion.v1" },
    registrationIdentity: investigativeRegistrationIdentity
  };
  return buildEvidenceSummaryContextPack({
    deps,
    scope: { kind: "workspace", id: workspaceId },
    window: body.window
  });
}

function investigativeSelectionManifestHash(payload: AgentContextPackJsonValue): string {
  if (!isJsonRecord(payload) || payload.selectionManifest === undefined || !isJsonRecord(payload.selectionManifest) ||
    typeof payload.selectionManifest.manifestHash !== "string") {
    throw new Error("test fixture requires the investigative selection manifest");
  }
  return payload.selectionManifest.manifestHash;
}

function contextRegistration(options: {
  readonly descriptor?: ContextPackDescriptor;
  readonly parserIdentity?: string;
  readonly producerIdentity?: string;
  readonly payload?: AgentContextPackJsonValue;
  readonly selectionManifestHash?: string;
} = {}): ContextRegistrationBinding {
  const descriptor = options.descriptor ?? workspaceDescriptor();
  const payload = options.payload ?? workspacePayload();
  return Object.freeze({
    schemaVersion: "context-registration-binding.v1",
    workspaceId,
    contextPackId: descriptor.contextPackId,
    version: descriptor.version,
    descriptorHash: hashAgentContextPack(descriptor),
    parserIdentity: options.parserIdentity ?? "workspace-runtime-status.v1",
    producerIdentity: options.producerIdentity ?? descriptor.sourceProjection,
    registrationIdentity: "packages/local-runtime/agent-runtime-context-packs:workspace-runtime-status.v1@1",
    sourceProjection: descriptor.sourceProjection,
    scope: Object.freeze({ kind: "workspace", id: workspaceId }),
    sourceHighWaterMark,
    selectionProof: {
      kind: "selection-manifest.v1",
      manifestHash: options.selectionManifestHash ?? hashAgentContextPack(selectionManifestFromPayload(payload)),
      sourceHighWaterMark
    },
    contentHash: hashAgentContextPack(payload),
    sizeBytes: serializeContextPackPayload(payload).byteLength,
    policyVersion,
    provenanceRefs: Object.freeze(["evt_workspace_status_a"])
  });
}

function registerWorkspaceBuilder(options: {
  readonly descriptor?: ContextPackDescriptor;
  readonly parserIdentity?: string;
  readonly build?: () => ReturnType<typeof buildWorkspacePack>;
} = {}): (registry: ContextPackRegistry) => void {
  return (registry) => {
    registry.register({
      descriptor: options.descriptor ?? workspaceDescriptor(),
      parsePayload: parserWithIdentity(options.parserIdentity ?? "workspace-runtime-status.v1"),
      build: options.build ?? (() => buildWorkspacePack())
    });
  };
}

function buildWorkspacePack(overrides: Partial<{
  readonly payload: AgentContextPackJsonValue;
  readonly projectionHighWaterMark: number;
  readonly policyVersion: string;
  readonly scope: { readonly kind: string; readonly id: string };
  readonly provenanceRefs: readonly string[];
}> = {}) {
  return buildResolvedContextPack({
    contextPackId: "workspace-runtime-status.v1",
    version: 1,
    generatedAt: now,
    payload: overrides.payload ?? workspacePayload(),
    safeSummary: "Workspace runtime is ready.",
    provenanceRefs: overrides.provenanceRefs ?? ["evt_workspace_status_a"],
    projectionHighWaterMark: overrides.projectionHighWaterMark ?? sourceHighWaterMark,
    policyVersion: overrides.policyVersion ?? policyVersion,
    scope: overrides.scope ?? { kind: "workspace", id: workspaceId }
  });
}

function workspaceDescriptor(overrides: Partial<ContextPackDescriptor> = {}): ContextPackDescriptor {
  return Object.freeze({
    contextPackId: overrides.contextPackId ?? "workspace-runtime-status.v1",
    version: overrides.version ?? 1,
    label: overrides.label ?? "Workspace runtime status",
    maxBytes: overrides.maxBytes ?? 16_384,
    requiredProvenanceKinds: overrides.requiredProvenanceKinds ?? ["event-id"],
    redactionPolicy: overrides.redactionPolicy ?? "safe-summary",
    sourceProjection: overrides.sourceProjection ?? "runtime.workspace-status"
  });
}

function workspacePayload(overrides: Partial<{
  readonly runtime: string;
  readonly selectionManifest: AgentContextPackJsonValue;
}> = {}): AgentContextPackJsonValue {
  return Object.freeze({
    runtime: overrides.runtime ?? "ready",
    selectionManifest: overrides.selectionManifest ?? selectionManifest()
  });
}

function selectionManifest(overrides: Partial<{
  readonly scope: { readonly kind: string; readonly id: string };
  readonly sourceHighWaterMark: number;
  readonly selection: readonly string[];
}> = {}): AgentContextPackJsonValue {
  return Object.freeze({
    schemaVersion: "mounted-selection-manifest.v1",
    scope: Object.freeze(overrides.scope ?? { kind: "workspace", id: workspaceId }),
    sourceHighWaterMark: overrides.sourceHighWaterMark ?? sourceHighWaterMark,
    selection: Object.freeze(overrides.selection ?? ["runtime"])
  });
}

function selectionManifestFromPayload(payload: AgentContextPackJsonValue): AgentContextPackJsonValue {
  if (!isJsonRecord(payload) || payload.selectionManifest === undefined) {
    throw new Error("test fixture requires selection manifest");
  }
  return payload.selectionManifest;
}

function parserWithIdentity(contextPackId: string): ContextPackPayloadParser {
  const parser: ContextPackPayloadParser = (payload): AgentContextPackJsonValue => {
    if (!isJsonRecord(payload) || payload.runtime !== "ready" && payload.runtime !== "changed") {
      throw new Error("workspace runtime status payload is invalid");
    }
    return payload;
  };
  Object.defineProperty(parser, "cestusContextPackParserId", {
    value: contextPackId,
    enumerable: false,
    writable: false,
    configurable: false
  });
  registerContextPackPayloadParserAuthority(parser);
  return parser;
}

function isJsonRecord(
  value: AgentContextPackJsonValue
): value is { readonly [key: string]: AgentContextPackJsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
