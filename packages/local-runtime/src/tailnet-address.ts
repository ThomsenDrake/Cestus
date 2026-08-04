import { isIP } from "node:net";

const tailnetHostError =
  "Tailnet local runtime host must be an explicit address in the Tailscale IPv4 or IPv6 ranges";

export function isTailnetAddress(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  const family = isIP(normalized);

  if (family === 4) {
    const [first, second] = normalized.split(".").map(Number);
    return first === 100 && second !== undefined && second >= 64 && second <= 127;
  }

  return family === 6 && normalized.startsWith("fd7a:115c:a1e0:");
}

export function assertTailnetAddress(host: string | undefined): asserts host is string {
  if (host === undefined || !isTailnetAddress(host)) {
    throw new Error(tailnetHostError);
  }
}

export function tailnetAddressError(): string {
  return tailnetHostError;
}
