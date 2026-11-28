# HelixDB on the T5600 — Operator Runbook (Milestones 1 & 2)

This runbook brings up a pinned, disk-persistent, loopback-bound, telemetry-off
HelixDB server on the T5600 Linux machine, verifies restart persistence and
ledger isolation (Milestone 1), and loads one produced I-4 document into the
live Helix graph with rebuild verification (Milestone 2).

## Deployment Choice: Pinned Docker Image vs. Native

**Choice: Docker Compose (`ops/helix/docker-compose.yml`) pinned by image digest.**

Justification:
- Upstream `HelixDB/helix-db` releases prebuilt binaries only for the `helix`
  CLI (`v3.7.0`), not standalone `helix-server` binaries. The official
  standalone server artifact is the distroless OCI image
  `ghcr.io/helixdb/helixdb:v0.0.19` (`/bin/helix-server` as PID 1, nonroot
  `65532:65532`). Running natively requires either compiling the Rust workspace
  from source or extracting `/bin/helix-server` from the OCI layer.
- Docker Compose enforces exact digest pinning, nonroot isolation,
  `restart: unless-stopped`, graceful `SIGTERM` storage drain, and strict
  loopback publishing (`127.0.0.1:6969:8080`)—avoiding `helix start`'s wide
  interface publishing.
- Native on-disk SlateDB persistence works directly via
  `HELIX_DATA_DIR=/var/lib/helix` on a named Docker volume—no SeaweedFS sidecar
  is needed.

### Pinned Versions & Digests

- **Server image:** `ghcr.io/helixdb/helixdb:v0.0.19`
- **Multi-arch manifest digest:** `sha256:ad133cac47d17b8cc8ce9c75f6b68e270fde11a8e65b11139fdcc9502e5b7bf4`
- **`linux/amd64` manifest digest:** `sha256:16b709ad0d34a3a66a626fbc3eae94678ad1e71109af1fb548e42bfdc430b389`
- **`/bin/helix-server` binary SHA-256 (`linux/amd64`):** `cafd983cc9182008a9610046bc187373f6963a5d70be8bf6c1bb9cf0ffedc4b4`
- **TypeScript client pin:** `@helix-db/helix-db@3.2.0` (`POST /v2/query`),
  wrapped inside `packages/helix-contrib`.

## Prerequisites on the T5600

- Linux `x86_64` with Docker Engine + Docker Compose v2 (`docker compose version`)
- Node.js 22+ and npm (`npm ci` run in this repo)
- Poppler tools for PDF extraction (`sudo apt-get install -y poppler-utils` —
  provides `pdfinfo` and `pdftotext`; no cloud OCR is ever used)
- Tailscale installed and authenticated (Cestus `local-runtime` binds to the
  T5600 tailnet IP; HelixDB stays strictly on `127.0.0.1:6969`)

---

## Milestone 1: Bring Up HelixDB & Verify Safety Invariants

Run all commands below on the T5600 from the Cestus repo root.

### 1. Start HelixDB (loopback-only, disk-persistent, telemetry off)

```bash
docker compose -f ops/helix/docker-compose.yml pull
docker compose -f ops/helix/docker-compose.yml up -d
```

Verify the pinned image digest actually running:

```bash
docker inspect --format='{{.Config.Image}} -> {{index .RepoDigests 0}}' cestus-helixdb
```

### 2. Confirm Telemetry Is Off (Before Any Real Document Moves)

Verify the container environment has both `DO_NOT_TRACK=1` and
`HELIX_TELEMETRY_LEVEL=off` (read directly by `helix-server` in
`crates/metrics/src/cli/config.rs`):

```bash
docker inspect --format='{{range .Config.Env}}{{println .}}{{end}}' cestus-helixdb \
  | grep -E '^(DO_NOT_TRACK|HELIX_TELEMETRY_LEVEL)='
```

Expected output:

