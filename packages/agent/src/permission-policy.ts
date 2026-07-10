export type AgentApprovalClass =
  | "none"
  | "human-review"
  | "provider-byte-transfer"
  | "external-message-send"
  | "legal-escalation"
  | "export-or-publication"
  | "destructive-or-repair"
  | "ledger-review";

export function approvalClassForSideEffect(sideEffectClass: string): AgentApprovalClass {
  switch (sideEffectClass) {
    case "read-only":
    case "local-derivative":
    case "ledger-proposal":
      return "none";
    case "external-byte-transfer":
      return "provider-byte-transfer";
    case "external-message-send":
      return "external-message-send";
    case "legal-escalation":
      return "legal-escalation";
    case "export-or-publication":
      return "export-or-publication";
    case "destructive-or-repair":
      return "destructive-or-repair";
    case "ledger-review":
      return "ledger-review";
    default:
      return "destructive-or-repair";
  }
}
