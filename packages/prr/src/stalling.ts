export type StallingSignalKind =
  | "deadline-breached"
  | "repeated-vague-delays"
  | "high-fee-estimate"
  | "silence-after-followup";

export interface StallingDetectionInput {
  prrRequestId: string;
  activeDeadlineDate?: string;
  today: string;
  responseCountAfterDeadline: number;
  vagueDelayCount: number;
  feeEstimateAmountCents?: number;
  daysSinceFollowup?: number;
}

export interface StallingSignal {
  kind: StallingSignalKind;
  explanation: string;
}

export interface StallingDetectionResult {
  prrRequestId: string;
  possibleStalling: boolean;
  confirmedStalling: false;
  signals: StallingSignal[];
}

const highFeeEstimateThresholdCents = 100000;
const followupSilenceWindowDays = 10;

export function detectStallingSignals(input: StallingDetectionInput): StallingDetectionResult {
  validateInput(input);

  const signals: StallingSignal[] = [];

  if (
    input.activeDeadlineDate !== undefined &&
    input.activeDeadlineDate < input.today &&
    input.responseCountAfterDeadline === 0
  ) {
    signals.push({
      kind: "deadline-breached",
      explanation: "Active deadline has passed without a recorded adequate response."
    });
  }

  if (input.vagueDelayCount >= 2) {
    signals.push({
      kind: "repeated-vague-delays",
      explanation: "Agency sent repeated vague delay messages."
    });
  }

  if ((input.feeEstimateAmountCents ?? 0) >= highFeeEstimateThresholdCents) {
    signals.push({
      kind: "high-fee-estimate",
      explanation: "Fee estimate is high enough to need user review."
    });
  }

  if (
    (input.daysSinceFollowup ?? 0) >= followupSilenceWindowDays &&
    input.responseCountAfterDeadline === 0
  ) {
    signals.push({
      kind: "silence-after-followup",
      explanation: "No response has been recorded after a follow-up window."
    });
  }

  return {
    prrRequestId: input.prrRequestId,
    possibleStalling: signals.length > 0,
    confirmedStalling: false,
    signals
  };
}

function validateInput(input: StallingDetectionInput): void {
  validatePrrRequestId(input.prrRequestId);
  validateDateOnly("today", input.today);

  if (input.activeDeadlineDate !== undefined) {
    validateDateOnly("activeDeadlineDate", input.activeDeadlineDate);
  }

  validateNonNegativeInteger("responseCountAfterDeadline", input.responseCountAfterDeadline);
  validateNonNegativeInteger("vagueDelayCount", input.vagueDelayCount);

  if (input.feeEstimateAmountCents !== undefined) {
    validateNonNegativeInteger("feeEstimateAmountCents", input.feeEstimateAmountCents);
  }

  if (input.daysSinceFollowup !== undefined) {
    validateNonNegativeInteger("daysSinceFollowup", input.daysSinceFollowup);
  }
}

function validatePrrRequestId(prrRequestId: string): void {
  if (!/^prr_[a-zA-Z0-9_-]+$/.test(prrRequestId)) {
    throw new Error(`Invalid prrRequestId: ${prrRequestId}`);
  }
}

function validateDateOnly(fieldName: string, value: string): void {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match === null) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }

  const [, yearText, monthText, dayText] = match;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== Number(yearText) ||
    date.getUTCMonth() !== Number(monthText) - 1 ||
    date.getUTCDate() !== Number(dayText)
  ) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
}

function validateNonNegativeInteger(fieldName: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
}
