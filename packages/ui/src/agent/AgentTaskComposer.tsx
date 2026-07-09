import { useEffect, useMemo, useState } from "react";
import type {
  AgentCockpitDto,
  AgentStatusDto,
  CreateAgentTaskInput,
  StartAgentRunInput
} from "./agent-types.js";

interface AgentTaskComposerProps {
  readonly cockpit: AgentCockpitDto;
  readonly status: AgentStatusDto;
  readonly onCreateTask?: ((input: CreateAgentTaskInput) => Promise<unknown>) | undefined;
  readonly onStartRun?: ((input: StartAgentRunInput) => Promise<unknown>) | undefined;
  readonly onRefresh?: (() => void) | undefined;
}

export function AgentTaskComposer({
  cockpit,
  status,
  onCreateTask,
  onStartRun,
  onRefresh
}: AgentTaskComposerProps) {
  const allowedRunTypes = (status.identity?.allowedRunTypes ?? []) as readonly StartAgentRunInput["runType"][];
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<CreateAgentTaskInput["priority"]>("normal");
  const [runType, setRunType] = useState<StartAgentRunInput["runType"] | "">(allowedRunTypes[0] ?? "");
  const [scopeKind, setScopeKind] = useState<StartAgentRunInput["scope"]["kind"]>("workspace");
  const [scopeRefsText, setScopeRefsText] = useState(status.identity?.workspaceId ?? "");
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (runType !== "" && allowedRunTypes.includes(runType)) {
      return;
    }
    setRunType(allowedRunTypes[0] ?? "");
  }, [allowedRunTypes, runType]);

  useEffect(() => {
    if (scopeKind === "workspace" && scopeRefsText.trim().length === 0 && status.identity?.workspaceId !== undefined) {
      setScopeRefsText(status.identity.workspaceId);
    }
  }, [scopeKind, scopeRefsText, status.identity?.workspaceId]);

  const activeLocks = useMemo(
    () => status.locks.filter((lock) => lock.state === "active"),
    [status.locks]
  );
  const blockingLocks = activeLocks.filter((lock) => lock.kind === "data-loss" || lock.kind === "secret");
  const scopeRefs = useMemo(
    () => [...new Set(scopeRefsText.split(/[\n,]/).map((ref) => ref.trim()).filter((ref) => ref.length > 0))],
    [scopeRefsText]
  );
  const titleSlug = slugify(title);
  const idSuffix = useMemo(
    () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    []
  );
  const proposedTaskId = `task_${titleSlug}_${idSuffix}`;
  const proposedRunId = `run_${titleSlug}_${idSuffix}`;
  const providerReadinessAvailable = status.providerReadiness !== undefined;
  const titleValid = title.trim().length > 0;
  const scopeValid = scopeRefs.length > 0;
  const runTypeAllowed = runType !== "" && allowedRunTypes.includes(runType);

  const createDisabled = submitState === "submitting" || onCreateTask === undefined || !titleValid;
  const startDisabledReason = getStartDisabledReason({
    onCreateTask,
    onStartRun,
    runTypeAllowed,
    hasBlockingLocks: blockingLocks.length > 0,
    providerReadinessAvailable,
    titleValid,
    scopeValid,
    submitState
  });

  async function handleCreateTask() {
    if (createDisabled || onCreateTask === undefined) {
      return;
    }

    const trimmedDescription = description.trim();
    setSubmitState("submitting");
    setErrorMessage(undefined);
    try {
      await onCreateTask({
        taskId: proposedTaskId,
        title: title.trim(),
        priority,
        ...(trimmedDescription.length === 0 ? {} : { description: trimmedDescription })
      });
    } catch {
      setErrorMessage("Task handoff could not be completed safely.");
    } finally {
      setSubmitState("idle");
    }
  }

  async function handleCreateAndStartRun() {
    if (startDisabledReason !== undefined || onCreateTask === undefined || onStartRun === undefined || runType === "") {
      return;
    }

    const trimmedDescription = description.trim();
    setSubmitState("submitting");
    setErrorMessage(undefined);
    try {
      const created = await onCreateTask({
        taskId: proposedTaskId,
        title: title.trim(),
        priority,
        ...(trimmedDescription.length === 0 ? {} : { description: trimmedDescription })
      }) as { readonly taskId?: string } | undefined;
      await onStartRun({
        runId: proposedRunId,
        taskId: created?.taskId ?? proposedTaskId,
        runType,
        scope: {
          kind: scopeKind,
          refs: scopeRefs
        }
      });
    } catch {
      setErrorMessage("Task handoff could not be completed safely.");
    } finally {
      setSubmitState("idle");
    }
  }

  return (
    <section aria-label="Give Cestus Agent a task" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
      <div className="flex min-w-0 flex-col gap-1 border-b border-[var(--console-line)] px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--paper-light)]">Give Cestus Agent a task</h2>
          <p className="mt-1 text-base text-[var(--muted-amber)] sm:text-sm">
            Safe handoff only. Route validation remains authoritative.
          </p>
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.9fr)]">
        <fieldset className="grid gap-3">
          <label className="grid gap-1">
            <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Task title</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="min-h-10 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] outline-none sm:min-h-9 sm:text-sm"
            />
          </label>

          <label className="grid gap-1">
            <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] outline-none sm:text-sm"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Priority</span>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as CreateAgentTaskInput["priority"])}
                className="min-h-10 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] outline-none sm:min-h-9 sm:text-sm"
              >
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Run type</span>
              <select
                value={runType}
                onChange={(event) => setRunType(event.target.value as StartAgentRunInput["runType"] | "")}
                className="min-h-10 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] outline-none sm:min-h-9 sm:text-sm"
              >
                {allowedRunTypes.length > 0 ? allowedRunTypes.map((allowed) => (
                  <option key={allowed} value={allowed}>{allowed}</option>
                )) : <option value="">no allowed run types</option>}
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Scope kind</span>
              <select
                value={scopeKind}
                onChange={(event) => setScopeKind(event.target.value as StartAgentRunInput["scope"]["kind"])}
                className="min-h-10 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] outline-none sm:min-h-9 sm:text-sm"
              >
                <option value="workspace">workspace</option>
                <option value="investigation">investigation</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Scope refs</span>
              <input
                type="text"
                value={scopeRefsText}
                onChange={(event) => setScopeRefsText(event.target.value)}
                className="min-h-10 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] outline-none sm:min-h-9 sm:text-sm"
              />
            </label>
          </div>
        </fieldset>

        <div className="grid gap-4">
          <dl className="grid gap-2 border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3">
            <ComposerStat label="Proposed task ID" value={proposedTaskId} mono />
            <ComposerStat label="Proposed run ID" value={proposedRunId} mono />
            <ComposerStat label="Providers" value={countLabel(status.providers.length, "provider")} />
            <ComposerStat
              label="Provider readiness"
              value={providerReadinessAvailable ? "Provider readiness available" : "Provider readiness is unavailable."}
            />
            <ComposerStat label="Pending approvals" value={countLabel(cockpit.summary.pendingApprovalCount, "pending approval")} />
            <ComposerStat label="Active locks" value={countLabel(activeLocks.length, "active lock")} />
            <ComposerStat
              label="Scheduler merge"
              value={cockpit.summary.mergeAfterScheduler ? "Merge after scheduler is enabled." : "Merge after scheduler is not required."}
            />
          </dl>

          {startDisabledReason === undefined ? null : (
            <p className="text-base text-[var(--signal-amber)] sm:text-sm">{startDisabledReason}</p>
          )}

          {errorMessage === undefined ? null : (
            <p role="alert" className="text-base text-[var(--signal-red)] sm:text-sm">{errorMessage}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCreateTask}
              disabled={createDisabled}
              className="min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--paper-light)] disabled:cursor-not-allowed disabled:text-[var(--muted-amber)] sm:min-h-9 sm:text-sm"
            >
              Create task
            </button>
            <button
              type="button"
              onClick={handleCreateAndStartRun}
              disabled={startDisabledReason !== undefined}
              className="min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--paper-light)] disabled:cursor-not-allowed disabled:text-[var(--muted-amber)] sm:min-h-9 sm:text-sm"
            >
              Create task and start run
            </button>
            {onRefresh === undefined ? null : (
              <button
                type="button"
                onClick={onRefresh}
                className="min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-amber)] sm:min-h-9 sm:text-sm"
              >
                Refresh
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ComposerStat(
  { label, value, mono = false }: { readonly label: string; readonly value: string; readonly mono?: boolean }
) {
  return (
    <div className="grid gap-1">
      <dt className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">{label}</dt>
      <dd className={`break-words text-base sm:text-sm ${mono ? "font-mono text-[var(--signal-cyan)]" : "text-[var(--paper-light)]"}`}>
        {value}
      </dd>
    </div>
  );
}

function getStartDisabledReason({
  onCreateTask,
  onStartRun,
  runTypeAllowed,
  hasBlockingLocks,
  providerReadinessAvailable,
  titleValid,
  scopeValid,
  submitState
}: {
  readonly onCreateTask?: ((input: CreateAgentTaskInput) => Promise<unknown>) | undefined;
  readonly onStartRun?: ((input: StartAgentRunInput) => Promise<unknown>) | undefined;
  readonly runTypeAllowed: boolean;
  readonly hasBlockingLocks: boolean;
  readonly providerReadinessAvailable: boolean;
  readonly titleValid: boolean;
  readonly scopeValid: boolean;
  readonly submitState: "idle" | "submitting";
}): string | undefined {
  if (submitState === "submitting") {
    return "Task handoff is already in progress.";
  }
  if (onCreateTask === undefined || onStartRun === undefined) {
    return "Run start route is unavailable.";
  }
  if (!runTypeAllowed) {
    return "No allowed run type is selected.";
  }
  if (hasBlockingLocks) {
    return "Active locks block run start.";
  }
  if (!providerReadinessAvailable) {
    return "Provider readiness is unavailable.";
  }
  if (!titleValid) {
    return "Enter a task title before starting a run.";
  }
  if (!scopeValid) {
    return "Add at least one scope ref before starting a run.";
  }
  return undefined;
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "untitled";
}
