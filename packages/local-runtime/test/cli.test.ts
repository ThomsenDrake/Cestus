import { describe, expect, it } from "vitest";
import { runLocalRuntimeCli } from "../src/cli.js";

describe("runLocalRuntimeCli", () => {
  it("prints resolved config without secrets", async () => {
    const stdout: string[] = [];

    const exitCode = await runLocalRuntimeCli(["config"], {
      cwd: "/tmp/cestus-cli-test",
      env: {
        CESTUS_LOCAL_AUTH_TOKEN: "secret-token"
      },
      stdout: (line) => stdout.push(line),
      stderr: () => undefined
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain('"host": "127.0.0.1"');
    expect(stdout.join("\n")).not.toContain("secret-token");
  });

  it("dispatches explicit seed through an injected seed action", async () => {
    const stdout: string[] = [];
    const calls: string[] = [];

    const exitCode = await runLocalRuntimeCli(["seed-prr"], {
      cwd: "/tmp/cestus-cli-test",
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
      seedPrr: async () => {
        calls.push("seed");
        return { appendedCount: 9 };
      }
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual(["seed"]);
    expect(stdout.join("\n")).toContain('"appendedCount": 9');
  });

  it("dispatches serve through an injected server action", async () => {
    const calls: string[] = [];

    const exitCode = await runLocalRuntimeCli(["serve"], {
      cwd: "/tmp/cestus-cli-test",
      env: {},
      stdout: () => undefined,
      stderr: () => undefined,
      serve: async () => {
        calls.push("serve");
      }
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual(["serve"]);
  });
});
