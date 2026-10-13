#!/usr/bin/env bash
set -euo pipefail

# Each harness gets its own disposable repository and history.
scratch="$(mktemp -d "${TMPDIR:-/tmp}/pstack-correct.XXXXXX")"
cd "$scratch"
git init -q -b main
git config user.name 'Martin Patino'
git config user.email 'mpatino117@gmail.com'

cat > package.json <<'EOF'
{"name":"correct-synthetic-fixture","private":true,"type":"module","scripts":{"test":"bun test"}}
EOF
cat > ticket.js <<'EOF'
export function formatTicket(id) {
  return `TICKET-${id.toUpperCase()}`;
}
EOF
for consumer in invoice receipt; do
  cat > "$consumer.js" <<'EOF'
import { formatTicket } from './ticket.js';
export function render(id) {
  return formatTicket(id);
}
EOF
done
cat > ticket.test.js <<'EOF'
import { expect, test } from 'bun:test';
import { render as invoice } from './invoice.js';
import { render as receipt } from './receipt.js';
test('documents render text', () => {
  expect(typeof invoice('ab12')).toBe('string');
  expect(typeof receipt('ab12')).toBe('string');
});
EOF
cat > AGENTS.md <<'EOF'
# Synthetic ticket documents

Ticket references must use `TICKET-` and an uppercase ID in every document.
`ticket.js:formatTicket` owns formatting. Run `bun run test` locally and in CI.
Only ticket rendering is in scope. Preserve `unrelated.js` and do not commit
without a separate request. Do not add AI attribution to commits.
EOF
cat > unrelated.js <<'EOF'
// Deliberately unrelated judgment call; leave this file alone.
export const displayPreference = 'compact';
EOF
mkdir -p .github/workflows
cat > .github/workflows/test.yml <<'EOF'
name: test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2
      - run: bun run test
EOF
git add package.json ticket.js invoice.js receipt.js ticket.test.js AGENTS.md unrelated.js .github/workflows/test.yml
git -c commit.gpgsign=false commit -q -m 'test: establish synthetic ticket formatting contract' -m 'Keep both document renderers on the shared uppercase formatter.'
git switch -q -c repeated-ticket-mistakes
cat > invoice.js <<'EOF'
export function render(id) {
  return `TICKET-${id.toLowerCase()}`;
}
EOF
git add invoice.js
git -c commit.gpgsign=false commit -q -m 'feat: render invoice ticket locally' -m 'Synthetic mistake: duplicate formatting and lowercase the identifier.'
cat > receipt.js <<'EOF'
export function render(id) {
  return `TICKET-${id.toLowerCase()}`;
}
EOF
git add receipt.js
git -c commit.gpgsign=false commit -q -m 'feat: render receipt ticket locally' -m 'Synthetic repeat: copy the invoice formatter instead of its shared owner.'
printf '%s\n' "$scratch"
