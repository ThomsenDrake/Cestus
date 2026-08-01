# Cestus Product Delivery Queue

Status: approved.

This is the ordered queue consumed by the standing coordinator prompt. Execute
one specification at a time. The specifications translate the product vision
preserved in `neo` into bounded completion slices; they do not authorize the
retired Factory V1/V2 process or require its artifacts as context.

1. `docs/agentic/specifications/01-ontology-provenance-workspace.md`
2. `docs/agentic/specifications/02-portable-ingestion-evidence-corpus.md`
3. `docs/agentic/specifications/03-evidence-review-workspace.md`
4. `docs/agentic/specifications/04-public-records-operations.md`
5. `docs/agentic/specifications/05-governance-review-export-preview.md`
6. `docs/agentic/specifications/06-live-command-workspace.md`
7. `docs/agentic/specifications/07-resident-agent-mounted-task.md`
8. `docs/agentic/specifications/08-resident-supervision-cockpit.md`
9. `docs/agentic/specifications/09-sourced-timeline-contradictions.md`
10. `docs/agentic/specifications/10-investigation-planning-prr-advice.md`
11. `docs/agentic/specifications/11-report-draft-public-safe-preview.md`

Vision coverage for maintainers (optional context, not ordinary worker input):

- `docs/superpowers/specs/2026-06-30-ontology-layer-design.md` drives
  specifications 1 and 3.
- `docs/superpowers/specs/2026-07-05-public-ingestion-pipeline-design.md`
  drives specifications 2 and 3.
- `docs/superpowers/specs/2026-07-01-public-records-request-workflow-design.md`
  and `2026-07-03-public-records-request-workspace-ui-design.md` drive
  specifications 4 and 10.
- `2026-07-02-cestus-command-workspace-ui-design.md` and
  `2026-07-03-cestus-tactical-command-ui-redesign.md` drive specification 6.
- `2026-07-05-security-threat-model-data-governance-design.md` drives
  specifications 3, 5, and 11.
- `2026-07-07-cestus-resident-agent-design.md` and
  `2026-07-12-resident-agent-full-vision-program-design.md` drive
  specifications 7 and 8; the latter's factory/wave mechanics are retired.
- `2026-07-09-mvp-specialist-workflows-design.md` drives specifications 9
  through 11.

The executable specifications contain the approved behavior. Workers do not
need these source designs unless a concrete ambiguity cannot be resolved from
the specification and current product contracts.

The coordinator may mark an item superseded without a commit when current
`neo` already satisfies every observable example and required check. It must
not create a factory-only commit merely to demonstrate that result.
