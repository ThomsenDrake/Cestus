import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, chmod, copyFile, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { ProviderInvocationError } from "../../agent/src/provider.js";
import type { CodexSubscriptionSnapshot } from "../../ontology/src/document-processing-contracts.js";

const MODEL = "gpt-6-astra";
const QUALIFIED_VERSION = "0.153.4";
// Full reviewed empty-wrapper descriptors from the qualified official CLI. This
// pins descriptions too: nested skills/clock/tools cannot hide inside exec text.
const MANDATORY_TOOLS_HASH = "f4b3de3b603ec90490c28680667d453035dfe41c8899f9b2e04ac36349c8eca2";
const USAGE_BASIS = "ChatGPT subscription; quota applies; no API USD estimate";
const MAX_PROTOCOL_BYTES = 1024 * 1024;
const execFileAsync = promisify(execFile);
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

// These are official CLI configuration overrides. Each installed binary is also
// qualified with an anonymous loopback Responses server before it can send evidence.
const disabledFeatures = ["shell_tool", "unified_exec", "apply_patch_freeform", "view_image", "apps", "plugins", "remote_plugin", "hooks", "codex_hooks", "plugin_hooks", "js_repl", "code_mode_host", "multi_agent", "multi_agent_v2", "skill_search", "tool_search", "tool_suggest", "search_tool", "browser_use", "computer_use", "image_generation", "workspace_dependencies", "memories", "memory_tool", "current_time_reminder", "goals", "request_permissions", "request_permissions_tool", "sleep_tool", "step_model_switching", "unbounded_connection_retries", "code_mode_only", "default_mode_request_user_input", "content_item_kinds"];
const isolationConfig: RecordValue = {
  include_environment_context: false, include_apps_instructions: false,
  include_permissions_instructions: false, include_collaboration_mode_instructions: false,
  project_doc_max_bytes: 0, skills: { include_instructions: false, bundled: { enabled: false } },
  agents: { enabled: false }, tools: { update_plan: { enabled: false }, experimental_request_user_input: { enabled: false } },
  web_search: "disabled", notify: [], mcp_servers: {}, plugins: {},
  features: { ...Object.fromEntries(disabledFeatures.map(name => [name, false])), code_mode: { enabled: false, excluded_tool_namespaces: ["skills", "clock"] } },
};
function toml(value: unknown): string {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return `{${Object.entries(value).map(([key, entry]) => `${key}=${toml(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}
function argumentsFor(provider: "cestus_chatgpt" | "fixture", endpoint?: string, modelCatalogPath?: string): string[] {
  const config = { ...isolationConfig, model_provider: provider,
    ...(modelCatalogPath ? { model_catalog_json: modelCatalogPath } : {}),
    ...(provider === "cestus_chatgpt" ? { forced_login_method: "chatgpt" } : {}),
    [`model_providers.${provider}`]: { name: provider === "cestus_chatgpt" ? "OpenAI" : "Cestus boundary qualification", wire_api: "responses",
      ...(endpoint ? { base_url: endpoint } : {}), requires_openai_auth: provider === "cestus_chatgpt", request_max_retries: 0, stream_max_retries: 0, supports_websockets: false },
  };
  return ["app-server", "--stdio", "--strict-config", ...Object.entries(config).flatMap(([key, value]) => ["-c", `${key}=${toml(value)}`])];
}

/** JSON-RPC stdio only; diagnostics and server errors never cross into public job errors. */
class AppServer {
  private readonly child: ChildProcessWithoutNullStreams;
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private buffered = "";
  private bytes = 0;
  private failure?: Error;
  onNotification: (message: RecordValue) => void = () => undefined;
  constructor(binary: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, signal?: AbortSignal) {
    this.child = spawn(binary, args, { cwd, env, stdio: "pipe", detached: true });
    this.child.stderr.on("data", (chunk: Buffer) => { this.count(chunk.length); });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.count(Buffer.byteLength(chunk));
      if (this.failure) return;
      this.buffered += chunk;
      let newline: number;
      while ((newline = this.buffered.indexOf("\n")) >= 0) {
        const line = this.buffered.slice(0, newline); this.buffered = this.buffered.slice(newline + 1);
        try { this.receive(record(JSON.parse(line))); } catch { this.fail(new ProviderInvocationError("invalid-response")); }
      }
    });
    this.child.on("error", () => this.fail(new ProviderInvocationError("completion-unknown")));
    this.child.on("exit", () => this.fail(new ProviderInvocationError("completion-unknown")));
    this.child.stdin.on("error", () => this.fail(new ProviderInvocationError("completion-unknown")));
    if (signal) {
      const abort = () => this.fail(new ProviderInvocationError("completion-unknown"));
      signal.addEventListener("abort", abort, { once: true });
      this.child.once("exit", () => signal.removeEventListener("abort", abort));
      if (signal.aborted) abort();
    }
  }
  private count(bytes: number) { this.bytes += bytes; if (this.bytes > MAX_PROTOCOL_BYTES) this.fail(new ProviderInvocationError("completion-unknown")); }
  private receive(message: RecordValue) {
    if (typeof message.method === "string") {
      // Never answer approval, authentication-refresh or user-question requests.
      if ("id" in message) { this.fail(new ProviderInvocationError("invalid-response")); return; }
      this.onNotification(message); return;
    }
    if (typeof message.id !== "number") { this.fail(new ProviderInvocationError("invalid-response")); return; }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id); clearTimeout(pending.timer);
    if ("error" in message) pending.reject(new ProviderInvocationError("rejected")); else pending.resolve(message.result);
  }
  fail(error: Error) {
    if (this.failure) return;
    this.failure = error;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.onNotification({ method: "cestus/failure" });
    this.kill();
  }
  private kill() {
    if (this.child.pid) { try { process.kill(-this.child.pid, "SIGKILL"); } catch { /* already exited */ } }
  }
  async close() {
    if (this.child.pid && this.child.exitCode === null && this.child.signalCode === null) {
      const exited = new Promise<void>(resolve => this.child.once("exit", () => resolve()));
      this.kill(); await exited;
    }
  }
  notify(method: string) { if (this.failure) throw this.failure; this.child.stdin.write(JSON.stringify({ method }) + "\n"); }
  rpc(method: string, params: unknown): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new ProviderInvocationError("completion-unknown")), 20_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  async initialize(provider: "cestus_chatgpt" | "fixture", modelCatalogPath?: string) {
    await this.rpc("initialize", { clientInfo: { name: "cestus_document_analysis", version: "1" }, capabilities: { experimentalApi: true } });
    this.notify("initialized");
    const config = record(record(await this.rpc("config/read", { includeLayers: true })).config);
    if (modelCatalogPath && config.model_catalog_json !== modelCatalogPath) throw new Error("Codex model catalog pin could not be verified.");
    const features = record(config.features);
    const transport = record(record(config.model_providers)[provider]);
    if (config.model_provider !== provider || transport.request_max_retries !== 0 || transport.stream_max_retries !== 0
      || transport.supports_websockets !== false || transport.requires_openai_auth !== (provider === "cestus_chatgpt")
      || (provider === "cestus_chatgpt" && (config.forced_login_method !== "chatgpt" || transport.base_url != null || transport.env_key != null
        || transport.experimental_bearer_token != null || transport.auth != null || transport.http_headers != null || transport.env_http_headers != null))) {
      throw new Error("Codex authentication and retry configuration could not be verified.");
    }
    if (disabledFeatures.some(name => features[name] !== false) || !same(features.code_mode, record(isolationConfig.features).code_mode)
      || config.project_doc_max_bytes !== 0 || config.include_environment_context !== false
      || config.include_apps_instructions !== false || config.include_permissions_instructions !== false || config.include_collaboration_mode_instructions !== false
      || !same(config.mcp_servers, {}) || !same(config.plugins, {}) || !same(config.notify, [])
      || record(config.skills).include_instructions !== false || record(record(config.skills).bundled).enabled !== false
      || record(config.agents).enabled !== false || config.web_search !== "disabled") throw new Error("Codex isolation configuration could not be verified.");
  }
  async thread(provider: "cestus_chatgpt" | "fixture", cwd: string, systemPrompt: string) {
    const result = record(await this.rpc("thread/start", { model: MODEL, modelProvider: provider, allowProviderModelFallback: false,
      cwd, ephemeral: true, baseInstructions: systemPrompt, developerInstructions: "", environments: [], runtimeWorkspaceRoots: [],
      selectedCapabilityRoots: [], dynamicTools: [], approvalPolicy: "never", sandbox: "read-only" }));
    if (result.model !== MODEL || result.modelProvider !== provider || !same(result.instructionSources, []) || !same(result.runtimeWorkspaceRoots, [])
      || result.approvalPolicy !== "never" || record(result.sandbox).type !== "readOnly" || record(result.sandbox).networkAccess !== false
      || record(result.thread).ephemeral !== true || typeof record(result.thread).id !== "string") throw new Error("Codex model or isolation boundary could not be verified.");
    return record(result.thread).id as string;
  }
  async turn(threadId: string, inputText: string, maxResponseBytes: number, qualify = false) {
    let usage: { inputUnits: number; outputUnits: number } | undefined;
    let usageUpdates = 0;
    const messages = new Map<string, string>();
    let finish!: (value: { outputText: string; usage: { inputUnits: number; outputUnits: number }; model: string }) => void;
    let reject!: (error: Error) => void;
    const done = new Promise<{ outputText: string; usage: { inputUnits: number; outputUnits: number }; model: string }>((resolve, fail) => { finish = resolve; reject = fail; });
    // Attach the rejection immediately, including before turn/start acknowledges.
    void done.catch(() => undefined);
    this.onNotification = message => {
      const method = String(message.method); const params = record(message.params);
      if (method === "cestus/failure") { reject(this.failure ?? new ProviderInvocationError("completion-unknown")); return; }
      if (method === "error" || /rerout|tool|requestUserInput|approval|permission/i.test(method)) {
        const code = record(params.error).codexErrorInfo;
        const rejected = ["usageLimitExceeded", "rateLimitExceeded", "unauthorized", "badRequest", "contextWindowExceeded", "sessionBudgetExceeded"].includes(String(code));
        this.fail(new ProviderInvocationError(method === "error" ? (rejected ? "rejected" : "completion-unknown") : "invalid-response")); return;
      }
      if (method === "item/started" || method === "item/completed") {
        const item = record(params.item);
        if (!["userMessage", "agentMessage", "reasoning"].includes(String(item.type)) || item.questions != null || item.memoryCitation != null) { this.fail(new ProviderInvocationError("invalid-response")); return; }
        if (method === "item/completed" && item.type === "agentMessage") {
          if (typeof item.text !== "string" || typeof item.id !== "string" || Buffer.byteLength(item.text) > maxResponseBytes) { this.fail(new ProviderInvocationError("invalid-response")); return; }
          messages.set(item.id, item.text);
        }
      }
      if (method === "thread/tokenUsage/updated") {
        if (++usageUpdates > 1 && !qualify) { this.fail(new ProviderInvocationError("invalid-response")); return; }
        const total = record(record(params.tokenUsage).total);
        if (![total.inputTokens, total.outputTokens].every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) { this.fail(new ProviderInvocationError("invalid-response")); return; }
        usage = { inputUnits: total.inputTokens as number, outputUnits: total.outputTokens as number };
      }
      if (method === "turn/completed") {
        const turn = record(params.turn);
        const outputText = [...messages.values()].join("\n");
        if (turn.status !== "completed" || turn.error != null) { reject(new ProviderInvocationError("completion-unknown")); return; }
        if (!usage || !outputText || Buffer.byteLength(outputText) > maxResponseBytes) { reject(new ProviderInvocationError("invalid-response")); return; }
        finish({ outputText, usage, model: MODEL });
      }
    };
    await this.rpc("turn/start", { threadId, input: [{ type: "text", text: inputText, text_elements: [] }], environments: [] });
    return done;
  }
}

