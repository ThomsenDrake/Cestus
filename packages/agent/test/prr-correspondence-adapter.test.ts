import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  ActorRef,
  AppendableKnowledgeEvent,
  KnowledgeEvent,
  KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import type {
  AdapterCapabilities,
  ApprovedMessageInput,
  CorrespondenceAdapter,
  SentMessageResult,
  SyncResult
} from "../../prr/src/correspondence-adapter.js";
import { PrrCorrespondenceService } from "../../prr/src/correspondence-service.js";
import { PrrLifecycleService } from "../../prr/src/lifecycle.js";
import {
  buildPrrCorrespondenceApprovalPreview,
  createPrrFollowUpExecutionAdapter,
  createPrrInitialSendExecutionAdapter,
  prrCorrespondenceDescriptors,
  prrFollowUpExecuteDescriptor,
  prrInitialSendExecuteDescriptor,
  rebuildPrrCorrespondenceCurrentPreview,
  type PrrCorrespondenceAdapterContext,
  type PrrCorrespondenceCurrentMessage
} from "../src/adapters/prr-correspondence.js";
import {
  createAgentDomainExecutionDispatcher,
  createAgentToolGateway,
  hashAgentToolPreview,
  type AgentApprovedToolExecutionInput
} from "../src/index.js";

const bodyHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const renderedBodyHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const subjectHash = hashText("Public records request");
const attachmentHash = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;
const capabilityRef = "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;
const domainActor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
const agentActor = { id: "actor_prr_agent", kind: "agent" as const, label: "PRR agent" };
const schedulerActor = { id: "actor_scheduler", kind: "system" as const, label: "Scheduler" };

function previewInput() {
  return {
    toolRequestId: "toolreq_prr_send_001",
    toolId: "prr.initial-send.execute",
    toolVersion: "0.1.0",
    runId: "run_prr_send_001",
    taskId: "task_prr_send_001",
    residentAgentId: "agent_resident_001",
    prrRequestId: "prr_req_001",
    correspondenceId: "corr_prr_send_001",
    provider: "gmail" as const,
    messageSourceEventId: "evt_prr_created_001",
    message: {
      from: "investigator@example.org",
      to: ["foia@example.gov"],
      cc: ["records@example.gov"],
      subject: "Public records request",
      subjectHash,
      bodyHash,
      renderedBodyHash,
      attachments: [{
        evidenceId: "ev_attachment_001",
        evidenceEventId: "evt_attachment_001",
        filename: "request-exhibit.pdf",
        contentHash: attachmentHash
      }],
      requiresLegalConfirmation: false,
      providerIdempotencyKey: "send_prr_req_001_corr_prr_send_001"
    },
    requestState: {
      requestCreatedEventId: "evt_prr_created_001",
      status: "draft" as const,
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      activeDeadline: {
        eventId: "evt_prr_deadline_001",
        deadlineDate: "2026-08-01",
        source: "estimated" as const,
        citedRules: [{
          jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
          label: "FOIA determination deadline",
          citation: "5 U.S.C. 552(a)(6)(A)(i)"
        }]
      },
      confirmedStalling: false
    },
    providerCapability: {
      provider: "gmail" as const,
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      capabilityRef
    },
    legalGateChecks: [{
      id: "legal-confirmation-not-required",
      ready: true,
      locked: false,
      detail: "Routine correspondence does not require legal escalation confirmation."
    }],
    legalEvidenceBindings: [],
    lockSnapshot: [],
    projectionHighWaterMark: 3
  };
}

