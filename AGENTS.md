# Cestus Compound Engineering Contract

Compound Engineering is the sole development methodology for this repository.
Repository instructions and product-safety requirements override plugin defaults.

## Authority

Read only the context needed for the current task, in this order:

1. this contract and any narrower `AGENTS.md`;
2. `SECURITY.md` for product-safety invariants;
3. the accepted Compound Engineering plan or concrete user request;
4. relevant product-requirement sources and implementation code.

Documents under `docs/agentic/specifications/` preserve product requirements and
historical decisions. They are not workflow authority and do not authorize work
by themselves.

## Development Workflow

- Use `ce-strategy` or `ce-ideate` when direction is unsettled.
- Use `ce-brainstorm` to define requirements and `ce-plan` for implementation
  design when the work needs them.
- Execute accepted work with `ce-work`, then use `ce-simplify-code`,
  `ce-code-review`, and `ce-compound` when their gates apply.
- Route defects through `ce-debug`. Use specialized CE test and review skills
  for browser, Xcode, security, performance, or other domain-specific work.
- Finish with the appropriate CE commit or PR workflow. Never push, publish,
  merge, or perform another external action unless the user authorized it.

Do not introduce a repository-specific scheduler, registry, lifecycle, role
router, or parallel development methodology around Compound Engineering.

## Repository Conventions

- Preserve user-owned work and use task-scoped branches or isolated worktrees.
- For behavior changes, establish failing or characterization evidence before
  changing implementation when practical. Documentation and configuration work
  uses focused validation.
- Run targeted checks while working and `npm run verify` before delivery.
- Keep Git history as execution state; keep CE plans and solutions under the
  configured CE artifact root.
- Preserve all invariants in `SECURITY.md`; development coordination never
  becomes product-ledger data.
