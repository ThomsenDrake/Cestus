// Test-only executable implementing the bounded official JSON-RPC interface.
import { readFileSync, appendFileSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
const scenario = JSON.parse(readFileSync(process.argv[1] + ".json", "utf8"));
if (process.argv.includes("--version")) { console.log("codex-cli " + (scenario.version ?? "0.153.4")); process.exit(); }
if (process.argv[2] === "debug" && process.argv[3] === "models") {
  console.log(JSON.stringify({ models: [{ slug: "gpt-6-astra", catalogRevision: scenario.catalogRevision ?? "original" }] })); process.exit();
}
const fixture = process.argv.includes('model_provider="fixture"');
const args = Object.fromEntries(process.argv.filter((arg, i, all) => all[i - 1] === "-c").map(arg => [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]));
const features = Object.fromEntries([...args.features.matchAll(/(\w+)=false/g)].map(match => [match[1], false]));
features.code_mode = { enabled: false, excluded_tool_namespaces: ["skills", "clock"] };
const configuration = {
  model_catalog_json: args.model_catalog_json ? JSON.parse(args.model_catalog_json) : null,
  model_provider: fixture ? "fixture" : "cestus_chatgpt", forced_login_method: fixture ? null : "chatgpt",
  model_providers: { [fixture ? "fixture" : "cestus_chatgpt"]: { request_max_retries: 0, stream_max_retries: 0, supports_websockets: false, requires_openai_auth: !fixture } },
  features, project_doc_max_bytes: 0, include_environment_context: false, include_apps_instructions: false,
  include_permissions_instructions: false, include_collaboration_mode_instructions: false, mcp_servers: {}, plugins: {}, notify: [],
  skills: { include_instructions: false, bundled: { enabled: false } }, agents: { enabled: false }, web_search: "disabled",
};
if (scenario.badConfig) configuration.features.shell_tool = true;
const log = entry => appendFileSync(scenario.log, JSON.stringify({ fixture, cwd: process.cwd(), home: process.env.CODEX_HOME, ...entry }) + "\n");
const send = item => process.stdout.write(JSON.stringify(item) + "\n");
const notify = (method, params) => send({ method, params });
let system;
const tools = JSON.parse(readFileSync(process.argv[1] + ".tools.json", "utf8"));
if (scenario.extraNestedTools) tools[0].tools[0].description += "\n## skills\nread personal contents";
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (!request.id) continue;
  const reply = result => send({ id: request.id, result });
  if (request.method === "initialize") {
    const auth = join(process.env.CODEX_HOME, "auth.json");
    log({ method: request.method, envKeys: Object.keys(process.env), authMode: fixture ? null : statSync(auth).mode & 0o777 }); reply({});
  } else if (request.method === "config/read") reply({ config: configuration });
  else if (request.method === "account/read") reply({ account: { type: scenario.account ?? "chatgpt" } });
  else if (request.method === "model/list") reply({ data: scenario.noModel ? [] : [{ model: "gpt-6-astra" }] });
  else if (request.method === "thread/start") {
    system = request.params.baseInstructions;
    log({ method: request.method, params: request.params, catalog: configuration.model_catalog_json ? readFileSync(configuration.model_catalog_json, "utf8") : null });
    reply({ model: !fixture && scenario.wrongModel ? "other-model" : "gpt-6-astra", modelProvider: fixture ? "fixture" : "cestus_chatgpt", instructionSources: scenario.extraInstructions ? ["unexpected"] : [], runtimeWorkspaceRoots: [], approvalPolicy: "never", sandbox: { type: "readOnly", networkAccess: false }, thread: { id: "thread-test", ephemeral: true } });
  } else if (request.method === "turn/start") {
    log({ method: request.method, params: request.params }); reply({ turn: { id: "turn-test" } });
    if (fixture) {
      const endpoint = args["model_providers.fixture"].match(/base_url="([^"]+)"/)[1];
      const input = [{ type: "additional_tools", role: "developer", tools }, { type: "message", role: "developer", content: [{ type: "input_text", text: system }] }, { type: "message", role: "user", content: [{ type: "input_text", text: request.params.input[0].text }] }];
      if (scenario.extraDisclosure) input.push({ type: "message", role: "developer", content: [{ type: "input_text", text: "unapproved" }] });
      await (await fetch(endpoint + "/responses", { method: "POST", body: JSON.stringify({ model: "gpt-6-astra", input }) })).text();
      input.push({ type: "custom_tool_call_output", call_id: "cestus_boundary_exec", output: scenario.hostEnabled ? "unexpected host result" : "code-mode host is disabled" });
      await (await fetch(endpoint + "/responses", { method: "POST", body: JSON.stringify({ model: "gpt-6-astra", input }) })).text();
    } else {
      if (scenario.stall) continue;
      if (scenario.serverRequest) { send({ id: 999, method: "item/tool/requestUserInput", params: { secret: "NEVER_LOG_THIS" } }); continue; }
      if (scenario.tool) { notify("item/started", { item: { type: "commandExecution", command: "forbidden" } }); continue; }
      if (scenario.reroute) { notify("model/rerouted", { model: "other-model" }); continue; }
      if (scenario.quota) { notify("error", { error: { message: "NEVER_LOG_THIS quota", codexErrorInfo: "usageLimitExceeded" }, willRetry: true }); continue; }
    }
    notify("thread/tokenUsage/updated", { tokenUsage: { total: { inputTokens: !fixture && scenario.badUsage ? -1 : 20, outputTokens: 10 } } });
    if (!fixture && scenario.multipleResponses) notify("thread/tokenUsage/updated", { tokenUsage: { total: { inputTokens: 40, outputTokens: 20 } } });
    notify("item/completed", { item: { type: "agentMessage", id: "message-test", text: !fixture && scenario.output ? scenario.output : '{"proposals":[]}' } });
    notify("turn/completed", { turn: { status: "completed", error: null } });
  }
}
