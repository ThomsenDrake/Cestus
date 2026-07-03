import type { StatusMetric } from "./command-types.js";

interface SignalStripProps {
  readonly metrics: readonly StatusMetric[];
}

const toneClasses: Record<StatusMetric["tone"], string> = {
  amber: "text-[var(--signal-amber)]",
  red: "text-[var(--signal-red)]",
  green: "text-[var(--signal-green)]",
  cyan: "text-[var(--signal-cyan)]",
  neutral: "text-[var(--muted-amber)]"
};

export function SignalStrip({ metrics }: SignalStripProps) {
  return (
    <section aria-label="Command signal strip" className="@container border-y border-[var(--console-line-strong)]">
      <div className="grid @lg:grid-cols-5">
        {metrics.map((metric) => (
          <div
            key={metric.id}
            className="border-t border-[var(--console-line)] py-3 first:border-t-0 @lg:border-l @lg:border-t-0 @lg:px-4 @lg:first:border-l-0"
          >
            <div className={`font-mono text-2xl tabular-nums ${toneClasses[metric.tone]}`}>{metric.value}</div>
            <div className="truncate font-mono text-base text-[var(--muted-amber)] sm:text-sm">{metric.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
