const secretValuePattern =
  /(?:^|[^a-z0-9])(?:access[\s._-]*bearer|api[\s._-]*key|authorization|bearer|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth|credential)(?:\s*[:=]\s*|\s+)(?=[a-z0-9._~+/=-]{3,})[a-z0-9][a-z0-9._~+/=-]*/i;
const secretPhrasePattern = /\b(?:auth[\s._-]*bearer|bearer|password|private[\s._-]*key)\b/i;
const privateKeyBlockPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
const secretIdFragmentPattern =
  /(?:^|[._-])(?:sk[._-](?:live|test|proj)|gh[pousr]_|github[._-]?pat|glpat|xox[baprs]?[._-]|akia|asia|aiza|ya29|hf[._-]|rk[._-]live|pk[._-]live|sg[._-])[\w._~+/=-]*/i;

export function isAgentSecretSafeText(value: string): boolean {
  return !secretValuePattern.test(value) &&
    !secretPhrasePattern.test(value) &&
    !privateKeyBlockPattern.test(value) &&
    !secretIdFragmentPattern.test(value);
}

export function assertAgentSecretSafeText(value: string, label: string): void {
  if (!isAgentSecretSafeText(value)) {
    throw new Error(`${label} must be secret-safe`);
  }
}
