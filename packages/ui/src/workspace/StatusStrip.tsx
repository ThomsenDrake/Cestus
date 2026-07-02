import type { StatusMetric } from "./command-types.js";

interface StatusStripProps {
  readonly metrics: readonly StatusMetric[];
}

const toneClasses: Record<StatusMetric["tone"], string> = {
  amber: "text-[var(--cestus-amber)]",
  red: "text-[var(--cestus-red)]",
  green: "text-[var(--cestus-green)]",
  cyan: "text-[var(--cestus-cyan)]",
  neutral: "text-[#c8c2b8]"
};

export function StatusStrip({ metrics }: StatusStripProps) {
  return (
    <section aria-label="Command status" className="@container">
      <div className="grid border-y border-white/10 @lg:grid-cols-5">
        {metrics.map((metric) => (
          <div
            key={metric.id}
            className="border-t border-white/10 py-3 first:border-t-0 @lg:border-l @lg:border-t-0 @lg:px-4 @lg:first:border-l-0"
          >
            <div className={`font-mono text-2xl tabular-nums ${toneClasses[metric.tone]}`}>{metric.value}</div>
            <div className="truncate text-base text-[#b8afa3] sm:text-sm">{metric.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
