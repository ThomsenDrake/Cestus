import { z } from "zod";

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Calendar validation without Date's special handling of years 00–99 or local time. */
export const partialDateSchema = z.string().regex(/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/)
  .refine(value => value.length !== 10 || Number(value.slice(8)) <= daysInMonth(Number(value.slice(0, 4)), Number(value.slice(5, 7))), "Invalid calendar date");

export const dateNormalizationSchema = z.object({
  method: z.literal("written-date.v1"),
  sourceExpression: z.string().min(1).max(120),
  citationIndex: z.number().int().nonnegative()
}).strict();
export type DateNormalization = z.infer<typeof dateNormalizationSchema>;

function bounds(value: string): [string, string] {
  if (value.length === 4) return [`${value}-01-01`, `${value}-12-31`];
  if (value.length === 7) return [`${value}-01`, `${value}-${daysInMonth(Number(value.slice(0, 4)), Number(value.slice(5, 7)))}`];
  return [value, value];
}

export const knowledgeTimeSchema = z.object({
  start: partialDateSchema,
  end: partialDateSchema.optional(),
  uncertain: z.boolean(),
  startNormalization: dateNormalizationSchema.optional(),
  endNormalization: dateNormalizationSchema.optional()
}).strict().superRefine((time, context) => {
  if (time.endNormalization && !time.end) context.addIssue({ code: "custom", path: ["endNormalization"], message: "End normalization requires an end date" });
  // Partial dates describe calendar bounds. Overlapping bounds are not a known reversal.
  if (time.end && bounds(time.start)[0] > bounds(time.end)[1]) context.addIssue({ code: "custom", path: ["end"], message: "End definitely precedes start" });
});

const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthPattern = "(January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sept?\\.?|Oct\\.?|Nov\\.?|Dec\\.?)";
const monthFirst = new RegExp(`^${monthPattern}\\s+(?:(\\d{1,2})(?:,)?\\s+)?(\\d{4})$`, "i");
const dayFirst = new RegExp(`^(\\d{1,2})\\s+${monthPattern}\\s+(\\d{4})$`, "i");

/** Only unambiguous English month-name expressions; no locale or reference-date guessing. */
export function normalizeWrittenDate(expression: string): string | undefined {
  if (expression.length > 120) return undefined;
  const source = expression.trim();
  const first = monthFirst.exec(source);
  const second = first ? null : dayFirst.exec(source);
  if (!first && !second) return undefined;
  const monthName = (first?.[1] ?? second![2]!).toLowerCase().replace(".", "");
  const month = monthNames.findIndex(name => name.startsWith(monthName)) + 1;
  const day = first ? first[2] : second![1];
  const year = (first ?? second)![3]!;
  const value = `${year}-${String(month).padStart(2, "0")}${day ? `-${day.padStart(2, "0")}` : ""}`;
  return partialDateSchema.safeParse(value).success ? value : undefined;
}

function containsDateExpression(quote: string, expression: string): boolean {
  let index = quote.indexOf(expression);
  while (index !== -1) {
    const before = quote[index - 1] ?? "";
    const after = quote[index + expression.length] ?? "";
    if (!/[\p{L}\p{N}_/\-]/u.test(before) && !/[\p{L}\p{N}_/\-]/u.test(after)) return true;
    index = quote.indexOf(expression, index + 1);
  }
  return false;
}

/** Citation identity is verified by the caller; this verifies expression and interpretation. */
export function isGroundedDate(value: string, quote: string, normalization?: DateNormalization): boolean {
  if (!partialDateSchema.safeParse(value).success) return false;
  if (!normalization) return containsDateExpression(quote, value);
  if (!dateNormalizationSchema.safeParse(normalization).success) return false;
  return normalizeWrittenDate(normalization.sourceExpression) === value && containsDateExpression(quote, normalization.sourceExpression);
}
