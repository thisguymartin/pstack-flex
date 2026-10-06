#!/usr/bin/env bash
set -uo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
failed=()

step() {
  local name="$1"; shift
  printf '\n== %s\n' "$name"
  if "$@"; then
    printf 'ok: %s\n' "$name"
  else
    printf 'FAIL: %s\n' "$name"
    failed+=("$name")
  fi
}

in_dir() { (cd "$1" && shift && "$@"); }

pkg=plugins/pstack/skills/poteto-mode/scripts
step "install" in_dir "$repo/$pkg" bun install --frozen-lockfile
step "test" in_dir "$repo/$pkg" bun run test
step "typecheck" in_dir "$repo/$pkg" bun run typecheck

manifests=(
  .claude-plugin/marketplace.json
  .agents/plugins/marketplace.json
  plugins/pstack/.claude-plugin/plugin.json
  plugins/pstack/.codex-plugin/plugin.json
)
parse_manifests() {
  local path
  for path in "${manifests[@]}"; do
    bun -e "JSON.parse(await Bun.file('$repo/$path').text())" || { echo "invalid JSON: $path"; return 1; }
  done
}
step "manifests parse" parse_manifests
step "static invariants" env PSTACK_STATIC_ONLY=1 bash "$repo/tests/skill-collision-repro.sh"

if command -v claude >/dev/null 2>&1; then
  for target in . plugins/pstack; do
    step "claude plugin validate $target" claude plugin validate "$repo/$target"
  done
else
  printf '\nskip: claude plugin validate (claude CLI not installed)\n'
fi

if [ "$(id -u)" = "0" ]; then
  printf '\nnote: running as root. Two runner tests that make a file unreadable with chmod fail under root; CI runs as a normal user.\n'
fi

printf '\n'
if [ "${#failed[@]}" -eq 0 ]; then
  echo "local gate: all checks passed"
else
  echo "local gate: ${#failed[@]} failed"
  printf '  - %s\n' "${failed[@]}"
  exit 1
fi