```text
DO_NOT_TRACK=1
HELIX_TELEMETRY_LEVEL=off
```

If you also installed the optional `helix` CLI on the T5600, disable CLI
telemetry as well and record its status:

```bash
helix metrics off && helix metrics status
```

Additionally, `packages/helix-contrib` refuses every write unless the calling
process environment also sets `DO_NOT_TRACK=1` and `HELIX_TELEMETRY_LEVEL=off`.

### 3. Confirm Health, On-Disk Storage, and Loopback-Only Binding

```bash
curl -sf http://127.0.0.1:6969/healthz && echo ""
curl -sf http://127.0.0.1:6969/readyz && echo ""
curl -sf http://127.0.0.1:6969/v2/diagnostics && echo ""
```

Confirm:
- `/readyz` returns `"ready":true` and `"storage":"open"`.
- `/v2/diagnostics` includes `"id":"storage.durability","status":"pass"` with
  `"HELIX_DATA_DIR is /var/lib/helix."` (proving disk storage, not memory).

Confirm loopback-only bind on the T5600:

```bash
ss -tlnp | grep 6969
```

Expected: `127.0.0.1:6969` only (never `0.0.0.0:6969` or `[::]:6969`).

From **another machine on your tailnet**, confirm the Helix port is unreachable:

```bash
nc -zv -w 3 <T5600-TAILNET-IP> 6969
```

Expected: connection refused / timed out.

### 4. Run the Milestone 1 Smoke Test (Restart Persistence + Synthetic Drop + Untouched Ledger)

```bash
DO_NOT_TRACK=1 HELIX_TELEMETRY_LEVEL=off npm run helix:smoke -- \
  --url http://127.0.0.1:6969 \
  --restart-cmd "docker compose -f ops/helix/docker-compose.yml restart helix"
```

If you already have a Cestus portable workspace at `/path/to/workspace`, pass
`--ledger /path/to/workspace/ledger/ontology.sqlite` to prove that specific
SQLite ledger file is byte-for-byte untouched by the write, restart, and drop.

Expected JSON result includes:
- `"ok": true`
- `"storageDurableOnDisk": true`
- `"restarted": true`
- `"persistedAcrossRestart": true`
- `"droppedAndConfirmedGone": true`
- `"ledgerUntouched": { ... }`

---

## Milestone 2: Load One Real Produced I-4 Document Into Live Helix

The real Seminole Sheriff, Orange County, and Osceola Corrections productions
are kept locally on the T5600 and are not in this repository.

### 1. Ensure a Portable Workspace Exists

If you do not yet have a portable workspace on the T5600:

```bash
npm run local:workspace:create -- \
  --workspace /srv/cestus/i4-workspace \
  --workspace-id ws_i4_corridor \
  --label "I-4 Corridor ICE Detention"
```

### 2. Place One Produced File in a Read-Only Folder and Run the Single Load Command

Put one real produced file (e.g., from Seminole Sheriff, Orange County, or
partial Osceola Corrections) in a dedicated directory such as
`/srv/cestus/incoming/seminole-doc-001/`, then run this **single command**:

```bash
DO_NOT_TRACK=1 HELIX_TELEMETRY_LEVEL=off \
CESTUS_HELIX_URL=http://127.0.0.1:6969 \
npm run helix:load-doc -- \
  --workspace /srv/cestus/i4-workspace \
  --source /srv/cestus/incoming/seminole-doc-001 \
  --source-id src_seminole_sheriff \
  --label "Seminole County Sheriff" \
  --scan scan_seminole_001 \
  --import imp_seminole_001
```

What this single command executes:
1. Verifies `DO_NOT_TRACK=1` + `HELIX_TELEMETRY_LEVEL=off`, Helix `/readyz`, and
   `/v2/diagnostics` on-disk durability.
2. Runs the existing Cestus ingestion CLI path in order:
   `register-source` -> `dry-run` -> `approve-import` (enforcing `imp_` prefix)
   -> `import` -> `parse` (`runParseJobs`).
