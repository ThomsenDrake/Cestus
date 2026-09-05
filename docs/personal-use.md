# Cestus personal-use startup and recovery (Phase 1)

Use Node 24 or newer with built-in `node:sqlite`, and this repository's installed dependencies (`npm ci` for a fresh checkout). The existing production server serves both the built UI and APIs. No service manager, installer, Tailscale, provider account, or development seed is required.

## First disposable workspace

Run from `/home/drake/Projects/Cestus`. These commands keep the config, generated test credential, and portable workspace outside the checkout:

```bash
export CESTUS_TRIAL_DIR="$(mktemp -d /tmp/cestus-trial.XXXXXX)"
export CESTUS_LOCAL_CONFIG_PATH="$CESTUS_TRIAL_DIR/runtime.config.json"
npm run ui:build
npm run local:workspace:create -- --workspace "$CESTUS_TRIAL_DIR/workspace" --label "Personal trial" --created-by "local-operator"
npm run local:runtime:configure -- --storage portable-workspace --workspace "$CESTUS_TRIAL_DIR/workspace" --operator-label "Local investigator" --bind loopback --port 8787 --no-dev-seed --log-dir "$CESTUS_TRIAL_DIR/logs"
npm run local:runtime
```

Open the **browser session URL printed by the server**. It grants the configured operator's session, is usable once, and expires after ten minutes. Keep it private. The HttpOnly, SameSite=Strict session expires after eight hours or a server restart. Restart and open the new link to sign in again. A plain visit to the server displays session-required guidance. Use the same host as the printed link; the cookie is host-specific.

On Command, click **New request**, complete the existing PRR draft fields, and choose **Create draft**. No correspondence is sent. Stop with Ctrl-C, run `npm run local:runtime` again in the same shell, open the new session URL, and find the saved draft under Requests.

For a durable daily workspace, choose a persistent path instead of `/tmp`. Keep `CESTUS_LOCAL_CONFIG_PATH` outside the portable workspace and set it again in each new shell. `configure` preserves the operator ID and credential unless credential rotation is requested. `--operator-label` changes its display name without changing identity. Do not recreate an existing workspace.

```bash
npm run local:runtime:health
npm run local:runtime:config
```

`health` contacts the configured server with a timeout and exits nonzero when unreachable or storage is unavailable. `config` only prints configuration with the credential redacted. In the browser, **Refresh workspace status** checks the active workspace, operator, and durable location; the status also refreshes every 15 seconds. Existing operator diagnostics remain available on Command.

## Storage and session recovery

- **Backend unavailable:** start the server, check the configured host/port, and check for a port conflict. A saved configuration does not mean Cestus is running.
- **Session required:** use the current unused session URL. Restart for a fresh link if needed. Do not put bearer credentials in browser storage or URLs.
- **Workspace unavailable:** stop Cestus; reconnect the drive or restore the complete workspace; verify the configured root and workspace identity; restart. Cestus latches a detected storage loss until restart. It never switches a missing portable workspace to repository-local SQLite. A missing ledger must be restored, not recreated as an empty database.
- **No portable workspace mounted:** configure the documented portable path and restart. Legacy storage modes lack the portable-workspace guarantees.
- **Credential rotation:** stop Cestus, repeat `local:runtime:configure` with the same config path plus `--rotate-auth-token`, then restart. Keep the mode-0600 config private and outside backups intended to carry evidence only.

Authenticated tailnet access remains optional using the existing `--bind tailnet --host <assigned-tailnet-IP>` configuration. Browser origins must exactly match the serving address and port. Phase 1 verification uses loopback only; it does not test or authorize external exposure.

## Stopped-runtime copy and restore

Practice this with disposable data before using real investigations. Stop every runtime and CLI writer first and wait for exit. Copy the **entire workspace**, including manifest, ledger, originals, derivatives, and metadata, into a new destination. Do not copy over an existing target. Keep the credential-bearing runtime config outside the copy.

```bash
# After Ctrl-C has stopped Cestus; these names must not already exist:
cp -a -- "$CESTUS_TRIAL_DIR/workspace" "$CESTUS_TRIAL_DIR/backup"
diff -qr -- "$CESTUS_TRIAL_DIR/workspace" "$CESTUS_TRIAL_DIR/backup"
cp -a -- "$CESTUS_TRIAL_DIR/backup" "$CESTUS_TRIAL_DIR/restored"
diff -qr -- "$CESTUS_TRIAL_DIR/backup" "$CESTUS_TRIAL_DIR/restored"
npm run local:runtime:configure -- --storage portable-workspace --workspace "$CESTUS_TRIAL_DIR/restored" --no-dev-seed
npm run local:runtime
```

Open the new session link and recover the draft. Configure reads and pins the restored workspace ID. This is a manual stopped-copy procedure, not online backup automation or a power-loss/disk-full recovery guarantee. If a copy fails, retain the source and use a new empty destination for the next attempt.

## Provisional limits

The synthetic corpus is in `test-data/personal-investigation/`; it is never seeded into the UI. Real corpus composition, supported extraction formats, sensitivity, and growth limits are undecided. Phase 1 supports the existing local PRR drafting/readback controls and diagnostics. Document extraction, provider analysis, ontology changes, cross-case discovery, and competing-explanation investigation runs remain future phases. A queued job or configured provider is not proof of completed analysis. No provider call is needed for this trial.
