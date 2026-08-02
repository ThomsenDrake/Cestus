import { safeAgentText } from "../agent/agent-adapter.js";

const awsAccessKeyPattern = /(?:AKIA|ASIA)[A-Z0-9]{16}/g;
const googleApiKeyPattern = /AIza[A-Za-z0-9_-]{35}/g;
const jwtPattern = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

export function safeCommandText(text: string): string {
  return safeAgentText(text)
    .replace(awsAccessKeyPattern, "[redacted credential]")
    .replace(googleApiKeyPattern, "[redacted credential]")
    .replace(jwtPattern, "[redacted credential]");
}
