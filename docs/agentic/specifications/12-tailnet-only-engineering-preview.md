# Tailnet-Only Engineering Preview Readiness

> **Development authority:** This is a non-authoritative product-requirement
> source. Historical status, execution, role, risk, repair, review, integration,
> and verification text below does not govern current work. Follow \`AGENTS.md\`,
> Compound Engineering, and \`SECURITY.md\`.

Status: approved by the initiating 2026-08-04 request.

## Desired Behavior

Cestus provides an operator-verifiable path for a built local runtime to be
served on one concrete address belonging to the Tailscale IPv4 or IPv6 ranges.
Tailnet mode fails closed instead of falling back to wildcard, loopback, LAN,
or public interface binding. A non-listening readiness command proves the
configuration, static build, storage posture, disabled development seed, and
authentication requirement without revealing authentication material or
opening a socket.

The preview remains a local engineering capability. This slice does not start
the runtime, configure or use a real credential, invoke a provider, seed data,
send a PRR, publish, create a production route, or alter any product approval,
legal, export, ledger, provenance, or destructive-operation gate.

## Observable Acceptance Examples

- Tailnet configuration without an explicit host, with `0.0.0.0`/`::`, or with
  a loopback, private-LAN, or public address is rejected before authentication
  material is generated and before a configuration file is created or changed.
- Concrete addresses in `100.64.0.0/10` and `fd7a:115c:a1e0::/48` are accepted
  as tailnet-address candidates; malformed and out-of-range addresses are not.
- Starting a tailnet runtime also verifies that its concrete address is present
  on a local network interface. An injected or stale tailnet-range address is
  rejected at server entry, before HTTP-handler, ledger, log-directory,
  browser-bootstrap-code, or server construction and before `listen`.
- The readiness command performs no network listen and reports only safe facts:
  bind mode/host/port, authentication configured as a boolean, development seed
  disabled, storage strategy, resolved static-build path, and an overall ready
  result. It never prints or returns the authentication token.
- Readiness fails when the mode is not `tailnet`, the address is wildcard or
  outside the tailnet ranges, authentication is absent, development seed is
  enabled, any resolved durable storage path is inside the repository, or the
  built UI entry point is absent or not a regular file. Storage safety is based
  on resolved path containment, not a strategy label alone.
- The operator runbook uses the authenticated local runtime and a durable
  app-data or portable-workspace store. It explicitly forbids Vite development
  serving, wildcard/LAN/public binding, provider or credential inspection,
  development seeding, PRR send, legal action, export, and publication.
- The runbook states that an address falling within the Tailscale ranges and
  being locally assigned does not by itself prove interface ownership or ACL
  policy; the human operator must verify the selected address and tailnet ACLs
  before the separately gated live preview.
- Existing loopback development behavior and every product safety invariant
  remain unchanged.

## Allowed Scope

- `docs/agentic/specifications/12-tailnet-only-engineering-preview.md`
- A new operator runbook under `docs/operations/**`.
- Narrow local-runtime tailnet address, configuration, server-start, readiness,
  and CLI code under `packages/local-runtime/src/**` plus focused tests under
  `packages/local-runtime/test/**`.
- `package.json` only for a safe, non-listening readiness script.
- No changes to ontology/product ledger semantics, evidence or projection code,
  approval consumption, provider integrations, PRR/legal/export/publication
  actions, production routing, dependencies, CI, or factory machinery.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `package.json`
- `packages/local-runtime/src/config.ts`
- `packages/local-runtime/src/config-file.ts`
- `packages/local-runtime/src/cli.ts`
- `packages/local-runtime/src/server.ts`
- `packages/local-runtime/src/auth.ts`
- `packages/local-runtime/test/config.test.ts`
- `packages/local-runtime/test/config-file.test.ts`
- `packages/local-runtime/test/cli.test.ts`
- `packages/local-runtime/test/server.test.ts`

## Risk Lane

Red because fail-closed tailnet binding and authenticated browser bootstrap are
network trust-boundary behavior. Implementation, deterministic tests, review,
integration, and pushing code are authorized; the actual live bind, real
credential creation/use, or any external effect remains human-gated and is not
performed by this slice.

## Targeted Verification

- `npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts packages/local-runtime/test/server.test.ts packages/local-runtime/test/tailnet-preview-readiness.test.ts`
- `npm run typecheck`
- `npm run ui:build`

Success means every listed test passes, TypeScript reports `typecheck passed`,
the production UI build completes, rejected configuration creates no token or
config write, rejected server startup creates no ledger or log path, and no
verification command opens a tailnet/public socket or reads a real credential.

## Integration Verification

Run `npm run verify` against the latest `neo` and add no failure beyond
`docs/agentic/baselines/2026-08-01-integration-verification.md`.

## Escalation Conditions

Escalate before any live tailnet/LAN/public bind, real credential creation or
use, provider invocation, seed, PRR send, legal action, export/publication,
production route, weakened safety gate, dependency addition, broader product
behavior, data-loss/irreversible action, or the same failure after two focused
repair attempts.
