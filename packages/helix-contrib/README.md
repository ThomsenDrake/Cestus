# helix-contrib

Apache-2.0 generic helpers over `@helix-db/helix-db` (`3.2.0`), shaped for
upstream contribution to HelixDB.

## Scope

This package contains no application-specific domain types. It provides:

- **Provenance records** (`sourceId`, `sha256:<64-hex>` `contentHash`, optional
  `locator`, and `authorityId`) validated on every recorded write.
- **Append-only writer** that refuses `drop`, `setProperty`, and `removeProperty`
  on recorded elements, allowing destruction only through an explicit target-scoped
  `rebuild(databaseName, entries)` replay and allowing provenance-chained node
  revisions only when `supersedesAuthorityIds` proves causal lineage from the
  recorded `authorityId` under the same `sourceId`.
- **Idempotent node and edge insertion** keyed by a caller-supplied stable key,
  working around non-deduplicating `addE` and re-reading edges by stable key.
- **Endpoint allowlist** validating `(fromLabel, edgeLabel, toLabel)` before write.
- **Generic text-span node** storing a locator, text, and `sha256:` span hash.
- **Thin `@helix-db/helix-db` `3.2.0` client wrapper** over `POST /v2/query` with
  `/healthz`, `/readyz`, `/v2/diagnostics`, and a telemetry-off write precondition
  (`DO_NOT_TRACK` and `HELIX_TELEMETRY_LEVEL=off`).
