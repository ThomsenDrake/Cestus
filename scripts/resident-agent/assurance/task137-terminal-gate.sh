#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -- "$script_dir/../../.." && pwd -P)"
cd "$repo_root"

protected_pattern='mounted-artifact-authority-operation|FactoryIssuedMountedRuntimeCapture|FactoryIssuedMountedRuntimeSourceHighWater|FactoryIssuedMountedWorkspaceSnapshot|LocalRuntimeHandle|captureFactoryIssuedMountedRuntime|inspectFactoryIssuedMountedRuntimeCapture|issueMountedArtifactAuthorityOperationForFactory|registerMountedArtifactAuthorityIssuerForWakeRuntime|inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores|MountedArtifactAuthorityOperation|PortableMountedArtifactAuthorityOperationInspection|assertPortableWorkspaceLifecyclePortsForMountedArtifactAuthority|inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority|PortableWorkspaceLifecyclePorts|PortableWorkspaceMountedFacts'

assert_no_rg_match() {
  local pattern="$1"
  shift
  local status
  set +e
  rg -n "$pattern" "$@" </dev/null
  status=$?
  set -e
  if test "$status" -eq 0; then
    return 1
  fi
  if test "$status" -eq 1; then
    return 0
  fi
  return "$status"
}

npm test -- \
  packages/local-runtime/test/mounted-artifact-authority-operation.test.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts \
  packages/local-runtime/test/portable-workspace-lifecycle.test.ts \
  packages/local-runtime/test/runtime-handle-mounted-authority.test.ts \
  packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts \
  packages/agent/test/wake-supervisor.test.ts \
  </dev/null
printf '%s\n' "TASK137_GATE_STAGE_OK tests"

npm run typecheck </dev/null
printf '%s\n' "TASK137_GATE_STAGE_OK typecheck"

policy_log="$(mktemp)"
if ! npm test -- packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts >"$policy_log" 2>&1 </dev/null; then
  cat "$policy_log" >&2
  rm -f "$policy_log"
  exit 1
fi
if test "$(grep -c '^TASK137_POLICY_CORPUS_OK allowed=8 rejected=20$' "$policy_log")" -ne 1; then
  cat "$policy_log" >&2
  rm -f "$policy_log"
  exit 1
fi
rm -f "$policy_log"
printf '%s\n' "TASK137_GATE_STAGE_OK source-policy"

test ! -e packages/local-runtime/src/index.ts </dev/null
assert_no_rg_match "$protected_pattern" packages/agent/src/index.ts
manifest_files=(package.json)
while IFS= read -r -d '' manifest_path; do
  manifest_files+=("$manifest_path")
done < <(find packages -maxdepth 2 -name package.json -print0)
assert_no_rg_match "$protected_pattern" "${manifest_files[@]}"
printf '%s\n' "TASK137_GATE_STAGE_OK package-boundary"

npm run factory:check </dev/null
printf '%s\n' "TASK137_GATE_STAGE_OK factory-readiness"

git diff --check </dev/null
test -z "$(git status --porcelain </dev/null)"
test ! -L node_modules </dev/null
printf '%s\n' "TASK137_GATE_STAGE_OK checkout"

printf '%s\n' "TASK137_GATE_COMPLETE stages=6"