describe("resident-agent PRR correspondence adapters", () => {
  it("publishes only canonical initial-send and follow-up descriptors", () => {
    expect(prrCorrespondenceDescriptors).toEqual([
      prrInitialSendExecuteDescriptor,
      prrFollowUpExecuteDescriptor
    ]);
    expect(prrInitialSendExecuteDescriptor).toMatchObject({
      toolId: "prr.initial-send.execute",
      toolVersion: "0.1.0",
      family: "prr-correspondence",
      sideEffectClass: "external-message-send",
      requiredApprovalClass: "external-message-send",
      targetDomainService: "PrrCorrespondenceService.sendInitialRequest"
    });
    expect(prrFollowUpExecuteDescriptor).toMatchObject({
      toolId: "prr.follow-up.execute",
      toolVersion: "0.1.0",
      family: "prr-correspondence",
      sideEffectClass: "external-message-send",
      requiredApprovalClass: "external-message-send",
      targetDomainService: "PrrCorrespondenceService.sendFollowUp"
    });
    for (const descriptor of prrCorrespondenceDescriptors) {
      expect(descriptor.forbiddenEffects).toEqual(expect.arrayContaining([
        "direct-prr-send-event-append",
        "live-provider-substitution",
        "self-confirmed-legal-escalation",
        "raw-message-lifecycle-evidence",
        "unsafe-provider-diagnostics"
      ]));
    }
  });

  it("builds a consequence-first preview without raw message or provider material", () => {
    const preview = buildPrrCorrespondenceApprovalPreview(previewInput());

    expect(preview).toMatchObject({
      toolId: "prr.initial-send.execute",
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_send_001",
      provider: "gmail",
      recipients: {
        from: "investigator@example.org",
        to: ["foia@example.gov"],
        cc: ["records@example.gov"]
      },
      subject: "Public records request",
      subjectHash,
      bodyHash,
      renderedBodyHash,
      providerIdempotencyKey: "send_prr_req_001_corr_prr_send_001",
      providerCapability: {
        provider: "gmail",
        canSend: true,
        canSync: true,
        canFetchAttachments: true,
        capabilityRef
      },
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      requestStatus: "draft",
      legalConfirmationRequired: false,
      consequence: expect.stringMatching(/send.*outside Cestus.*human approval/i)
    });
    expect(preview.attachmentBindings).toEqual([expect.objectContaining({
      evidenceId: "ev_attachment_001",
      evidenceEventId: "evt_attachment_001",
      contentHash: attachmentHash
    })]);
    expect(preview.artifactHashes).toEqual([bodyHash, renderedBodyHash, attachmentHash]);
    expect(preview.relatedEventIds).toEqual([
      "evt_attachment_001",
      "evt_prr_created_001",
      "evt_prr_deadline_001"
    ]);
    expect(preview.idempotencyKey).toBe("send_prr_req_001_corr_prr_send_001");
    const serialized = JSON.stringify(preview);
    expect(serialized).not.toMatch(/"renderedBody"|messageBody|rawMetadata|credentialMode|providerError/i);
  });

  it("rejects forged metadata and hostile preview DTOs without invoking getters", () => {
    const valid = previewInput();
    expect(() => buildPrrCorrespondenceApprovalPreview({ ...valid, toolId: "prr.send.direct" } as never))
      .toThrow(/canonical PRR correspondence descriptor/i);
    expect(() => buildPrrCorrespondenceApprovalPreview({ ...valid, toolVersion: "9.9.9" } as never))
      .toThrow(/canonical PRR correspondence descriptor/i);
    expect(() => buildPrrCorrespondenceApprovalPreview({
      ...valid,
      message: { ...valid.message, providerIdempotencyKey: "send_swapped" }
    } as never)).toThrow(/idempotency/i);
    expect(() => buildPrrCorrespondenceApprovalPreview({
      ...valid,
      providerCapability: { ...valid.providerCapability, provider: "imap-smtp" }
    } as never)).toThrow(/provider capability/i);
    expect(() => buildPrrCorrespondenceApprovalPreview({ ...valid, renderedBody: "forbidden" } as never))
      .toThrow(/unsupported/i);

    let getterCalls = 0;
    const hostile = { ...valid } as Record<PropertyKey, unknown>;
    Object.defineProperty(hostile, "shadow", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("unsafe PRR getter");
      }
    });
    Object.defineProperty(hostile, Symbol("shadow"), {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("unsafe PRR symbol getter");
      }
    });
    expect(() => buildPrrCorrespondenceApprovalPreview(hostile as never))
      .toThrow(/symbol-keyed|enumerable data properties|unsupported/i);
    expect(getterCalls).toBe(0);

    const customRecipients = [...valid.message.to] as string[] & { shadow?: string };
    Object.defineProperty(customRecipients, "shadow", { enumerable: true, value: "forged" });
    expect(() => buildPrrCorrespondenceApprovalPreview({
      ...valid,
      message: { ...valid.message, to: customRecipients }
    } as never)).toThrow(/custom array fields/i);
  });

  it("rebuilds and executes initial and follow-up sends only through PrrCorrespondenceService", async () => {
    const initial = await prepareCorrespondence("initial");
    const initialCurrent = await rebuildPrrCorrespondenceCurrentPreview(rebuildInput(initial.context));
    const initialResult = await createPrrInitialSendExecutionAdapter(initial.context).executeApproved(
      executionInput(initial.context, initialCurrent)
    );
    const initialEvent = eventOfType(await initial.ledger.readAll(), "prr.request.sent");

    expect(initial.transport.lastInput).toMatchObject({
      idempotencyKey: initial.context.approvedMessage.providerIdempotencyKey,
      body: initial.current.message.renderedBody,
      to: initial.current.message.to
    });
    expect(initialResult).toMatchObject({
      eventIds: [initialEvent.id],
      artifactHashes: [],
      resultSummary: "PRR correspondence was recorded by the authoritative domain service."
    });
    expect(initialResult.readModelChanges[0]).toMatchObject({
      projectionName: "prr",
      relatedIds: expect.arrayContaining([
        initial.context.prrRequestId,
        initial.context.correspondenceId,
        initialEvent.payload.providerMessageId
      ])
    });
    expect(JSON.stringify(initialResult)).not.toMatch(/rawMetadata|accountEmail|rendered body|Please provide/i);

    const followUp = await prepareCorrespondence("follow-up");
    const beforeCalls = followUp.transport.sendCalls;
    const followCurrent = await rebuildPrrCorrespondenceCurrentPreview(rebuildInput(followUp.context));
    const followResult = await createPrrFollowUpExecutionAdapter(followUp.context).executeApproved(
      executionInput(followUp.context, followCurrent)
    );
    const followEvent = eventOfType(await followUp.ledger.readAll(), "prr.followup.sent");

    expect(followUp.transport.sendCalls).toBe(beforeCalls + 1);
    expect(followUp.transport.lastInput).toMatchObject({
      idempotencyKey: followUp.context.approvedMessage.providerIdempotencyKey,
      body: followUp.current.message.renderedBody
    });
    expect(followResult.eventIds).toEqual([followEvent.id]);
    expect(followResult.readModelChanges[0]).toMatchObject({
      projectionName: "prr-timeline",
      change: expect.stringMatching(/follow-up.*timeline/i)
    });
    expect(followResult.readModelChanges[0]?.relatedIds).not.toContain("fake_thread_forbidden");
    expect(JSON.stringify(followResult)).not.toMatch(/rawMetadata|providerThreadId|credentialMode/i);
  });

  it("fails follow-up attachments closed when the domain event cannot attest them", async () => {
    const prepared = await prepareCorrespondence("follow-up");
    const evidence = eventOfType(await prepared.ledger.readAll(), "evidence.ingested");
    const binding = {
      evidenceId: evidence.payload.evidenceId,
      evidenceEventId: evidence.id,
      filename: "request-exhibit.pdf",
      contentHash: evidence.payload.contentHash as `sha256:${string}`
    };
    const context: PrrCorrespondenceAdapterContext = {
      ...prepared.context,
      approvedMessage: {
        ...prepared.context.approvedMessage,
        attachments: [binding]
      },
      readCurrentMessage: async () => ({
        ...prepared.current.message,
        attachments: [binding]
      })
    };

    await expect(rebuildPrrCorrespondenceCurrentPreview(rebuildInput(context)))
      .rejects.toMatchObject({ category: "domain-gate-failed" });
  });

  it("rejects stale message, provider, attachment, lifecycle, and active-lock state before transport", async () => {
    const staleMessage = await prepareCorrespondence("initial");
    const approved = await rebuildPrrCorrespondenceCurrentPreview(rebuildInput(staleMessage.context));
    staleMessage.current.message = {
      ...staleMessage.current.message,
      renderedBody: `${staleMessage.current.message.renderedBody} changed`
    };
    const rebuilt = await rebuildPrrCorrespondenceCurrentPreview(rebuildInput(staleMessage.context));
    expect(rebuilt.freshnessChecks).toContainEqual(expect.objectContaining({ name: "message", ok: false }));
    await expect(createPrrInitialSendExecutionAdapter(staleMessage.context).executeApproved(
      executionInput(staleMessage.context, approved)
    )).rejects.toMatchObject({ category: "approval-stale" });
    expect(staleMessage.transport.sendCalls).toBe(0);

    const staleProvider = await prepareCorrespondence("initial");
    const providerApproved = await rebuildPrrCorrespondenceCurrentPreview(rebuildInput(staleProvider.context));
    staleProvider.current.capabilities = { ...staleProvider.current.capabilities, canSend: false };
    await expect(createPrrInitialSendExecutionAdapter(staleProvider.context).executeApproved(
      executionInput(staleProvider.context, providerApproved)
    )).rejects.toMatchObject({ category: "approval-stale" });
    expect(staleProvider.transport.sendCalls).toBe(0);

    const staleAttachment = await prepareCorrespondence("initial");
    const attachmentApproved = await rebuildPrrCorrespondenceCurrentPreview(rebuildInput(staleAttachment.context));
    await staleAttachment.ledger.append(evidenceEvent("sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"));
    await expect(createPrrInitialSendExecutionAdapter(staleAttachment.context).executeApproved(
      executionInput(staleAttachment.context, attachmentApproved)
    )).rejects.toMatchObject({ category: "approval-stale" });
    expect(staleAttachment.transport.sendCalls).toBe(0);

    const closed = await prepareCorrespondence("follow-up");
    const closedApproved = await rebuildPrrCorrespondenceCurrentPreview(rebuildInput(closed.context));
    await closed.ledger.append(requestClosedEvent(closed.created));
    await expect(createPrrFollowUpExecutionAdapter(closed.context).executeApproved(
      executionInput(closed.context, closedApproved)
    )).rejects.toMatchObject({ category: "approval-stale" });
    expect(closed.transport.sendCalls).toBe(1);

    const locked = await prepareCorrespondence("initial");
    const lockApproved = await rebuildPrrCorrespondenceCurrentPreview(rebuildInput(locked.context));
    await locked.ledger.append(agentLockEvent());
    await expect(createPrrInitialSendExecutionAdapter(locked.context).executeApproved(
      executionInput(locked.context, lockApproved)
    )).rejects.toMatchObject({ category: "lock-active" });
    expect(locked.transport.sendCalls).toBe(0);
  });

  it("never sends legal-pressure language without the separate human PRR legal gate", async () => {
    const blocked = await prepareCorrespondence("follow-up", true);
    const blockedPreview = await rebuildPrrCorrespondenceCurrentPreview(rebuildInput(blocked.context));
    expect(blockedPreview.preview).toMatchObject({
      legalConfirmationRequired: true,
      legalGateReady: false
    });
    const beforeBlockedCalls = blocked.transport.sendCalls;
    await expect(createPrrFollowUpExecutionAdapter(blocked.context).executeApproved(
      executionInput(blocked.context, blockedPreview)
    )).rejects.toMatchObject({ category: "lock-active" });
    expect(blocked.transport.sendCalls).toBe(beforeBlockedCalls);

    const allowed = await prepareCorrespondence("follow-up", true, true);
    const allowedPreview = await rebuildPrrCorrespondenceCurrentPreview(rebuildInput(allowed.context));
    expect(allowedPreview.preview).toMatchObject({
      legalGateReady: true,
      legalEvidenceBindings: [{
        evidenceId: "ev_attachment_001",
        contentHash: attachmentHash
      }]
    });
    expect(allowedPreview.inputArtifactHashes).toContain(attachmentHash);
    expect(allowedPreview.provenanceRefs).toContainEqual(expect.stringMatching(
      /^legal-evidence:ev_attachment_001:evt_[a-zA-Z0-9_-]+:sha256:d{64}$/
    ));
    const beforeAllowedCalls = allowed.transport.sendCalls;
    const result = await createPrrFollowUpExecutionAdapter(allowed.context).executeApproved(
      executionInput(allowed.context, allowedPreview)
    );
    expect(result.eventIds).toHaveLength(1);
    expect(allowed.transport.sendCalls).toBe(beforeAllowedCalls + 1);
    expect((await allowed.ledger.readAll()).filter((event) => event.type === "prr.legal-escalation.confirmed"))
      .toHaveLength(1);
  });

  it("records only secret-safe gateway completion evidence and rejects forged execution DTOs", async () => {
    const prepared = await prepareCorrespondence("initial");
    const current = await rebuildPrrCorrespondenceCurrentPreview(rebuildInput(prepared.context));
    const adapter = createPrrInitialSendExecutionAdapter(prepared.context);
    const valid = executionInput(prepared.context, current);

    await expect(adapter.executeApproved({ ...valid, inputArtifactHashes: [bodyHash] }))
      .rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({ ...valid, provenanceRefs: [prepared.context.prrRequestId] }))
      .rejects.toMatchObject({ category: "provenance-missing" });
    let getterCalls = 0;
    const hostile = { ...valid } as Record<string, unknown>;
    Object.defineProperty(hostile, "shadow", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("unsafe execution getter");
      }
    });
    await expect(adapter.executeApproved(hostile as never)).rejects.toMatchObject({ category: "permission-denied" });
    expect(getterCalls).toBe(0);

    const gateway = createAgentToolGateway({ ledger: prepared.ledger, actor: agentActor, now: fixedNow });
    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_prr_initial_001",
      residentAgentId: prepared.context.residentAgentId,
      taskId: prepared.context.taskId,
      runId: "run_prr_initial_001",
      toolId: prrInitialSendExecuteDescriptor.toolId,
      toolVersion: prrInitialSendExecuteDescriptor.toolVersion,
      sideEffectClass: prrInitialSendExecuteDescriptor.sideEffectClass,
      requiredApprovalClass: "external-message-send",
      preview: current.preview
    });
    await gateway.approveTool({
      toolRequestId: requested.payload.toolRequestId,
      approvedPreviewHash: requested.payload.previewHash,
      actor: domainActor,
      rationale: "Approve this exact PRR message and evidence-bound recipients."
    });
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger: prepared.ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: [adapter]
    });
    const wake = await dispatcher.wake();
    expect(wake).toMatchObject({ completedCount: 1, failedCount: 0 });
    const agentEvents = (await prepared.ledger.readAll()).filter((event) => event.type.startsWith("agent.tool."));
    const serialized = JSON.stringify(agentEvents);
    expect(serialized).not.toContain(prepared.current.message.body);
    expect(serialized).not.toContain(prepared.current.message.renderedBody);
    expect(serialized).not.toMatch(/rawMetadata|credentialMode|provider failure|Bearer|PROVIDER_AUTH_SETTING/i);
  });

  it("fails production construction closed without authoritative dependencies or a human actor", async () => {
    const prepared = await prepareCorrespondence("initial");
    expect(() => createPrrInitialSendExecutionAdapter({ ...prepared.context, ledger: undefined } as never))
      .toThrow(/ledger/i);
    expect(() => createPrrInitialSendExecutionAdapter({ ...prepared.context, correspondenceService: undefined } as never))
      .toThrow(/correspondence service/i);
    expect(() => createPrrInitialSendExecutionAdapter({ ...prepared.context, readCurrentMessage: undefined } as never))
      .toThrow(/current message/i);
    expect(() => createPrrInitialSendExecutionAdapter({ ...prepared.context, readProviderCapabilities: undefined } as never))
      .toThrow(/provider capabilities/i);
    expect(() => createPrrInitialSendExecutionAdapter({ ...prepared.context, domainActor: agentActor } as never))
      .toThrow(/human/i);
    for (const field of ["send", "executor", "providerSend", "appendEvent", "rawBodyResolver"]) {
      expect(() => createPrrInitialSendExecutionAdapter({ ...prepared.context, [field]: () => undefined } as never))
        .toThrow(/unsupported/i);
    }
  });
});

