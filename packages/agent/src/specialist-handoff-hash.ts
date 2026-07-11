import { hashAgentContextPack } from "./context-packs.js";
import { parseSpecialistWorkflowHandoff, type SpecialistWorkflowHandoffDto } from "./specialist-handoffs.js";

export function hashSpecialistWorkflowHandoff(dto: SpecialistWorkflowHandoffDto): `sha256:${string}` {
  return hashAgentContextPack(parseSpecialistWorkflowHandoff(dto)) as `sha256:${string}`;
}
