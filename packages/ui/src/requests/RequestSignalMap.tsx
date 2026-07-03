import { useState, type CSSProperties } from "react";
import type { PrrSignalMapEdge, PrrSignalMapModel, PrrSignalMapNode, PrrSignalTone } from "./request-types.js";

interface RequestSignalMapProps {
  readonly map: PrrSignalMapModel;
}

type SignalPositionStyle = CSSProperties & {
  readonly "--signal-x": string;
  readonly "--signal-y": string;
};

const toneClasses: Record<
  PrrSignalTone,
  {
    readonly text: string;
    readonly border: string;
    readonly surface: string;
  }
> = {
  amber: {
    text: "text-[var(--signal-amber)]",
    border: "border-[var(--signal-amber)]",
    surface: "bg-[var(--signal-amber)]/10"
  },
  red: {
    text: "text-[var(--signal-red)]",
    border: "border-[var(--signal-red)]",
    surface: "bg-[var(--signal-red)]/10"
  },
  green: {
    text: "text-[var(--signal-green)]",
    border: "border-[var(--signal-green)]",
    surface: "bg-[var(--signal-green)]/10"
  },
  cyan: {
    text: "text-[var(--signal-cyan)]",
    border: "border-[var(--signal-cyan)]",
    surface: "bg-[var(--signal-cyan)]/10"
  },
  neutral: {
    text: "text-[var(--muted-amber)]",
    border: "border-[var(--console-line)]",
    surface: "bg-[var(--console-panel)]/72"
  }
};

export function RequestSignalMap({ map }: RequestSignalMapProps) {
  const [selectedNodeId, setSelectedNodeId] = useState(map.nodes[0]?.id);
  const selectedNode = map.nodes.find((node) => node.id === selectedNodeId) ?? map.nodes[0];

  return (
    <section aria-label="PRR signal map" className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div
        role="group"
        aria-label="Scrollable signal map canvas"
        className="overflow-x-auto overflow-y-hidden border border-[var(--console-line)] bg-[var(--console-panel)]/72"
      >
        <div className="relative min-h-[32rem] min-w-[46rem]">
          <div aria-hidden="true" className="cestus-scan-layer pointer-events-none absolute inset-0 opacity-80" />
          <div aria-hidden="true" className="absolute inset-3 border border-[var(--console-line)]/70" />
          {map.edges.map((edge) => (
            <SignalEdgeLabel key={edge.id} edge={edge} nodes={map.nodes} />
          ))}
          {map.nodes.map((node) => {
            const tone = toneClasses[node.tone];

            return (
              <button
                key={node.id}
                type="button"
                aria-label={`Select signal node ${node.agencyName}`}
                aria-pressed={selectedNode?.id === node.id}
                onClick={() => setSelectedNodeId(node.id)}
                className={[
                  "absolute left-[var(--signal-x)] top-[var(--signal-y)] z-10 min-h-16 w-44 -translate-x-1/2 -translate-y-1/2 border p-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)]",
                  selectedNode?.id === node.id
                    ? `${tone.border} ${tone.surface} shadow-[0_0_0_1px_currentColor]`
                    : "border-[var(--console-line)] bg-[var(--console-void)]/82 hover:border-[var(--signal-amber)] hover:bg-[var(--console-panel)]/88",
                  tone.text
                ].join(" ")}
                style={signalPositionStyle(node.x, node.y)}
              >
                <span
                  aria-hidden="true"
                  className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
                />
                <span className="block truncate text-base font-semibold sm:text-sm">
                  {node.agencyName} / {node.summary}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-3">
        <section
          aria-label="Selected agency signal"
          className="grid content-start gap-3 border border-[var(--console-line)] bg-[var(--console-panel)]/72 p-3"
        >
          {selectedNode === undefined ? (
            <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">No agency signal selected.</p>
          ) : (
            <SelectedSignal node={selectedNode} />
          )}
        </section>
        <section aria-label="Accessible signal list" className="grid gap-2 border border-[var(--console-line)] p-3">
          <h2 className="text-base font-semibold text-[var(--paper-light)]">Accessible signal list</h2>
          <ul role="list" className="grid gap-2">
            {map.nodes.map((node) => (
              <li key={node.id} className="border-t border-[var(--console-line)] pt-2 text-base sm:text-sm">
                <span className={toneClasses[node.tone].text}>{node.agencyName}: {node.summary}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Accessible signal relationships" className="grid gap-2 border border-[var(--console-line)] p-3">
          <h2 className="text-base font-semibold text-[var(--paper-light)]">Accessible signal relationships</h2>
          {map.edges.length === 0 ? (
            <p className="text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
              No signal relationships in this view.
            </p>
          ) : (
            <ul role="list" className="grid gap-2">
              {map.edges.map((edge) => (
                <li key={edge.id} className="border-t border-[var(--console-line)] pt-2 text-base sm:text-sm">
                  <span className={toneClasses[edge.tone].text}>{relationshipLabel(edge, map.nodes)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

function SignalEdgeLabel({
  edge,
  nodes
}: {
  readonly edge: PrrSignalMapEdge;
  readonly nodes: readonly PrrSignalMapNode[];
}) {
  const from = nodes.find((node) => node.id === edge.from);
  const to = nodes.find((node) => node.id === edge.to);
  if (from === undefined || to === undefined) {
    return null;
  }

  const tone = toneClasses[edge.tone];

  return (
    <div
      className={[
        "absolute left-[var(--signal-x)] top-[var(--signal-y)] z-0 w-40 -translate-x-1/2 -translate-y-1/2 border bg-[var(--console-void)]/80 p-2 text-center font-mono text-base sm:text-sm",
        tone.border,
        tone.text
      ].join(" ")}
      style={signalPositionStyle((from.x + to.x) / 2, (from.y + to.y) / 2)}
    >
      {edge.label}
    </div>
  );
}

function SelectedSignal({ node }: { readonly node: PrrSignalMapNode }) {
  const tone = toneClasses[node.tone];

  return (
    <>
      <p className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Selected agency</p>
      <h2 className={`text-xl font-semibold text-balance ${tone.text}`}>{node.agencyName}</h2>
      <p className="text-base text-pretty text-[var(--paper-light)] sm:text-sm">{node.summary}</p>
      <div className={`w-fit border px-2 py-1 font-mono text-base sm:text-sm ${tone.border} ${tone.text}`}>
        {node.tone}
      </div>
    </>
  );
}

function signalPositionStyle(x: number, y: number): SignalPositionStyle {
  return {
    "--signal-x": `${x}%`,
    "--signal-y": `${y}%`
  };
}

function relationshipLabel(edge: PrrSignalMapEdge, nodes: readonly PrrSignalMapNode[]): string {
  const from = nodes.find((node) => node.id === edge.from);
  const to = nodes.find((node) => node.id === edge.to);

  return `${edge.label}: ${from?.agencyName ?? "Unknown agency"} to ${to?.agencyName ?? "Unknown agency"}`;
}
