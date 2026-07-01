import type { JurisdictionPack } from "./jurisdiction-packs.js";

export type DeadlineConfidence = "statutory" | "workflow";

export interface DeadlineCalculationInput {
  prrRequestId: string;
  receivedAt: string;
}

export interface CitedRule {
  jurisdictionPack: {
    name: string;
    version: string;
  };
  label: string;
  citation: string;
  url?: string;
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

const supportedPackVersions = {
  "florida-public-records": "0.1.0",
  "us-federal-foia": "0.1.0"
} as const;

const requiredRuleIds = {
  "florida-public-records": "florida-prompt-response-workflow-estimate",
  "us-federal-foia": "federal-determination-20-working-days"
} as const;

export function calculateEstimatedDeadline(
  pack: JurisdictionPack,
  input: DeadlineCalculationInput
): EstimatedDeadline {
  const receivedAt = parseReceivedAt(input.receivedAt);

  assertSupportedPack(pack);

  if (pack.name === "us-federal-foia") {
    const rule = findRequiredRule(pack, requiredRuleIds["us-federal-foia"]);
    return {
      prrRequestId: input.prrRequestId,
      deadlineDate: addFederalWorkingDays(receivedAt, 20),
      confidence: "statutory",
      explanation:
        "Federal FOIA determination estimate based on 20 working days after receipt, excluding Saturdays, Sundays, and observed federal legal public holidays.",
      citedRules: citedRulesFor(pack, rule)
    };
  }

  const rule = findRequiredRule(pack, requiredRuleIds["florida-public-records"]);
  return {
    prrRequestId: input.prrRequestId,
    deadlineDate: addCalendarDays(receivedAt, 10),
    confidence: "workflow",
    explanation:
      "Florida estimate is an operational review date, not a fixed statutory response-day deadline.",
    citedRules: citedRulesFor(pack, rule)
  };
}

export function chooseActiveDeadline(input: {
  estimated?: ActiveDeadlineCandidate;
  confirmed?: ActiveDeadlineCandidate;
}): ActiveDeadlineCandidate | undefined {
  return input.confirmed ?? input.estimated;
}

function assertSupportedPack(pack: JurisdictionPack): asserts pack is JurisdictionPack & {
  name: keyof typeof supportedPackVersions;
} {
  const expectedVersion = supportedPackVersions[pack.name as keyof typeof supportedPackVersions];
  if (expectedVersion === undefined || pack.version !== expectedVersion) {
    throw new Error(`Unsupported jurisdiction pack ${pack.name}@${pack.version}`);
  }
}

function findRequiredRule(
  pack: JurisdictionPack,
  ruleId: string
): JurisdictionPack["rules"][number] {
  const rule = pack.rules.find((candidate) => candidate.id === ruleId);
  if (rule === undefined) {
    throw new Error(`Jurisdiction pack ${pack.name}@${pack.version} is missing rule ${ruleId}`);
  }
  return rule;
}

function citedRulesFor(pack: JurisdictionPack, rule: JurisdictionPack["rules"][number]): CitedRule[] {
  return rule.citations.map((citation) => ({
    jurisdictionPack: { name: pack.name, version: pack.version },
    label: citation.label,
    citation: citation.citation,
    url: citation.url
  }));
}

function parseReceivedAt(receivedAt: string): Date {
  const match = receivedAt.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/
  );
  if (match === null) {
    throw new Error(`Invalid receivedAt: ${receivedAt}`);
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, millisecondText] = match;
  const date = new Date(receivedAt);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== Number(yearText) ||
    date.getUTCMonth() !== Number(monthText) - 1 ||
    date.getUTCDate() !== Number(dayText) ||
    date.getUTCHours() !== Number(hourText) ||
    date.getUTCMinutes() !== Number(minuteText) ||
    date.getUTCSeconds() !== Number(secondText) ||
    date.getUTCMilliseconds() !== Number(millisecondText)
  ) {
    throw new Error(`Invalid receivedAt: ${receivedAt}`);
  }

  return date;
}

function addCalendarDays(inputDate: Date, days: number): string {
  const date = new Date(inputDate.getTime());
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addFederalWorkingDays(inputDate: Date, days: number): string {
  const date = new Date(inputDate.getTime());
  let remaining = days;

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isFederalWorkingDay(date)) {
      remaining -= 1;
    }
  }

  return date.toISOString().slice(0, 10);
}

function isFederalWorkingDay(date: Date): boolean {
  const dayOfWeek = date.getUTCDay();
  return dayOfWeek !== 0 && dayOfWeek !== 6 && !isObservedFederalHoliday(date);
}

const observedHolidayCache = new Map<number, Set<string>>();

function isObservedFederalHoliday(date: Date): boolean {
  const year = date.getUTCFullYear();
  const dateKey = toDateKey(date);
  return (
    observedFederalHolidayKeys(year - 1).has(dateKey) ||
    observedFederalHolidayKeys(year).has(dateKey) ||
    observedFederalHolidayKeys(year + 1).has(dateKey)
  );
}

function observedFederalHolidayKeys(year: number): Set<string> {
  const cached = observedHolidayCache.get(year);
  if (cached !== undefined) {
    return cached;
  }

  const holidayKeys = new Set<string>([
    observedFixedHolidayKey(year, 0, 1),
    toDateKey(nthWeekdayOfMonth(year, 0, 1, 3)),
    toDateKey(nthWeekdayOfMonth(year, 1, 1, 3)),
    toDateKey(lastWeekdayOfMonth(year, 4, 1)),
    observedFixedHolidayKey(year, 5, 19),
    observedFixedHolidayKey(year, 6, 4),
    toDateKey(nthWeekdayOfMonth(year, 8, 1, 1)),
    toDateKey(nthWeekdayOfMonth(year, 9, 1, 2)),
    observedFixedHolidayKey(year, 10, 11),
    toDateKey(nthWeekdayOfMonth(year, 10, 4, 4)),
    observedFixedHolidayKey(year, 11, 25)
  ]);

  observedHolidayCache.set(year, holidayKeys);
  return holidayKeys;
}

function observedFixedHolidayKey(year: number, monthIndex: number, dayOfMonth: number): string {
  const date = utcDate(year, monthIndex, dayOfMonth);
  const dayOfWeek = date.getUTCDay();

  if (dayOfWeek === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  } else if (dayOfWeek === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return toDateKey(date);
}

function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  dayOfWeek: number,
  occurrence: number
): Date {
  const date = utcDate(year, monthIndex, 1);

  while (date.getUTCDay() !== dayOfWeek) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  date.setUTCDate(date.getUTCDate() + 7 * (occurrence - 1));
  return date;
}

function lastWeekdayOfMonth(year: number, monthIndex: number, dayOfWeek: number): Date {
  const date = utcDate(year, monthIndex + 1, 0);

  while (date.getUTCDay() !== dayOfWeek) {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date;
}

function utcDate(year: number, monthIndex: number, dayOfMonth: number): Date {
  return new Date(Date.UTC(year, monthIndex, dayOfMonth));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
