import { existsSync } from "node:fs";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderInvocationError } from "../../agent/src/provider.js";
import { CodexDocumentProvider, qualifyCodexDocumentBoundary } from "../src/codex-document-provider.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fake(scenario: Record<string, unknown> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "cestus-codex-test-")); directories.push(directory);
  const binary = join(directory, "codex"); const log = join(directory, "protocol.jsonl");
  const source = await readFile(new URL("./fixtures/codex-document-fake.mjs", import.meta.url), "utf8");
  await writeFile(binary, `#!${process.execPath}\n${source}`, { mode: 0o700 });
  await copyFile(new URL("./fixtures/codex-document-tools.json", import.meta.url), binary + ".tools.json");
  await writeFile(binary + ".json", JSON.stringify({ ...scenario, log }));
  await writeFile(join(directory, "auth.json"), '{"opaque":"TEST_ONLY_PRIVATE_AUTH"}', { mode: 0o600 });
  const provider = new CodexDocumentProvider({ env: { PATH: process.env.PATH, HOME: directory, CESTUS_DOCUMENT_CODEX_BIN: binary,
    CESTUS_DOCUMENT_CODEX_AUTH_HOME: directory, OPENAI_API_KEY: "MUST_NOT_INHERIT", CODEX_HOME: "/unrelated", NODE_OPTIONS: "MUST_NOT_INHERIT" } });
  return { provider, binary, directory, log, update: async (next: Record<string, unknown>) => writeFile(binary + ".json", JSON.stringify({ ...scenario, ...next, log })) };
}
const invocation = (snapshot: Awaited<ReturnType<CodexDocumentProvider["prepare"]>>, beforeTransfer = () => {}) => ({
  snapshot, systemPrompt: "APPROVED SCHEMA AND INSTRUCTIONS", inputText: "APPROVED SELECTED PASSAGE", signal: new AbortController().signal, maxResponseBytes: 65536, beforeTransfer,
});

