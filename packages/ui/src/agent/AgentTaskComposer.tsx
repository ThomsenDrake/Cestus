import { useMemo, useState } from "react";
import type {
  AgentCockpitDto,
  AgentStatusDto,
  CreateAgentTaskInput
} from "./agent-types.js";

interface AgentTaskComposerProps {
  readonly cockpit: AgentCockpitDto;
  readonly status: AgentStatusDto;
  readonly onCreateTask?: ((input: CreateAgentTaskInput) => Promise<unknown>) | undefined;
  readonly onRefresh?: (() => void) | undefined;
}

export function AgentTaskComposer({
  cockpit,
  status,
  onCreateTask,
  onRefresh
}: AgentTaskComposerProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<CreateAgentTaskInput["priority"]>("normal");
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const activeLocks = useMemo(
    () => status.locks.filter((lock) => lock.state === "active"),
    [status.locks]
  );
  const blockingLocks = activeLocks.filter((lock) => lock.kind === "data-loss" || lock.kind === "secret");
  const titleSlug = slugify(title);
  const [idSuffix, setIdSuffix] = useState(nextTaskIdSuffix);
  const proposedTaskId = `task_${titleSlug}_${idSuffix}`;
  const providerReadinessAvailable = status.providerReadiness !== undefined;
  const titleValid = title.trim().length > 0;

  const createDisabled = submitState === "submitting" || onCreateTask === undefined || !titleValid;

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
      setIdSuffix(nextTaskIdSuffix());
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
            Local queue only. Specialist execution remains blocked until scheduler readiness changes.
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
        </fieldset>

        <div className="grid gap-4">
          <dl className="grid gap-2 border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3">
            <ComposerStat label="Proposed task ID" value={proposedTaskId} mono />
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

          {blockingLocks.length === 0 ? null : (
            <p className="text-base text-[var(--signal-amber)] sm:text-sm">Active data-loss or secret locks require inspection.</p>
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
              Queue task
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

function nextTaskIdSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
