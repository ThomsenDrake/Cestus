# Historical Factory Coordination Contracts

Status: informational. `docs/agentic/software-factory.md` is the sole current
development workflow authority.

`software-factory-mission-state.v1.json` and
`task136-bounded-assurance-v1.json` through
`task136-bounded-assurance-v4.json` are preserved Factory V1 coordination and
release-assurance records. They do not select work, assign ownership, impose
gates, or block green or yellow product tasks after the thin-factory cutover.
Their checker and tests are optional historical diagnostics and are not called
by the default readiness or verification path.

Other contracts in this directory may still define Cestus product behavior.
Retiring the development control plane does not weaken product ledger,
provenance, projection, approval, secret, legal, or no-fallback-write
contracts.