async function isolated<T>(env: NodeJS.ProcessEnv, operation: (directory: string, childEnv: NodeJS.ProcessEnv) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "cestus-codex-document-"));
  try {
    await chmod(directory, 0o700);
    await mkdir(join(directory, "home"), { mode: 0o700 }); await mkdir(join(directory, "cwd"), { mode: 0o700 });
    return await operation(directory, { PATH: env.PATH ?? "", HOME: join(directory, "home"), CODEX_HOME: join(directory, "home") });
  } finally { await rm(directory, { recursive: true, force: true }); }
}

/** Anonymous loopback qualification: no account credentials or real records. */
export async function qualifyCodexDocumentBoundary(binary: string, env: NodeJS.ProcessEnv, signal?: AbortSignal, catalog?: string): Promise<unknown[]> {
  return isolated(env, async (directory, childEnv) => {
    const modelCatalogPath = catalog === undefined ? undefined : join(directory, "models.json");
    if (modelCatalogPath) await writeFile(modelCatalogPath, catalog!, { mode: 0o600 });
    const requests: RecordValue[] = [];
    let invalid = false;
    const server = createServer(async (request, response) => {
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of request) { size += chunk.length; if (size > MAX_PROTOCOL_BYTES) throw new Error(); chunks.push(chunk); }
        if (request.method !== "POST" || request.url !== "/v1/responses" || request.headers.authorization || requests.length >= 2) throw new Error();
        requests.push(record(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
        const item = requests.length === 1
          ? { type: "custom_tool_call", call_id: "cestus_boundary_exec", name: "exec", namespace: "functions", input: "text({tools:ALL_TOOLS, filesystem:typeof tools.exec_command, web:typeof fetch});" }
          : { type: "message", id: "msg_cestus_boundary", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"proposals":[]}', annotations: [] }] };
        const result = { id: "resp_cestus_boundary", object: "response", model: MODEL, status: "completed", output: [item], usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } };
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        for (const event of [{ type: "response.created", response: { ...result, status: "in_progress", output: [] } }, { type: "response.output_item.done", output_index: 0, item }, { type: "response.completed", response: result }]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        response.end();
      } catch { invalid = true; response.writeHead(400); response.end(); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Codex qualification failed.");
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20_000);
    const client = new AppServer(binary, argumentsFor("fixture", `http://127.0.0.1:${address.port}/v1`, modelCatalogPath), join(directory, "cwd"), childEnv, signal ? AbortSignal.any([signal, controller.signal]) : controller.signal);
    try {
      await client.initialize("fixture", modelCatalogPath);
      const thread = await client.thread("fixture", join(directory, "cwd"), "CESTUS APPROVED SYSTEM ONLY");
      await client.turn(thread, "CESTUS APPROVED PASSAGES ONLY", 4096, true);
      if (invalid || requests.length !== 2) throw new Error();
      const first = requests[0]!; const second = requests[1]!;
      const requestFields = ["model", "input", "tool_choice", "parallel_tool_calls", "reasoning", "store", "stream", "include", "prompt_cache_key", "text", "client_metadata"];
      if (Object.keys(first).some(key => !requestFields.includes(key))) throw new Error();
      if (first.model !== MODEL || second.model !== MODEL || first.instructions != null || (Array.isArray(first.tools) && first.tools.length)) throw new Error();
      const input = first.input; if (!Array.isArray(input) || input.length !== 3) throw new Error();
      const toolEntry = record(input[0]); const tools = toolEntry.tools;
      if (toolEntry.type !== "additional_tools" || toolEntry.role !== "developer" || !Array.isArray(tools) || tools.length !== 1) throw new Error();
      if (Object.keys(toolEntry).some(key => !["type", "id", "role", "tools"].includes(key))
        || createHash("sha256").update(JSON.stringify(tools)).digest("hex") !== MANDATORY_TOOLS_HASH) throw new Error();
      const namespace = record(tools[0]); const definitions = namespace.tools;
      if (namespace.type !== "namespace" || namespace.name !== "functions" || !Array.isArray(definitions)
        || !same(definitions.map(value => record(value).name), ["exec", "wait", "request_user_input_async"])) throw new Error();
      const messages = input.slice(1).map(value => { const message = record(value); if (Object.keys(message).some(key => !["type", "id", "role", "content"].includes(key))) throw new Error(); return { type: message.type, role: message.role, content: message.content }; });
      if (!same(messages, [{ type: "message", role: "developer", content: [{ type: "input_text", text: "CESTUS APPROVED SYSTEM ONLY" }] }, { type: "message", role: "user", content: [{ type: "input_text", text: "CESTUS APPROVED PASSAGES ONLY" }] }])) throw new Error();
      if (!Array.isArray(second.input) || !second.input.some(value => { const item = record(value); return item.type === "custom_tool_call_output" && item.call_id === "cestus_boundary_exec" && item.output === "code-mode host is disabled"; })) throw new Error();
      return structuredClone(tools);
    } catch { throw new Error("Codex isolation boundary qualification failed; no evidence was sent."); }
    finally { clearTimeout(timer); await client.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
}

export class CodexDocumentProvider {
  private readonly env: NodeJS.ProcessEnv;
  constructor(options: { env?: NodeJS.ProcessEnv } = {}) { this.env = { ...(options.env ?? process.env) }; }
  private async binary(signal?: AbortSignal) {
    if (signal?.aborted) throw new ProviderInvocationError("rejected");
    const configured = this.env.CESTUS_DOCUMENT_CODEX_BIN ?? "codex";
    let binary: string | undefined;
    for (const candidate of isAbsolute(configured) ? [configured] : (this.env.PATH ?? "").split(delimiter).filter(Boolean).map(directory => join(directory, configured))) {
      try { await access(candidate, constants.X_OK); binary = await realpath(candidate); break; } catch { /* try next explicit PATH entry */ }
    }
    if (!binary) throw new Error("Codex CLI is unavailable; configure the official Codex CLI.");
    const hash = createHash("sha256"); for await (const chunk of createReadStream(binary)) { if (signal?.aborted) throw new ProviderInvocationError("rejected"); hash.update(chunk); }
    const binaryHash = `sha256:${hash.digest("hex")}`;
    let cliVersion: string;
    try {
      cliVersion = await isolated(this.env, async (directory, env) => (await execFileAsync(binary!, ["--version"], { cwd: join(directory, "cwd"), env, timeout: 10_000, maxBuffer: 4096, ...(signal ? { signal } : {}) })).stdout.trim().replace(/^codex-cli\s+/, ""));
    } catch { throw new Error("Codex CLI version could not be verified."); }
    if (cliVersion !== QUALIFIED_VERSION) throw new Error(`Codex CLI ${QUALIFIED_VERSION} is required for the qualified document boundary.`);
    return { binary, cliVersion, binaryHash };
  }
  private async copyAuthentication(directory: string) {
    const authHome = this.env.CESTUS_DOCUMENT_CODEX_AUTH_HOME ?? (this.env.HOME ? join(this.env.HOME, ".codex") : undefined);
    if (!authHome || !isAbsolute(authHome)) throw new Error("ChatGPT sign-in is unavailable; sign in through the official Codex CLI.");
    try {
      const source = join(authHome, "auth.json"); const info = await lstat(source);
      if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 1024 * 1024) throw new Error();
      // Opaque copy only. The official CLI parses and refreshes its own auth file.
      await copyFile(source, join(directory, "home", "auth.json"), constants.COPYFILE_EXCL);
      await chmod(join(directory, "home", "auth.json"), 0o600);
    } catch { throw new Error("Private Codex ChatGPT sign-in file is unavailable."); }
  }
  private async authenticate(client: AppServer, modelCatalogPath?: string) {
    await client.initialize("cestus_chatgpt", modelCatalogPath);
    const account = record(record(await client.rpc("account/read", { refreshToken: false })).account);
    if (account.type !== "chatgpt") throw new Error("Codex must use ChatGPT subscription sign-in; API-key authentication is not permitted.");
    const models = record(await client.rpc("model/list", { limit: 100, includeHidden: true }));
    if (!Array.isArray(models.data) || !models.data.some(value => record(value).model === MODEL)) throw new Error("GPT-6 Astra is unavailable for this Codex account; no fallback model was used.");
  }
  private async profile(signal?: AbortSignal) {
    const identity = await this.binary(signal);
    const catalog = await isolated(this.env, async (directory, env) => {
      await this.copyAuthentication(directory);
      const client = new AppServer(identity.binary, argumentsFor("cestus_chatgpt"), join(directory, "cwd"), env, signal);
      try { await this.authenticate(client); } finally { await client.close(); }
      try {
        // Official metadata command only: it refreshes model availability/catalog,
        // never creates a turn. Preserve the entire returned catalog unchanged.
        const result = await execFileAsync(identity.binary, ["debug", "models", ...argumentsFor("cestus_chatgpt").slice(3)], {
          cwd: join(directory, "cwd"), env, timeout: 20_000, maxBuffer: 2 * MAX_PROTOCOL_BYTES, ...(signal ? { signal } : {}),
        });
        const parsed = record(JSON.parse(result.stdout));
        if (!Array.isArray(parsed.models) || parsed.models.filter(value => record(value).slug === MODEL).length !== 1) throw new Error();
        return result.stdout;
      } catch { throw new Error("The official GPT-6 Astra model catalog could not be verified; no evidence was sent."); }
    });
    const mandatoryTools = await qualifyCodexDocumentBoundary(identity.binary, this.env, signal, catalog);
    const snapshot: CodexSubscriptionSnapshot = { transport: "codex-chatgpt.v1", model: MODEL, cliVersion: identity.cliVersion,
      binaryHash: identity.binaryHash, modelCatalogHash: `sha256:${createHash("sha256").update(catalog).digest("hex")}`,
      mandatoryTools, authentication: "chatgpt", usageBasis: USAGE_BASIS, maxInvocations: 1 };
    return { snapshot, catalog };
  }
  async prepare(signal?: AbortSignal): Promise<CodexSubscriptionSnapshot> { return (await this.profile(signal)).snapshot; }
  async invoke(input: { snapshot: CodexSubscriptionSnapshot; systemPrompt: string; inputText: string; signal: AbortSignal;
    beforeTransfer: () => void | Promise<void>; maxResponseBytes: number }) {
    if (input.signal.aborted) throw new ProviderInvocationError("rejected");
    const { snapshot: current, catalog } = await this.profile(input.signal);
    if (!same(current, input.snapshot)) throw new Error("Codex profile changed; create and approve a fresh exact transfer preview.");
    if (input.signal.aborted) throw new ProviderInvocationError("rejected");
    if (!Number.isSafeInteger(input.maxResponseBytes) || input.maxResponseBytes < 1 || input.maxResponseBytes > 65536) throw new Error("Invalid Codex response limit.");
    const identity = await this.binary(input.signal);
    if (identity.binaryHash !== current.binaryHash) throw new Error("Codex binary changed; create a fresh transfer preview.");
    return isolated(this.env, async (directory, env) => {
      await this.copyAuthentication(directory);
      const modelCatalogPath = join(directory, "models.json");
      await writeFile(modelCatalogPath, catalog, { mode: 0o600 });
      const client = new AppServer(identity.binary, argumentsFor("cestus_chatgpt", undefined, modelCatalogPath), join(directory, "cwd"), env, input.signal);
      try {
        await this.authenticate(client, modelCatalogPath);
        const thread = await client.thread("cestus_chatgpt", join(directory, "cwd"), input.systemPrompt);
        await input.beforeTransfer();
        if (input.signal.aborted) throw new ProviderInvocationError("rejected");
        return await client.turn(thread, input.inputText, input.maxResponseBytes);
      } finally { await client.close(); }
    });
  }
}
