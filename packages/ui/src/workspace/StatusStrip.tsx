import type { StatusMetric } from "./command-types.js";

interface StatusStripProps {
  readonly metrics: readonly StatusMetric[];
}

const toneClasses: Record<StatusMetric["tone"], string> = {
  amber: "text-[var(--cestus-amber)]",
  red: "text-[var(--cestus-red)]",
  green: "text-[var(--cestus-green)]",
  cyan: "text-[var(--cestus-cyan)]",
  neutral: "text-[var(--cestus-muted-soft)]"
};

export function StatusStrip({ metrics }: StatusStripProps) {
  return (
    <div data-uidotsh-pick="Status strip treatment" className="contents">
      <section data-uidotsh-option="Divider metrics (current)" aria-label="Command status" className="contents">
        <div className="@container">
          <div className="grid border-y border-white/10 @lg:grid-cols-5">
            {metrics.map((metric) => (
              <MetricCell key={metric.id} metric={metric} />
            ))}
          </div>
        </div>
      </section>
      <section data-uidotsh-option="Thin framed metrics" className="contents" hidden>
        <div className="@container">
          <div className="grid gap-2 @lg:grid-cols-5">
            {metrics.map((metric) => (
              <div key={metric.id} className="border border-white/10 bg-[var(--cestus-panel)] p-3">
                <MetricCell metric={metric} framed />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section data-uidotsh-option="Inline signal bar" className="contents" hidden>
        <div className="flex flex-wrap gap-x-6 gap-y-3 border-y border-white/10 py-3">
          {metrics.map((metric) => (
            <MetricCell key={metric.id} metric={metric} compact />
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCell({
  metric,
  compact = false,
  framed = false
}: {
  readonly metric: StatusMetric;
  readonly compact?: boolean;
  readonly framed?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex min-w-0 items-baseline gap-2">
        <div className={`font-mono text-lg tabular-nums ${toneClasses[metric.tone]}`}>{metric.value}</div>
        <div className="truncate text-base text-[var(--cestus-muted-strong)] sm:text-sm">{metric.label}</div>
      </div>
    );
  }

  return (
    <div
      className={
        framed
          ? ""
          : "border-t border-white/10 py-3 first:border-t-0 @lg:border-l @lg:border-t-0 @lg:px-4 @lg:first:border-l-0"
      }
    >
      <div className={`font-mono text-2xl tabular-nums ${toneClasses[metric.tone]}`}>{metric.value}</div>
      <div className="truncate text-base text-[var(--cestus-muted-strong)] sm:text-sm">{metric.label}</div>
    </div>
  );
}
