import { describe, expect, it } from "vitest";
import { ipAddressesEquivalent, isTailnetAddress } from "../src/tailnet-address.js";

describe("isTailnetAddress", () => {
  it.each([
    "100.64.0.0",
    "100.127.255.255",
    "fd7a:115c:a1e0::1",
    "FD7A:115C:A1E0:abcd::1"
  ])("accepts concrete Tailscale-range address %s", (host) => {
    expect(isTailnetAddress(host)).toBe(true);
  });

  it.each([
    "0.0.0.0",
    "::",
    "127.0.0.1",
    "192.168.1.10",
    "100.63.255.255",
    "100.128.0.0",
    "fd7a:115c:a1df::1",
    "fd7a:115c:a1e1::1",
    "fd7a:115c:a1e0::1%tailscale0",
    "not-an-ip"
  ])("rejects wildcard, loopback, LAN, public, or out-of-range address %s", (host) => {
    expect(isTailnetAddress(host)).toBe(false);
  });

  it.each([" 100.99.12.34 ", " fd7a:115c:a1e0::1 "])("rejects whitespace-padded address %s", (host) => {
    expect(isTailnetAddress(host)).toBe(false);
  });

  it("matches equivalent IPv6 interface address representations but not a distinct address", () => {
    expect(ipAddressesEquivalent("FD7A:115C:A1E0:0000:0000:0000:0000:0001", "fd7a:115c:a1e0::1")).toBe(true);
    expect(ipAddressesEquivalent("fd7a:115c:a1e0::1", "fd7a:115c:a1e0::2")).toBe(false);
  });

  it("keeps IPv4 interface address comparison exact", () => {
    expect(ipAddressesEquivalent("100.99.12.34", "100.99.12.34")).toBe(true);
    expect(ipAddressesEquivalent("100.99.12.34", "100.99.12.35")).toBe(false);
  });
});
