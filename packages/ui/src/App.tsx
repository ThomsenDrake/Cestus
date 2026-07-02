import { buildCommandBoardViewModel } from "./workspace/command-model.js";
import { commandWorkspaceFixture } from "./workspace/command-fixtures.js";

const model = buildCommandBoardViewModel(commandWorkspaceFixture);

export function App() {
  return (
    <main className="isolate min-h-dvh bg-[#08090b] p-6 text-[#f3efe7] antialiased">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-base text-[#60d5ff] sm:text-sm">Cestus</p>
          <h1 className="text-2xl font-semibold text-balance">Command</h1>
        </div>
        <button
          type="button"
          className="relative min-h-9 border border-[#ffb84d] bg-[#ffb84d] px-3 py-2 text-sm font-semibold text-[#120d05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60d5ff]"
        >
          <span
            aria-hidden="true"
            className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
          />
          New request
        </button>
      </div>
      <section className="mx-auto mt-8 max-w-7xl border border-white/10 p-4">
        <h2 className="text-lg font-semibold">Priority queue</h2>
        <p className="mt-2 text-base text-pretty text-[#c8c2b8] sm:text-sm">
          {model.queueItems.length} signals ready for review.
        </p>
      </section>
    </main>
  );
}
