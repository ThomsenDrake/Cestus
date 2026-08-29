# Cestus Product Safety

These invariants govern every product and development change regardless of the
development methodology, tool, model, or execution environment.

## Ledger And Evidence Integrity

- The product ledger is append-only. Corrections and reversals are new events;
  existing events are never rewritten or deleted.
- Evidence provenance and accepted-graph traceability remain mandatory.
- Derived projections remain completely rebuildable from authoritative ledger
  events and canonical evidence.
- Stored approvals are revalidated when consumed; recording an approval does
  not permanently bypass later authority or policy checks.

## Trust Boundaries And Secrets

- Secret-bearing data, diagnostics, errors, logs, and generated artifacts stay
  secret-safe.
- Authentication, authorization, provenance, and storage boundaries fail
  closed when authority or validation is missing, malformed, stale, or unclear.
- Canonical or portable storage never falls back to an unintended write path.
- No development workflow may weaken or bypass product trust-boundary checks.

## Human And Destructive Gates

- Sending a public-records request remains an explicit human action.
- Legal actions and external legal representations remain human-gated.
- Destructive or irreversible operations require explicit safeguards, exact
  target resolution, and the applicable human authorization.
- Changes with credential, data-loss, publication, production, or other
  irreversible external effects must stop before the acting step unless that
  exact action was authorized.

## Development Separation

Development plans, reviews, tasks, branches, and coordination state are not
product-ledger events. Never encode development orchestration into the product
ledger or weaken product controls to simplify development automation.