function hashText(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

type CorrespondenceKind = "initial" | "follow-up";

interface MutableCorrespondenceState {
  message: PrrCorrespondenceCurrentMessage;
  capabilities: AdapterCapabilities;
}

interface PreparedCorrespondence {
  ledger: InMemoryEventLedger;
  created: KnowledgeEventOf<"prr.request.created">;
  transport: RecordingCorrespondenceAdapter;
  current: MutableCorrespondenceState;
  context: PrrCorrespondenceAdapterContext;
}

async function prepareCorrespondence(
  kind: CorrespondenceKind,
  legalPressure = false,
  legalConfirmed = false
): Promise<PreparedCorrespondence> {
  const ledger = new InMemoryEventLedger();
  const lifecycle = new PrrLifecycleService({ ledger, actor: domainActor });
  const requestText = legalPressure
    ? "Please respond before we pursue legal action."
    : "Please provide the requested public records.";
  const created = await lifecycle.createRequest({
    prrRequestId: "prr_req_001",
    jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
    agency: { name: "Example Agency", email: "foia@example.gov" },
    requester: { name: "Investigator", email: "investigator@example.org" },
    requestText
  });
  const attachment = await ledger.append(evidenceEvent(attachmentHash));
  if (attachment.type !== "evidence.ingested") {
    throw new Error("Expected evidence.ingested.");
  }
  const transport = new RecordingCorrespondenceAdapter();
  const correspondenceService = new PrrCorrespondenceService({
    ledger,
    actor: domainActor,
    adapters: { gmail: transport }
  });
  let sourceEventId = created.id;
  let initialSentEventId: string | undefined;
  const subject = kind === "initial" ? "Public records request" : "Follow-up on public records request";
  const body = requestText;
  const renderedBody = kind === "initial"
    ? `Dear Records Officer,\n\n${requestText}`
    : requestText;
  if (kind === "follow-up") {
    const sent = await correspondenceService.sendInitialRequest({
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_initial_setup",
      provider: "gmail",
      from: "investigator@example.org",
      to: ["foia@example.gov"],
      subject: "Public records request",
      body: "Please provide the requested public records.",
      approvedBy: domainActor.id
    });
    initialSentEventId = sent.id;
    const drafted = await ledger.append(followUpDraftedEvent(subject, hashText(renderedBody), sent));
    if (drafted.type !== "prr.followup.drafted") {
      throw new Error("Expected prr.followup.drafted.");
    }
    sourceEventId = drafted.id;
  }
  if (legalConfirmed) {
    const deadline = await ledger.append(deadlineConfirmedEvent(created));
    const legal = await ledger.append(legalEscalationEvent(created, deadline));
    if (legal.type !== "prr.legal-escalation.confirmed") {
      throw new Error("Expected prr.legal-escalation.confirmed.");
    }
  }
  const message: PrrCorrespondenceCurrentMessage = {
    from: "investigator@example.org",
    to: ["foia@example.gov"],
    cc: [],
    subject,
    body,
    renderedBody,
    attachments: kind === "initial"
      ? [{
          evidenceId: "ev_attachment_001",
          evidenceEventId: attachment.id,
          filename: "request-exhibit.pdf",
          contentHash: attachmentHash
        }]
      : [],
    requiresLegalConfirmation: legalPressure
  };
  const capabilities: AdapterCapabilities = {
    provider: "gmail",
    canSend: true,
    canSync: true,
    canFetchAttachments: true,
    credentialMode: "cestus-oauth"
  };
  const current: MutableCorrespondenceState = { message, capabilities };
  const events = await ledger.readAll();
  const deadline = events.findLast((event) =>
    event.type === "prr.deadline.confirmed" || event.type === "prr.deadline.estimated"
  );
  const legal = events.findLast((event): event is KnowledgeEventOf<"prr.legal-escalation.confirmed"> =>
    event.type === "prr.legal-escalation.confirmed"
  );
  const approvedRequestState = {
    requestCreatedEventId: created.id,
    status: kind === "initial" ? "draft" as const : "sent" as const,
    jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
    ...(deadline === undefined
      ? {}
      : {
          activeDeadline: {
            eventId: deadline.id,
            deadlineDate: deadline.payload.deadlineDate,
            source: deadline.type === "prr.deadline.confirmed" ? "confirmed" as const : "estimated" as const,
            citedRules: deadline.payload.citedRules
          }
        }),
    confirmedStalling: false,
    ...(legal === undefined
      ? {}
      : {
          legalEscalation: {
            eventId: legal.id,
            confirmedBy: legal.payload.confirmedBy,
            rationale: legal.payload.rationale,
            citedRules: legal.payload.citedRules,
            evidenceIds: legal.payload.evidenceIds
          }
        }),
    ...(initialSentEventId === undefined ? {} : { initialSentEventId })
  };
  const correspondenceId = kind === "initial" ? "corr_prr_send_001" : "corr_prr_followup_001";
  const approvedMessage = {
    from: message.from,
    to: [...message.to],
    cc: [...message.cc],
    subject: message.subject,
    subjectHash: hashText(message.subject),
    bodyHash: hashText(message.body),
    renderedBodyHash: hashText(message.renderedBody),
    attachments: message.attachments.map((item) => ({ ...item })),
    requiresLegalConfirmation: legalPressure,
    providerIdempotencyKey: kind === "initial"
      ? `send_prr_req_001_${correspondenceId}`
      : `followup_prr_req_001_${correspondenceId}`
  };
  const context: PrrCorrespondenceAdapterContext = {
    ledger,
    correspondenceService,
    domainActor,
    residentAgentId: "agent_resident_001",
    taskId: "task_prr_correspondence_001",
    toolId: kind === "initial" ? prrInitialSendExecuteDescriptor.toolId : prrFollowUpExecuteDescriptor.toolId,
    prrRequestId: "prr_req_001",
    correspondenceId,
    provider: "gmail",
    messageSourceEventId: sourceEventId,
    approvedMessage,
    approvedRequestState,
    approvedProviderCapabilities: capabilities,
    readCurrentMessage: async () => current.message,
    readProviderCapabilities: async () => current.capabilities
  };
  return { ledger, created, transport, current, context };
}

function rebuildInput(context: PrrCorrespondenceAdapterContext) {
  return {
    ...context,
    toolRequestId: context.toolId === prrInitialSendExecuteDescriptor.toolId
      ? "toolreq_prr_initial_001"
      : "toolreq_prr_followup_001",
    toolVersion: "0.1.0",
    runId: context.toolId === prrInitialSendExecuteDescriptor.toolId
      ? "run_prr_initial_001"
      : "run_prr_followup_001"
  };
}

function executionInput(
  context: PrrCorrespondenceAdapterContext,
  current: Awaited<ReturnType<typeof rebuildPrrCorrespondenceCurrentPreview>>
): AgentApprovedToolExecutionInput {
  const previewHash = hashAgentToolPreview(current.preview);
  return {
    toolRequestId: context.toolId === prrInitialSendExecuteDescriptor.toolId
      ? "toolreq_prr_initial_001"
      : "toolreq_prr_followup_001",
    runId: context.toolId === prrInitialSendExecuteDescriptor.toolId
      ? "run_prr_initial_001"
      : "run_prr_followup_001",
    taskId: context.taskId,
    toolId: context.toolId,
    toolVersion: "0.1.0",
    sideEffectClass: "external-message-send",
    approvalClass: "external-message-send",
    previewHash,
    approvedPreviewHash: previewHash,
    approvedBy: domainActor.id,
    sourceEventIds: current.sourceEventIds,
    inputArtifactHashes: current.inputArtifactHashes,
    provenanceRefs: current.provenanceRefs
  };
}

function evidenceEvent(contentHash: `sha256:${string}`): AppendableKnowledgeEvent<"evidence.ingested"> {
  return {
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_attachment_001",
    context: {
      actor: { id: "actor_ingestion", kind: "system", label: "Ingestion" },
      occurredAt: fixedNow(),
      correlationId: "corr_ev_attachment_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_attachment_001",
      source: { kind: "file", label: "request-exhibit.pdf" },
      contentHash,
      mediaType: "application/pdf",
      sizeBytes: 100
    }
  };
}

function followUpDraftedEvent(
  subject: string,
  renderedHash: `sha256:${string}`,
  sent: KnowledgeEventOf<"prr.request.sent">
): AppendableKnowledgeEvent<"prr.followup.drafted"> {
  return {
    type: "prr.followup.drafted",
    version: 1,
    streamId: "prr_req_001",
    context: {
      actor: domainActor,
      occurredAt: fixedNow(),
      causationId: sent.id,
      correlationId: sent.context.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_followup_001",
      subject,
      bodyHash: renderedHash,
      citedRules: []
    }
  };
}

function deadlineConfirmedEvent(
  created: KnowledgeEventOf<"prr.request.created">
): AppendableKnowledgeEvent<"prr.deadline.confirmed"> {
  return {
    type: "prr.deadline.confirmed",
    version: 1,
    streamId: created.streamId,
    context: {
      actor: domainActor,
      occurredAt: fixedNow(),
      causationId: created.id,
      correlationId: created.context.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      prrRequestId: created.payload.prrRequestId,
      deadlineDate: "2026-08-01",
      confirmedBy: domainActor.id,
      rationale: "Investigator confirmed the applicable deadline.",
      citedRules: [citedRule()]
    }
  };
}

function legalEscalationEvent(
  created: KnowledgeEventOf<"prr.request.created">,
  deadline: KnowledgeEvent
): AppendableKnowledgeEvent<"prr.legal-escalation.confirmed"> {
  return {
    type: "prr.legal-escalation.confirmed",
    version: 1,
    streamId: created.streamId,
    context: {
      actor: domainActor,
      occurredAt: fixedNow(),
      causationId: deadline.id,
      correlationId: created.context.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      prrRequestId: created.payload.prrRequestId,
      confirmedBy: domainActor.id,
      rationale: "Investigator confirmed legal escalation language.",
      citedRules: [citedRule()],
      evidenceIds: ["ev_attachment_001"]
    }
  };
}

function citedRule() {
  return {
    jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
    label: "FOIA determination deadline",
    citation: "5 U.S.C. 552(a)(6)(A)(i)"
  };
}

function requestClosedEvent(
  created: KnowledgeEventOf<"prr.request.created">
): AppendableKnowledgeEvent<"prr.request.closed"> {
  return {
    type: "prr.request.closed",
    version: 1,
    streamId: created.streamId,
    context: {
      actor: domainActor,
      occurredAt: fixedNow(),
      causationId: created.id,
      correlationId: created.context.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      prrRequestId: created.payload.prrRequestId,
      closedAt: fixedNow(),
      closedBy: domainActor.id,
      reason: "fulfilled"
    }
  };
}

function agentLockEvent(): AppendableKnowledgeEvent<"agent.lock.activated"> {
  return {
    type: "agent.lock.activated",
    version: 1,
    streamId: "agent_lock_lock_prr_send",
    context: {
      actor: domainActor,
      occurredAt: fixedNow(),
      correlationId: "corr_lock_prr_send",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      lockId: "lock_prr_send",
      residentAgentId: "agent_resident_001",
      kind: "legal-escalation",
      activatedBy: domainActor.id,
      reason: "PRR correspondence review is active."
    }
  };
}

function eventOfType<Type extends KnowledgeEvent["type"]>(
  events: readonly KnowledgeEvent[],
  type: Type
): Extract<KnowledgeEvent, { readonly type: Type }> {
  const event = events.find((candidate): candidate is Extract<KnowledgeEvent, { readonly type: Type }> =>
    candidate.type === type
  );
  if (event === undefined) {
    throw new Error(`Expected ${type} event.`);
  }
  return event;
}

class RecordingCorrespondenceAdapter implements CorrespondenceAdapter {
  lastInput?: ApprovedMessageInput;
  sendCalls = 0;

  async capabilities(): Promise<AdapterCapabilities> {
    return {
      provider: "gmail",
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode: "cestus-oauth"
    };
  }

  async sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult> {
    this.sendCalls += 1;
    this.lastInput = structuredClone(input);
    return {
      provider: "gmail",
      providerMessageId: `fake_msg_${input.idempotencyKey}`,
      providerThreadId: "fake_thread_forbidden",
      sentAt: fixedNow(),
      rawMetadata: { accountEmail: "investigator@example.org" }
    };
  }

  async syncSince(): Promise<SyncResult> {
    return { checkpoint: "unused", messages: [] };
  }
}

function fixedNow(): string {
  return "2026-07-09T22:00:00.000Z";
}

void (domainActor satisfies ActorRef);