3. Writes the `Document` node (plus `Passage` nodes if text was extracted, or
   marks `unextracted: true` with zero fabricated passages if the file is an
   unextracted scan) into the live Helix graph through `packages/helix-contrib`.
4. Cross-checks that the Helix `Document` node's `evidenceId` and `contentHash`
   match the SQLite `evidence.ingested` ledger event and the canonical blob
   bytes on disk.

### 3. Verify `GET /api/ontology/workspace` Reads Helix and Fails Closed When Helix Stops

Start Cestus `local-runtime` pointing at the workspace and loopback Helix
(use `--bind tailnet --host <T5600-TAILNET-IP>` when fronting over Tailscale):

```bash
DO_NOT_TRACK=1 HELIX_TELEMETRY_LEVEL=off \
CESTUS_LOCAL_STORAGE=portable-workspace \
CESTUS_WORKSPACE_ROOT=/srv/cestus/i4-workspace \
CESTUS_HELIX_URL=http://127.0.0.1:6969 \
npm run local:runtime
```

Query `/api/ontology/workspace` with your configured auth token:

```bash
curl -sf -H "Authorization: Bearer $CESTUS_LOCAL_AUTH_TOKEN" \
  http://127.0.0.1:8787/api/ontology/workspace
```

Stop HelixDB and confirm `/api/ontology/workspace` fails closed with HTTP `503`
(instead of reconstructing from the ledger):

```bash
docker compose -f ops/helix/docker-compose.yml stop helix
curl -i -H "Authorization: Bearer $CESTUS_LOCAL_AUTH_TOKEN" \
  http://127.0.0.1:8787/api/ontology/workspace
docker compose -f ops/helix/docker-compose.yml start helix
```

### 4. Verify Rebuild-From-Ledger Reproduces the Exact Same ID & Hash

Run `projection rebuild` for `--projection helix` (opens SQLite read-only,
drops the workspace's logical database in Helix, replays ledger events +
blobs/derivatives, and writes a fingerprint manifest under
`projections/helix/projection.json`):

```bash
DO_NOT_TRACK=1 HELIX_TELEMETRY_LEVEL=off \
CESTUS_HELIX_URL=http://127.0.0.1:6969 \
npm run workspace:ops -- projection rebuild \
  --root /srv/cestus/i4-workspace \
  --projection helix
```

Compare `projections/helix/projection.json` before and after a second rebuild:
`documents[].evidenceId`, `documents[].contentHash`, and
`fingerprint.provenanceDigest` match identically, and the SQLite ledger event
count is unchanged.

---

## Fronting With Tailscale Later

HelixDB itself stays bound to `127.0.0.1:6969` because the standalone server
has no built-in authentication. Access from other tailnet devices goes through
Cestus `local-runtime` configured with `--bind tailnet --host <T5600-TAILNET-IP>`
and its required auth token / one-time session bootstrap (see
`docs/operations/tailnet-engineering-preview.md`). Do not publish port `6969`
directly on `0.0.0.0` or the tailnet interface.

## Native Fallback (Without Docker)

If you ever need to run `helix-server` directly without Docker on Linux `x86_64`
(the same method used for live CI/VM verification), extract `/bin/helix-server`
from the pinned `v0.0.19` `linux/amd64` OCI layer, verify its SHA-256 equals
`cafd983cc9182008a9610046bc187373f6963a5d70be8bf6c1bb9cf0ffedc4b4`, and run it
with:

```bash
DO_NOT_TRACK=1 \
HELIX_TELEMETRY_LEVEL=off \
HELIX_HTTP_ADDR=127.0.0.1:6969 \
HELIX_GRPC_ADDR=127.0.0.1:6970 \
HELIX_DATA_DIR=/var/lib/cestus-helix \
HELIX_HOME=/var/lib/cestus-helix/.helix \
/usr/local/bin/helix-server
```
