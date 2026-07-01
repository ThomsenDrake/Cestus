export const prrStatuses = [
  "draft",
  "sent",
  "acknowledged",
  "inNegotiation",
  "awaitingProduction",
  "partiallyProduced",
  "produced",
  "denied",
  "appealed",
  "closed"
] as const;

export type PrrStatus = (typeof prrStatuses)[number];

export const correspondenceProviders = ["gmail", "imap-smtp", "himalaya"] as const;
export type CorrespondenceProvider = (typeof correspondenceProviders)[number];

export interface JurisdictionPackRef {
  name: string;
  version: string;
}

export interface ContactRef {
  name: string;
  email?: string;
  phone?: string;
}
