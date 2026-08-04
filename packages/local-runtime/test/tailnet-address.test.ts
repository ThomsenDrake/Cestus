import { describe, expect, it } from "vitest";
import { isTailnetAddress } from "../src/tailnet-address.js";

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
    "not-an-ip"
  ])("rejects wildcard, loopback, LAN, public, or out-of-range address %s", (host) => {
    expect(isTailnetAddress(host)).toBe(false);
  });
});
