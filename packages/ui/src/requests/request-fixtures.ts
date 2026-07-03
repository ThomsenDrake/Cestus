import type { PrrWorkspaceFixture } from "./request-types.js";

const federalFoia = "US Federal FOIA";
const floridaPublicRecords = "Florida Public Records";

const incompleteEscalationGate = Object.freeze([
  Object.freeze({ id: "basis", label: "Deadline or stalling basis", complete: false, detail: "No escalation basis confirmed." }),
  Object.freeze({ id: "citation", label: "Cited rule", complete: false, detail: "No jurisdiction guidance selected." }),
  Object.freeze({ id: "evidence", label: "Correspondence evidence", complete: false, detail: "No correspondence evidence linked." }),
  Object.freeze({ id: "confirmation", label: "User confirmation", complete: false, detail: "Not confirmed." })
]);

export const prrWorkspaceFixture = Object.freeze({
  savedViews: Object.freeze([
    Object.freeze({
      id: "all-active",
      label: "All active",
      mode: "board",
      grouping: "agency",
      filters: Object.freeze({})
    }),
    Object.freeze({
      id: "overdue",
      label: "Overdue",
      mode: "board",
      grouping: "agency",
      filters: Object.freeze({
        laneIds: Object.freeze(["needs-follow-up", "appeal-escalation"] as const),
        minSeverity: "high"
      })
    }),
    Object.freeze({
      id: "florida-fees",
      label: "Florida fees",
      mode: "board",
      grouping: "agency",
      filters: Object.freeze({
        jurisdiction: floridaPublicRecords,
        laneIds: Object.freeze(["review-fee-scope"] as const)
      })
    }),
    Object.freeze({
      id: "productions-arrived",
      label: "Productions arrived",
      mode: "signal-map",
      grouping: "agency",
      filters: Object.freeze({
        laneIds: Object.freeze(["production-arrived"] as const)
      })
    })
  ]),
  cards: Object.freeze([
    Object.freeze({
      id: "card_prr_req_001",
      prrRequestId: "prr_req_001",
      title: "FAA vendor contracts",
      agencyId: "agency_faa",
      agencyName: "Federal Aviation Administration",
      jurisdictionId: "us-foia",
      jurisdictionLabel: federalFoia,
      investigationId: "inv_airport_procurement",
      investigationLabel: "Airport procurement",
      laneId: "ready-to-send",
      severity: "high",
      deadlineLabel: "Est. Jul 30",
      deadlineSource: "estimated",
      providerLabel: "Gmail ready",
      stallingState: "No stalling",
      feeSignal: "No fee issue",
      productionCount: 0,
      diagnosticCount: 0,
      ownerLabel: "Local",
      nextActionLabel: "Review to send"
    }),
    Object.freeze({
      id: "card_prr_req_airport_022",
      prrRequestId: "prr_req_airport_022",
      title: "Airport authority delay messages",
      agencyId: "agency_mia",
      agencyName: "Miami-Dade Aviation Department",
      jurisdictionId: "florida-public-records",
      jurisdictionLabel: floridaPublicRecords,
      investigationId: "inv_airport_procurement",
      investigationLabel: "Airport procurement",
      laneId: "needs-follow-up",
      severity: "critical",
      deadlineLabel: "Confirmed Jul 19",
      deadlineSource: "confirmed",
      providerLabel: "Himalaya synced",
      stallingState: "Possible stalling",
      feeSignal: "Scope pressure",
      productionCount: 0,
      diagnosticCount: 1,
      ownerLabel: "Local",
      nextActionLabel: "Draft follow-up"
    }),
    Object.freeze({
      id: "card_prr_req_sheriff_045",
      prrRequestId: "prr_req_sheriff_045",
      title: "Sheriff body-camera vendor logs",
      agencyId: "agency_sheriff",
      agencyName: "Broward Sheriff's Office",
      jurisdictionId: "florida-public-records",
      jurisdictionLabel: floridaPublicRecords,
      investigationId: "inv_vendor_oversight",
      investigationLabel: "Vendor oversight",
      laneId: "review-fee-scope",
      severity: "high",
      deadlineLabel: "No fixed deadline",
      deadlineSource: "none",
      providerLabel: "IMAP match",
      stallingState: "Fee pressure",
      feeSignal: "$4,500 estimate",
      productionCount: 0,
      diagnosticCount: 0,
      ownerLabel: "Local",
      nextActionLabel: "Challenge fee"
    }),
    Object.freeze({
      id: "card_prr_req_production_018",
      prrRequestId: "prr_req_production_018",
      title: "City procurement email production",
      agencyId: "agency_city",
      agencyName: "City Procurement Office",
      jurisdictionId: "florida-public-records",
      jurisdictionLabel: floridaPublicRecords,
      investigationId: "inv_vendor_oversight",
      investigationLabel: "Vendor oversight",
      laneId: "production-arrived",
      severity: "medium",
      deadlineLabel: "Produced Jul 02",
      deadlineSource: "confirmed",
      providerLabel: "Gmail synced",
      stallingState: "Production received",
      feeSignal: "No fee issue",
      productionCount: 3,
      diagnosticCount: 0,
      ownerLabel: "Local",
      nextActionLabel: "Classify evidence"
    }),
    Object.freeze({
      id: "card_prr_req_transit_031",
      prrRequestId: "prr_req_transit_031",
      title: "Transit authority denial appeal",
      agencyId: "agency_transit",
      agencyName: "Regional Transit Authority",
      jurisdictionId: "us-foia",
      jurisdictionLabel: federalFoia,
      investigationId: "inv_transit_contracts",
      investigationLabel: "Transit contracts",
      laneId: "appeal-escalation",
      severity: "critical",
      deadlineLabel: "Confirmed Jun 24",
      deadlineSource: "confirmed",
      providerLabel: "Gmail synced",
      stallingState: "Confirmed stalling",
      feeSignal: "Appeal clock",
      productionCount: 0,
      diagnosticCount: 0,
      ownerLabel: "Local",
      nextActionLabel: "Confirm escalation basis"
    })
  ]),
  requestDetails: Object.freeze([
    Object.freeze({
      prrRequestId: "prr_req_001",
      title: "FAA vendor contracts",
      agencyName: "Federal Aviation Administration",
      nextAction: Object.freeze({
        label: "Review to send",
        summary: "Draft, recipients, and citation are ready for human review.",
        risk: "amber",
        primaryActionLabel: "Review to send",
        requiredHumanDecision: "Confirm draft body and recipients before arming send.",
        explanation: Object.freeze([
          "Suggested from the Federal FOIA starter pack.",
          "Recipient matches the last FAA request you sent.",
          "No legal escalation language is present."
        ])
      }),
      sendGate: Object.freeze([
        Object.freeze({ id: "draft", label: "Draft body", complete: true, detail: "Template rendered." }),
        Object.freeze({ id: "recipients", label: "Recipients", complete: true, detail: "FOIA inbox verified." }),
        Object.freeze({ id: "citations", label: "Citations", complete: true, detail: "5 U.S.C. 552 clause attached." }),
        Object.freeze({ id: "attachments", label: "Attachments", complete: true, detail: "No attachments required." }),
        Object.freeze({ id: "risk", label: "Risk flags", complete: false, detail: "Human review required." })
      ]),
      escalationGate: incompleteEscalationGate,
      deadlinePosture: "Estimated Jul 30 from Federal FOIA 20-working-day guidance.",
      correspondence: Object.freeze({
        provider: "gmail",
        syncState: "Ready to send",
        latestInbound: "No inbound message yet.",
        latestOutbound: "Draft prepared from Federal FOIA template."
      }),
      evidencePackets: Object.freeze([]),
      diagnostics: Object.freeze([]),
      timeline: Object.freeze(["prr.request.created", "prr.deadline.estimated", "prr.followup.drafted"])
    }),
    Object.freeze({
      prrRequestId: "prr_req_airport_022",
      title: "Airport authority delay messages",
      agencyName: "Miami-Dade Aviation Department",
      nextAction: Object.freeze({
        label: "Draft follow-up",
        summary: "The confirmed deadline passed and the correspondence thread needs a narrow follow-up.",
        risk: "red",
        primaryActionLabel: "Draft follow-up",
        requiredHumanDecision: "Confirm the delay basis before sending any escalation-adjacent language.",
        explanation: Object.freeze([
          "Confirmed deadline has passed.",
          "Himalaya sync found repeated delay language.",
          "Projection diagnostic requires review before escalation."
        ])
      }),
      sendGate: Object.freeze([
        Object.freeze({ id: "draft", label: "Draft body", complete: false, detail: "Follow-up language needs review." }),
        Object.freeze({ id: "recipients", label: "Recipients", complete: true, detail: "Records inbox matched." }),
        Object.freeze({ id: "citations", label: "Citations", complete: true, detail: "Florida Public Records clause attached." }),
        Object.freeze({ id: "attachments", label: "Attachments", complete: true, detail: "Original request linked." }),
        Object.freeze({ id: "risk", label: "Risk flags", complete: false, detail: "Diagnostic review required." })
      ]),
      escalationGate: Object.freeze([
        Object.freeze({ id: "basis", label: "Deadline or stalling basis", complete: true, detail: "Deadline passed." }),
        Object.freeze({ id: "citation", label: "Cited rule", complete: true, detail: "Florida guidance attached." }),
        Object.freeze({ id: "evidence", label: "Correspondence evidence", complete: false, detail: "Thread needs review." }),
        Object.freeze({ id: "confirmation", label: "User confirmation", complete: false, detail: "Not confirmed." })
      ]),
      deadlinePosture: "Confirmed deadline passed on Jul 19; possible stalling remains a human-review signal.",
      correspondence: Object.freeze({
        provider: "himalaya",
        syncState: "Thread synced with diagnostic",
        latestInbound: "Agency requested another delay without a new date.",
        latestOutbound: "Original request acknowledged."
      }),
      evidencePackets: Object.freeze([
        Object.freeze({
          evidenceId: "ev_prr_delay_022",
          title: "Airport delay correspondence",
          sourceArtifact: "himalaya:thread/prr_req_airport_022",
          fileCount: 2,
          hashState: "sha256 verified",
          extractionState: "Queued for timeline extraction",
          classificationState: "Needs review"
        })
      ]),
      diagnostics: Object.freeze(["Projection lag detected for accepted request event."]),
      timeline: Object.freeze(["prr.request.created", "prr.deadline.confirmed", "prr.followup.recommended"])
    }),
    Object.freeze({
      prrRequestId: "prr_req_sheriff_045",
      title: "Sheriff body-camera vendor logs",
      agencyName: "Broward Sheriff's Office",
      nextAction: Object.freeze({
        label: "Challenge fee",
        summary: "The estimate is high enough to require fee/scope review before any reply.",
        risk: "amber",
        primaryActionLabel: "Review fee scope",
        requiredHumanDecision: "Decide whether to narrow scope, challenge cost basis, or accept the estimate.",
        explanation: Object.freeze([
          "Fee estimate exceeds the local review threshold.",
          "Request scope references body-camera vendor logs.",
          "Prior Florida vendor requests usually included fee-limitation language."
        ])
      }),
      sendGate: Object.freeze([
        Object.freeze({ id: "draft", label: "Draft body", complete: false, detail: "Fee challenge draft not reviewed." }),
        Object.freeze({ id: "recipients", label: "Recipients", complete: true, detail: "Agency records contact matched." }),
        Object.freeze({ id: "citations", label: "Citations", complete: true, detail: "Florida fee guidance attached." }),
        Object.freeze({ id: "attachments", label: "Attachments", complete: true, detail: "Fee estimate linked." }),
        Object.freeze({ id: "risk", label: "Risk flags", complete: false, detail: "Cost posture requires human decision." })
      ]),
      escalationGate: incompleteEscalationGate,
      deadlinePosture: "No fixed deadline; fee/scope negotiation controls the next action.",
      correspondence: Object.freeze({
        provider: "imap-smtp",
        syncState: "Thread matched",
        latestInbound: "Agency supplied a $4,500 estimate.",
        latestOutbound: "Request scope and date range sent."
      }),
      evidencePackets: Object.freeze([
        Object.freeze({
          evidenceId: "ev_prr_fee_045",
          title: "Fee estimate message",
          sourceArtifact: "imap:message/prr_req_sheriff_045",
          fileCount: 1,
          hashState: "sha256 verified",
          extractionState: "Extracted",
          classificationState: "Fee estimate"
        })
      ]),
      diagnostics: Object.freeze([]),
      timeline: Object.freeze(["prr.request.created", "prr.fee.estimate.received", "prr.scope.review.recommended"])
    }),
    Object.freeze({
      prrRequestId: "prr_req_production_018",
      title: "City procurement email production",
      agencyName: "City Procurement Office",
      nextAction: Object.freeze({
        label: "Classify evidence",
        summary: "Production landed and should be routed into evidence classification.",
        risk: "cyan",
        primaryActionLabel: "Classify evidence",
        requiredHumanDecision: "Confirm the packet belongs to the vendor oversight investigation.",
        explanation: Object.freeze([
          "Three production attachments are linked.",
          "Hashes are verified.",
          "Evidence classification has not started."
        ])
      }),
      sendGate: Object.freeze([
        Object.freeze({ id: "draft", label: "Draft body", complete: false, detail: "No outbound draft needed." }),
        Object.freeze({ id: "recipients", label: "Recipients", complete: true, detail: "Provider thread remains linked." }),
        Object.freeze({ id: "citations", label: "Citations", complete: true, detail: "Original request citation preserved." }),
        Object.freeze({ id: "attachments", label: "Attachments", complete: true, detail: "Production attachments verified." }),
        Object.freeze({ id: "risk", label: "Risk flags", complete: true, detail: "No send risk active." })
      ]),
      escalationGate: incompleteEscalationGate,
      deadlinePosture: "Production arrived on Jul 02; evidence intake is the active posture.",
      correspondence: Object.freeze({
        provider: "gmail",
        syncState: "Thread synced",
        latestInbound: "Agency sent responsive procurement emails.",
        latestOutbound: "Acknowledgement draft available."
      }),
      evidencePackets: Object.freeze([
        Object.freeze({
          evidenceId: "ev_prr_production_018_a",
          title: "Procurement email production",
          sourceArtifact: "gmail:thread/prr_req_production_018",
          fileCount: 3,
          hashState: "sha256 verified",
          extractionState: "Queued for extraction",
          classificationState: "Unclassified"
        })
      ]),
      diagnostics: Object.freeze([]),
      timeline: Object.freeze(["prr.request.created", "prr.production.received", "evidence.packet.queued"])
    }),
    Object.freeze({
      prrRequestId: "prr_req_transit_031",
      title: "Transit authority denial appeal",
      agencyName: "Regional Transit Authority",
      nextAction: Object.freeze({
        label: "Confirm escalation basis",
        summary: "Escalation is locked until the user confirms the legal posture.",
        risk: "red",
        primaryActionLabel: "Confirm basis",
        requiredHumanDecision: "Explicitly confirm that the appeal basis is appropriate before sending.",
        explanation: Object.freeze([
          "Confirmed deadline has passed.",
          "Correspondence evidence is linked.",
          "User confirmation is still missing."
        ])
      }),
      sendGate: Object.freeze([
        Object.freeze({ id: "draft", label: "Draft body", complete: true, detail: "Appeal draft available." }),
        Object.freeze({ id: "recipients", label: "Recipients", complete: true, detail: "Appeals inbox verified." }),
        Object.freeze({ id: "citations", label: "Citations", complete: true, detail: "Pack citation attached." }),
        Object.freeze({ id: "attachments", label: "Attachments", complete: true, detail: "Denial evidence linked." }),
        Object.freeze({ id: "risk", label: "Risk flags", complete: false, detail: "Escalation confirmation required." })
      ]),
      escalationGate: Object.freeze([
        Object.freeze({ id: "basis", label: "Deadline or stalling basis", complete: true, detail: "Confirmed stalling." }),
        Object.freeze({ id: "citation", label: "Cited rule", complete: true, detail: "Appeal guidance attached." }),
        Object.freeze({ id: "evidence", label: "Correspondence evidence", complete: true, detail: "Denial thread linked." }),
        Object.freeze({ id: "confirmation", label: "User confirmation", complete: false, detail: "Not confirmed." })
      ]),
      deadlinePosture: "Confirmed deadline passed on Jun 24; stalling confirmed by user.",
      correspondence: Object.freeze({
        provider: "gmail",
        syncState: "Thread synced",
        latestInbound: "Agency denied the request in full.",
        latestOutbound: "Appeal draft waiting for confirmation."
      }),
      evidencePackets: Object.freeze([
        Object.freeze({
          evidenceId: "ev_prr_denial_031",
          title: "Denial letter",
          sourceArtifact: "gmail:thread/prr_req_transit_031",
          fileCount: 1,
          hashState: "sha256 verified",
          extractionState: "Queued for correspondence metadata",
          classificationState: "Denial"
        })
      ]),
      diagnostics: Object.freeze([]),
      timeline: Object.freeze(["prr.request.created", "prr.denial.recorded", "prr.appeal.created"])
    })
  ]),
  signalMap: Object.freeze({
    nodes: Object.freeze([
      Object.freeze({
        id: "node_agency_sheriff",
        agencyId: "agency_sheriff",
        agencyName: "Broward Sheriff's Office",
        tone: "red",
        x: 20,
        y: 42,
        summary: "Fee anomaly cluster"
      }),
      Object.freeze({
        id: "node_agency_mia",
        agencyId: "agency_mia",
        agencyName: "Miami-Dade Aviation Department",
        tone: "amber",
        x: 48,
        y: 24,
        summary: "Repeated delay language"
      }),
      Object.freeze({
        id: "node_agency_faa",
        agencyId: "agency_faa",
        agencyName: "Federal Aviation Administration",
        tone: "green",
        x: 72,
        y: 36,
        summary: "Two drafts ready"
      }),
      Object.freeze({
        id: "node_agency_transit",
        agencyId: "agency_transit",
        agencyName: "Regional Transit Authority",
        tone: "red",
        x: 58,
        y: 70,
        summary: "Escalation gate locked"
      }),
      Object.freeze({
        id: "node_agency_city",
        agencyId: "agency_city",
        agencyName: "City Procurement Office",
        tone: "cyan",
        x: 82,
        y: 58,
        summary: "Production ready for evidence intake"
      })
    ]),
    edges: Object.freeze([
      Object.freeze({
        id: "edge_fee_delay",
        from: "node_agency_sheriff",
        to: "node_agency_mia",
        label: "Cost and delay pressure",
        tone: "amber"
      }),
      Object.freeze({
        id: "edge_escalation",
        from: "node_agency_mia",
        to: "node_agency_transit",
        label: "Stalling pattern",
        tone: "red"
      })
    ])
  }),
  builder: Object.freeze({
    steps: Object.freeze([
      Object.freeze({
        id: "jurisdiction",
        label: "Jurisdiction pack",
        state: "complete",
        suggestedFills: Object.freeze([
          Object.freeze({
            id: "fill_florida_pack",
            fieldLabel: "Pack",
            value: floridaPublicRecords,
            provenance: "Based on your current saved view."
          })
        ])
      }),
      Object.freeze({
        id: "agency",
        label: "Agency/contact",
        state: "needs-review",
        suggestedFills: Object.freeze([
          Object.freeze({
            id: "fill_agency_contact",
            fieldLabel: "Contact",
            value: "records@miami-airport.example",
            provenance: "You used this contact on your last 3 airport requests."
          })
        ])
      }),
      Object.freeze({
        id: "scope",
        label: "Request scope",
        state: "needs-review",
        suggestedFills: Object.freeze([
          Object.freeze({
            id: "fill_scope_vendor_logs",
            fieldLabel: "Scope",
            value: "All vendor communications, contracts, amendments, invoices, and payment records for the selected date range.",
            provenance: "Based on your last 4 Florida vendor requests."
          })
        ])
      }),
      Object.freeze({
        id: "delivery",
        label: "Delivery channel",
        state: "ready",
        suggestedFills: Object.freeze([
          Object.freeze({
            id: "fill_delivery_email",
            fieldLabel: "Delivery",
            value: "Electronic delivery by email or secure file transfer",
            provenance: "You usually request electronic delivery for this agency."
          })
        ])
      }),
      Object.freeze({
        id: "deadline",
        label: "Deadline estimate",
        state: "ready",
        suggestedFills: Object.freeze([
          Object.freeze({
            id: "fill_deadline_estimate",
            fieldLabel: "Deadline",
            value: "Estimate from jurisdiction pack after send date is confirmed",
            provenance: "Suggested from the Federal FOIA starter pack."
          })
        ])
      }),
      Object.freeze({
        id: "review",
        label: "Review/send gate",
        state: "ready",
        suggestedFills: Object.freeze([
          Object.freeze({
            id: "fill_review_gate",
            fieldLabel: "Review checklist",
            value: "Draft body, recipients, jurisdiction citation, attachments, evidence links, and risk flags",
            provenance: "Adapted from your prior airport procurement request."
          })
        ])
      })
    ])
  })
} satisfies PrrWorkspaceFixture);
