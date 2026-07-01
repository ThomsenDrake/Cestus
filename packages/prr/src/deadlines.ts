import type { JurisdictionPack } from "./jurisdiction-packs.js";

export type DeadlineConfidence = "statutory" | "workflow";

export interface DeadlineCalculationInput {
  prrRequestId: string;
  receivedAt: string;
}

export interface CitedRule {
  label: string;
  citation: string;
  url: string;
}

export interface EstimatedDeadline {
  prrRequestId: string;
  deadlineDate: string;
  confidence: DeadlineConfidence;
  explanation: string;
  citedRules: CitedRule[];
}

export interface ActiveDeadlineCandidate {
  deadlineDate: string;
  source: "estimated" | "confirmed";
}

export function calculateEstimatedDeadline(
  pack: JurisdictionPack,
  input: DeadlineCalculationInput
): EstimatedDeadline {
  const rule = firstRule(pack);

  if (pack.name === "us-federal-foia") {
    return {
      prrRequestId: input.prrRequestId,
      deadlineDate: addWorkingDays(input.receivedAt, 20),
      confidence: "statutory",
      explanation: "Federal FOIA determination estimate based on 20 working days after receipt.",
      citedRules: rule.citations
    };
  }

  return {
    prrRequestId: input.prrRequestId,
    deadlineDate: addCalendarDays(input.receivedAt, 10),
    confidence: "workflow",
    explanation:
      "Florida estimate is an operational review date, not a fixed statutory response-day deadline.",
    citedRules: rule.citations
  };
}

export function chooseActiveDeadline(input: {
  estimated?: ActiveDeadlineCandidate;
  confirmed?: ActiveDeadlineCandidate;
}): ActiveDeadlineCandidate | undefined {
  return input.confirmed ?? input.estimated;
}

function firstRule(pack: JurisdictionPack): JurisdictionPack["rules"][number] {
  const rule = pack.rules[0];
  if (rule === undefined) {
    throw new Error(`Jurisdiction pack ${pack.name} has no rules`);
  }
  return rule;
}

function addCalendarDays(isoDateTime: string, days: number): string {
  const date = new Date(isoDateTime);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addWorkingDays(isoDateTime: string, days: number): string {
  const date = new Date(isoDateTime);
  let remaining = days;

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const dayOfWeek = date.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining -= 1;
    }
  }

  return date.toISOString().slice(0, 10);
}
