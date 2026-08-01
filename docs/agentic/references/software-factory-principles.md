# Software Factory Principles

Status: non-authoritative reference material.

This is optional context for factory maintainers and architects. The current
workflow authority is `docs/agentic/software-factory.md`; ordinary product
workers do not need this synthesis or the preserved articles.

## Durable Principles

- Humans define product direction, desired behavior, and guardrails. Agents
  should own complete bounded tickets and perform the implementation work.
- Software moves through a repeatable line: specification, implementation,
  automated verification, independent review, integration, and observation.
- Deterministic coordination should assemble task-relevant context, choose
  tools and checks, create isolation, and route exceptions. It should not ask
  an agent to infer the whole operating history of the organization.
- Each worker needs an isolated Git branch or worktree. Git persists the
  candidate, makes interruption recoverable, and preserves inspection,
  integration, and rollback paths.
- Automated backpressure—tests, types, linting, builds, contract checks, and
  CI—should catch routine defects early enough for agents to self-correct.
- A fresh second agent should review consequential candidates because an
  implementer is biased toward its own approach.
- Low-risk, reversible changes that pass checks and review should not wait for
  a human merge bottleneck. Irreversible, trust-sensitive, or externally acting
  steps should escalate through explicit guardrails.
- Repair loops should be short and bounded. A second focused failure is a
  signal to change tactics or hand off the exception, not to create endless
  coordination activity.
- Reusable skills and developer tools are valuable when they reduce repeated
  product-development cost. They should emerge from observed friction rather
  than speculative completeness.
- Factory maturity depends on verifiability, useful context, reliable tooling,
  reversibility, and fast feedback—not on the percentage of generated code or
  the amount of governance documentation.
- Measure reliable delivery, cycle time, human attention saved, repair rate,
  and reversibility. Improve the factory from real product failures and
  throughput evidence.

## Preserved Sources

The motivating snapshots are stored verbatim and remain non-authoritative:

- [“What the hell is a Software Factory?”](source-material/software-factory-ladder-thread.txt)
- [“The Software Factory: Why Your Team Will Never Work the Same Again”](source-material/software-factory-why-your-team-will-never-work-the-same-again.txt)
- [Source-material index and verified hashes](source-material/README.md)
