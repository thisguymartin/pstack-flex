#!/usr/bin/env bash
# OpenRouter route battery from issue #7; evidence goes in the issue or PR.
# It spends real OpenRouter credit (cents), so it never runs in CI or
# check.sh. The key comes from OPENROUTER_API_KEY and is never printed or
# put on a command line.
#
#   OPENROUTER_API_KEY=... bash scripts/probe-openrouter.sh [model ...]
#
# Claude Code retries a bad gateway key for about three minutes before failing.
set -uo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
runner="$repo/plugins/pstack/skills/poteto-mode/scripts/runner/pstack-runner"
api="https://openrouter.ai/api/v1"

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "OPENROUTER_API_KEY is not set" >&2
  exit 2
fi
models=("$@")
if [ "${#models[@]}" -eq 0 ]; then
  models=(
    anthropic/claude-sonnet-5.5
    google/gemini-3.8-flash
    moonshotai/kimi-k3
    z-ai/glm-5.3
    qwen/qwen3.8-max-0902
  )
fi

out="$(mktemp -d "${TMPDIR:-/tmp}/openrouter-probes.XXXXXX")"
rows="$out/rows.tsv"
: > "$rows"

workspace() {
  local ws="$out/ws-$1" clue value
  clue="clue-$(openssl rand -hex 4).txt"
  value="PSF-$(openssl rand -hex 6)"
  mkdir -p "$ws"
  printf 'The value is in the file %s in this directory.\n' "$clue" > "$ws/start.txt"
  printf '%s\n' "$value" > "$ws/$clue"
  printf '%s' "$value" > "$out/expected-$1"
  printf '%s' "$ws"
}

lane() {
  local name="$1" model="$2" effort="$3" prompt="$4" cwd="$5" expected="$6"
  local dir="$out/$name"
  mkdir -p "$dir"
  printf '%s\n' "$prompt" > "$dir/prompt.md"
  "$runner" --parent claude --provider openrouter --model "$model" --effort "$effort" \
    --mode read-only --prompt "$dir/prompt.md" --cwd "$cwd" \
    --output "$dir/output.txt" --receipt "$dir/receipt.json" \
    --label "openrouter probe $name" >/dev/null 2>"$dir/stderr.txt"
  local got="" check="-"
  [ -f "$dir/output.txt" ] && got="$(tr -d '[:space:]' < "$dir/output.txt")"
  if [ -n "$expected" ]; then
    if [ "$got" = "$expected" ]; then check="match"; else check="mismatch"; fi
  fi
  if [ -f "$dir/receipt.json" ]; then
    jq -r --arg case "$name" --arg check "$check" '[
      $case, .model, .effort, .status, (.reportedModel // "-"),
      (.modelEvidence // "-"), $check, (.usage.outputTokens // "-"),
      (.usage.reasoningTokens // "-"),
      .elapsedMs, ((.error.message // "-") | gsub("[\n|]"; " ") | .[0:160])
    ] | @tsv' "$dir/receipt.json" >> "$rows"
  else
    printf '%s\t%s\t%s\tusage-error\t-\t-\t-\t-\t-\t-\t%s\n' "$name" "$model" "$effort" \
      "$(tr '\n|' '  ' < "$dir/stderr.txt" | cut -c1-160)" >> "$rows"
  fi
}

chain_prompt="Read start.txt in the current directory and follow what it says. Reply with only the value you find, nothing else."
puzzle_prompt="Do not use any tools. How many prime numbers are there below 300? Reply with only the number."

for model in "${models[@]}"; do
  slug="${model//[^A-Za-z0-9]/-}"
  ws="$(workspace "$slug")"
  lane "chain-$slug" "$model" high "$chain_prompt" "$ws" "$(cat "$out/expected-$slug")"
  lane "low-$slug" "$model" low "$puzzle_prompt" "$ws" "62"
  lane "high-$slug" "$model" high "$puzzle_prompt" "$ws" "62"
done

catalog="$out/catalog.json"
curl -fsS "$api/models" -o "$catalog"
no_tools="$(jq -r '[.data[] | select((.supported_parameters // []) | index("tools") | not)
  | select(.id | test(":") | not) | select((.pricing.prompt | tonumber? // 1) > 0)
  | select((.pricing.prompt | tonumber? // 1) < 0.000001)][0].id // empty' "$catalog")"
free_tools="$(jq -r '[.data[] | select(.id | endswith(":free"))
  | select((.supported_parameters // []) | index("tools"))][0].id // empty' "$catalog")"

ws="$(workspace edge)"
expected="$(cat "$out/expected-edge")"
lane "wrong-id" "z-ai/glm-does-not-exist" high "$chain_prompt" "$ws" "$expected"
OPENROUTER_API_KEY="sk-or-v1-invalid-probe" lane "bad-key" "z-ai/glm-5.3" high "$chain_prompt" "$ws" "$expected"
lane "router" "openrouter/auto" high "$chain_prompt" "$ws" "$expected"
lane "alias" "~google/gemini-flash-latest" high "$chain_prompt" "$ws" "$expected"
[ -n "$no_tools" ] && lane "no-tools" "$no_tools" high "$chain_prompt" "$ws" "$expected"
[ -n "$free_tools" ] && lane "free" "$free_tools" high "$chain_prompt" "$ws" "$expected"

# What OpenRouter itself says it served. The header goes through stdin so
# the key never reaches a process argument list.
served="$out/served.tsv"
: > "$served"
for model in "${models[@]}" "~google/gemini-flash-latest" ${free_tools:+"$free_tools"}; do
  body="$(jq -nc --arg model "$model" \
    '{model: $model, max_tokens: 512, reasoning: {effort: "low"},
      messages: [{role: "user", content: "Reply with OK."}]}')"
  printf 'header = "Authorization: Bearer %s"\n' "$OPENROUTER_API_KEY" |
    curl -sS --config - -H "Content-Type: application/json" -d "$body" \
      "$api/chat/completions" > "$out/served-${model//[^A-Za-z0-9]/-}.json"
  jq -r --arg requested "$model" '[$requested, (.model // "-"), (.provider // "-"),
    ((.error.message // "-") | .[0:120])] | @tsv' \
    "$out/served-${model//[^A-Za-z0-9]/-}.json" >> "$served"
done

{
  echo "| Case | Requested model | Effort | Status | Reported model | Evidence | Output check | Output tokens | Reasoning tokens | Elapsed ms | Error |"
  echo "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  sed 's/\t/ | /g; s/^/| /; s/$/ |/' "$rows"
  echo
  echo "| Requested model | OpenRouter served | Host | Error |"
  echo "| --- | --- | --- | --- |"
  sed 's/\t/ | /g; s/^/| /; s/$/ |/' "$served"
} > "$out/results.md"

cat "$out/results.md"
echo
echo "receipts, outputs, and stderr: $out"
