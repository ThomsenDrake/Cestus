# Tailnet Engineering Preview

This runbook prepares an authenticated local Cestus runtime for a separately
gated engineering preview on one concrete Tailscale-range address. It does not
authorize starting that runtime, creating or inspecting credentials, calling a
provider, development seeding, sending a PRR, legal action, export, or
publication.

## Prepare without listening

Build the static UI; do not use Vite development serving or `vite preview`.

```bash
npm run ui:build
```

Choose one concrete local address in either `100.64.0.0/10` or
`fd7a:115c:a1e0::/48`. Do not use `0.0.0.0`, `::`, loopback, RFC1918 LAN, or a
public address. Configure durable storage outside the repository. For example,
an operator may use an app-data directory:

```bash
npm run local:runtime:configure -- --bind tailnet --host <tailscale-address> --storage app-data --app-data-dir <durable-app-data-directory> --log-dir <durable-log-directory>
```

Alternatively, use a portable workspace that is outside the repository. The
configuration command creates its local authentication material; do not print,
copy, inspect, or share it.

Run the non-listening readiness check:

```bash
npm run local:preview:check
```

It returns only the bind mode, host, port, whether authentication is configured,
development-seed-disabled status, storage strategy, resolved static UI path,
and `ready`. It neither listens nor changes product or configuration state.

## Human verification before a separately gated live preview

An address inside a Tailscale allocation and observed on a local interface is
not proof that the address belongs to the intended Tailscale interface or that
tailnet ACLs permit only the intended peers. Before the separately authorized
live preview, the human operator must verify the selected interface/address in
their Tailscale administration and verify the applicable ACL posture.

Keep the runtime bound only to the selected concrete tailnet address. Do not
fall back to wildcard, LAN, public, or loopback binding for this preview. Do
not run Vite development serving, invoke a provider, enable development seed,
send a PRR, take legal action, export data, or publish from this flow.
