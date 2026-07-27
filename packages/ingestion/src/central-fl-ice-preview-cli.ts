import { pathToFileURL } from "node:url";
import {
  createCentralFloridaIcePreviewWorkflow,
  type CentralFloridaIcePreviewCheckpoint,
  type CentralFloridaIcePreviewWorkflow
} from "./central-fl-ice-preview.js";
import { stableJson } from "./legacy-report.js";

type WorkflowFactory = () => CentralFloridaIcePreviewWorkflow;

export async function runCentralFloridaIcePreviewCli(
  argv: readonly string[],
  workflowFactory: WorkflowFactory = createCentralFloridaIcePreviewWorkflow
): Promise<CentralFloridaIcePreviewCheckpoint | readonly CentralFloridaIcePreviewCheckpoint[]> {
  const command = argv[0];
  const workflow = workflowFactory();

  switch (command) {
    case "inspect":
      assertNoArguments(argv);
      return workflow.inspect();
    case "raw-import":
      assertAllowedOptions(argv, new Set(["--approved-by"]));
      return workflow.rawImport({
        approvedBy: requiredSingleOption(argv, "--approved-by")
      });
    case "staging-preview":
      assertNoArguments(argv);
      return workflow.stagingPreview();
    case "stage":
      assertAllowedOptions(argv, new Set(["--approved-by", "--candidate"]));
      return workflow.stage({
        approvedBy: requiredSingleOption(argv, "--approved-by"),
        candidateIds: requiredRepeatedOption(argv, "--candidate")
      });
    case "handoff":
      assertNoArguments(argv);
      return workflow.handoff();
    case "verify-replay":
      assertNoArguments(argv);
      return workflow.verifyReplay();
    case "manifest":
      assertNoArguments(argv);
      return workflow.manifest();
    case "status":
      assertNoArguments(argv);
      return workflow.status();
    default:
      throw new Error("Expected a Central Florida ICE preview command.");
  }
}

function assertNoArguments(argv: readonly string[]): void {
  if (argv.length !== 1) {
    throw new Error("Preview command does not accept additional arguments.");
  }
}

function requiredSingleOption(argv: readonly string[], option: string): string {
  const values = optionValues(argv, option);
  if (values.length !== 1) {
    throw new Error("Preview command requires exactly one approval identity.");
  }
  return values[0]!;
}

function requiredRepeatedOption(argv: readonly string[], option: string): string[] {
  const values = optionValues(argv, option);
  if (values.length === 0) {
    throw new Error("Preview stage command requires at least one candidate.");
  }
  return values;
}

function assertAllowedOptions(
  argv: readonly string[],
  allowed: ReadonlySet<string>
): void {
  if (argv.length < 3 || argv.length % 2 === 0) {
    throw new Error("Preview command arguments are invalid.");
  }
  for (let index = 1; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (
      option === undefined
      || value === undefined
      || !allowed.has(option)
      || value.startsWith("--")
    ) {
      throw new Error("Preview command arguments are invalid.");
    }
  }
}

function optionValues(argv: readonly string[], requested: string): string[] {
  const values: string[] = [];
  for (let index = 1; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (
      option === undefined
      || value === undefined
      || !option.startsWith("--")
      || value.startsWith("--")
      || (option !== "--approved-by" && option !== "--candidate")
    ) {
      throw new Error("Preview command arguments are invalid.");
    }
    if (option === requested) {
      values.push(value);
    }
  }
  return values;
}

async function main(): Promise<void> {
  try {
    const result = await runCentralFloridaIcePreviewCli(process.argv.slice(2));
    process.stdout.write(`${stableJson(result)}\n`);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Central Florida ICE preview command failed.";
    process.stderr.write(`${stableJson({ ok: false, message })}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
