import { describe, expect, it } from "vitest";
import { createLocalRuntimeSessions } from "../src/auth.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";

const config = resolveLocalRuntimeConfig({ cwd: "/tmp/cestus-session-unit", env: { CESTUS_LOCAL_AUTH_TOKEN: "disposable-session-test" } });
describe("local browser session lifetime", () => {
  it("consumes bootstrap once and enforces expiry independently of the browser cookie", () => {
    let now = 0;
    const sessions = createLocalRuntimeSessions(config, () => now);
    expect(sessions.establish("wrong")).toBeUndefined();
    const cookie = sessions.establish(sessions.bootstrapCode)!.split(";")[0]!;
    expect(sessions.establish(sessions.bootstrapCode)).toBeUndefined();
    expect(sessions.authorized({ cookie })).toBe(true);
    now = 8 * 60 * 60 * 1000;
    expect(sessions.authorized({ cookie })).toBe(false);
    expect(createLocalRuntimeSessions(config).authorized({ cookie })).toBe(false);
  });
  it("expires an unused bootstrap link after ten minutes", () => {
    let now = 0;
    const sessions = createLocalRuntimeSessions(config, () => now);
    now = 10 * 60 * 1000;
    expect(sessions.establish(sessions.bootstrapCode)).toBeUndefined();
  });
});
