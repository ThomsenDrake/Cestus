import { isIP } from "node:net";

const tailnetHostError =
  "Tailnet local runtime host must be an explicit address in the Tailscale IPv4 or IPv6 ranges";

export function isTailnetAddress(host: string): boolean {
  if (host.trim() !== host || host.includes("%")) {
    return false;
  }
  const normalized = host.toLowerCase();
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

export function ipAddressesEquivalent(left: string, right: string): boolean {
  const leftFamily = isIP(left);
  const rightFamily = isIP(right);
  if (leftFamily === 0 || leftFamily !== rightFamily) {
    return false;
  }
  if (leftFamily === 4) {
    return left === right;
  }

  return canonicalIpv6Address(left) === canonicalIpv6Address(right);
}

function canonicalIpv6Address(host: string): string {
  return new URL(`http://[${host}]/`).hostname;
}

export function tailnetAddressError(): string {
  return tailnetHostError;
}