describe("isolated Codex document provider", () => {
  it("fails closed before any transfer when the official binary is absent", async () => {
    const provider = new CodexDocumentProvider({ env: { PATH: "/nonexistent", HOME: "/nonexistent" } });
    await expect(provider.prepare()).rejects.toThrow("Codex CLI is unavailable");
  });

  it("uses ChatGPT metadata only during preview; copies opaque authentication privately and cleans isolation directories", async () => {
    const fixture = await fake();
    const snapshot = await fixture.provider.prepare();
    expect(snapshot).toMatchObject({ model: "gpt-6-astra", authentication: "chatgpt", maxInvocations: 1 });
    expect(snapshot.usageBasis).toContain("no API USD estimate");
    const calls = (await readFile(fixture.log, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(calls.filter(call => !call.fixture && call.method === "turn/start")).toHaveLength(0);
    const live = calls.find(call => !call.fixture && call.method === "initialize");
    expect(live.authMode).toBe(0o600);
    expect(live.envKeys.sort()).toEqual(["CODEX_HOME", "HOME", "PATH"]);
    for (const call of calls) await expect(access(call.home)).rejects.toThrow();
    expect(await readFile(join(fixture.directory, "auth.json"), "utf8")).toBe('{"opaque":"TEST_ONLY_PRIVATE_AUTH"}');
  });

  it("sends only approved messages after the last authority check and records actual token usage", async () => {
    const fixture = await fake(); const snapshot = await fixture.provider.prepare(); let checks = 0;
    const result = await fixture.provider.invoke(invocation(snapshot, () => { checks++; }));
    expect(result).toEqual({ outputText: '{"proposals":[]}', usage: { inputUnits: 20, outputUnits: 10 }, model: "gpt-6-astra" });
    expect(checks).toBe(1);
    expect(snapshot.modelCatalogHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    const calls = (await readFile(fixture.log, "utf8")).trim().split("\n").map(line => JSON.parse(line)).filter(call => !call.fixture);
    const turns = calls.filter(call => call.method === "turn/start");
    expect(turns).toHaveLength(1);
    expect(turns[0].params).toEqual({ threadId: "thread-test", input: [{ type: "text", text: "APPROVED SELECTED PASSAGE", text_elements: [] }], environments: [] });
    expect(calls.find(call => call.method === "thread/start").catalog).toBe(JSON.stringify({ models: [{ slug: "gpt-6-astra", catalogRevision: "original" }] }) + "\n");
    expect(calls.find(call => call.method === "thread/start").params).toMatchObject({ baseInstructions: "APPROVED SCHEMA AND INSTRUCTIONS", developerInstructions: "", ephemeral: true, dynamicTools: [], selectedCapabilityRoots: [], allowProviderModelFallback: false });
  });

  it.each([
    [{ account: "apiKey" }, "API-key authentication is not permitted"],
    [{ noModel: true }, "GPT-6 Astra is unavailable"],
    [{ version: "0.154.0" }, "0.153.4 is required"],
    [{ badConfig: true }, "isolation configuration could not be verified"],
    [{ extraDisclosure: true }, "boundary qualification failed"],
    [{ extraNestedTools: true }, "boundary qualification failed"],
    [{ hostEnabled: true }, "boundary qualification failed"],
    [{ extraInstructions: true }, "boundary qualification failed"],
  ])("rejects an unqualified profile %j without live inference", async (scenario, message) => {
    const fixture = await fake(scenario);
    await expect(fixture.provider.prepare()).rejects.toThrow(message);
    const calls = await readFile(fixture.log, "utf8").catch(() => "");
    expect(calls.split("\n").filter(line => line && !JSON.parse(line).fixture && JSON.parse(line).method === "turn/start")).toHaveLength(0);
  });

  it("rejects readable-by-others credential files without reading their contents", async () => {
    const fixture = await fake(); await chmod(join(fixture.directory, "auth.json"), 0o644);
    await expect(fixture.provider.prepare()).rejects.toThrow("Private Codex ChatGPT sign-in file is unavailable");
  });

  it("rejects a changed binary snapshot and a stale approval before any live turn", async () => {
    const fixture = await fake(); const snapshot = await fixture.provider.prepare();
    await expect(fixture.provider.invoke(invocation({ ...snapshot, binaryHash: "changed" }))).rejects.toThrow("profile changed");
    await expect(fixture.provider.invoke(invocation(snapshot, () => { throw new Error("Approval is stale"); }))).rejects.toThrow("Approval is stale");
    const calls = (await readFile(fixture.log, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(calls.filter(call => !call.fixture && call.method === "turn/start")).toHaveLength(0);
  });

  it.each(["tool", "serverRequest", "reroute", "badUsage", "multipleResponses", "quota"])("fails closed for %s without retrying or exposing diagnostics", async mode => {
    const fixture = await fake(); const snapshot = await fixture.provider.prepare(); await fixture.update({ [mode]: true });
    try { await fixture.provider.invoke(invocation(snapshot)); expect.fail("must reject"); }
    catch (error) { expect(error).toBeInstanceOf(ProviderInvocationError); expect(String(error)).not.toContain("NEVER_LOG_THIS"); if (mode === "quota") expect(error).toMatchObject({ outcome: "rejected" }); }
    const calls = (await readFile(fixture.log, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(calls.filter(call => !call.fixture && call.method === "turn/start")).toHaveLength(1);
    for (const call of calls) await expect(access(call.home)).rejects.toThrow();
  });

  it("refuses an effective model change even when metadata lists the requested model", async () => {
    const fixture = await fake(); const snapshot = await fixture.provider.prepare(); await fixture.update({ wrongModel: true });
    await expect(fixture.provider.invoke(invocation(snapshot))).rejects.toThrow("model or isolation boundary");
  });

  it("bounds output bytes and kills an interrupted invocation without retry", async () => {
    const fixture = await fake(); const snapshot = await fixture.provider.prepare(); await fixture.update({ output: "X".repeat(100) });
    await expect(fixture.provider.invoke({ ...invocation(snapshot), maxResponseBytes: 20 })).rejects.toBeInstanceOf(ProviderInvocationError);
    await fixture.update({ stall: true }); const controller = new AbortController();
    const request = fixture.provider.invoke({ ...invocation(snapshot, () => { setTimeout(() => controller.abort(), 50); }), signal: controller.signal });
    await expect(request).rejects.toMatchObject({ outcome: "completion-unknown" });
  });

  const installedBinary = process.env.CESTUS_DOCUMENT_CODEX_TEST_BIN ?? join(process.env.HOME ?? "", ".local", "bin", "codex");
  it.skipIf(!existsSync(installedBinary))("qualifies the installed official CLI without inheriting caller instructions, MCP, hooks or credentials", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cestus-codex-canary-")); directories.push(directory);
    await mkdir(join(directory, ".codex"));
    const marker = join(directory, "unexpected-hook-or-mcp");
    await writeFile(join(directory, "AGENTS.md"), "UNAPPROVED CANARY INSTRUCTIONS");
    await writeFile(join(directory, ".codex", "AGENTS.md"), "UNAPPROVED GLOBAL INSTRUCTIONS");
    await writeFile(join(directory, ".codex", "config.toml"), `notify = ["touch", ${JSON.stringify(marker)}]\n[mcp_servers.canary]\ncommand = "touch"\nargs = [${JSON.stringify(marker)}]\n`);
    const tools = await qualifyCodexDocumentBoundary(installedBinary, { PATH: process.env.PATH, HOME: directory, CODEX_HOME: join(directory, ".codex"), OPENAI_API_KEY: "NEVER_SEND_THIS" });
    expect(tools).toHaveLength(1);
    expect((tools[0] as { tools: { name: string }[] }).tools.map(tool => tool.name)).toEqual(["exec", "wait", "request_user_input_async"]);
    await expect(access(marker)).rejects.toThrow();
  }, 30_000);

  it("requires fresh approval when the unchanged official model catalog changes", async () => {
    const fixture = await fake(); const snapshot = await fixture.provider.prepare();
    await fixture.update({ catalogRevision: "updated-official-metadata" });
    await expect(fixture.provider.invoke(invocation(snapshot))).rejects.toThrow("profile changed");
    const calls = (await readFile(fixture.log, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(calls.filter(call => !call.fixture && call.method === "turn/start")).toHaveLength(0);
  });
});
