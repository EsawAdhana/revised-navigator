#!/usr/bin/env bash
set -uo pipefail

BASE_URL="http://localhost:3000"
DEV_PID=""
RANDOM_EXIT=0
INVARIANT_EXIT=0

cleanup() {
  if [ -n "$DEV_PID" ]; then
    echo ""
    echo "Stopping dev server (pid $DEV_PID)..."
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

header() {
  echo ""
  echo "========================================"
  echo "  $1"
  echo "========================================"
}

check_server() {
  curl -sf "$BASE_URL" > /dev/null 2>&1
}

header "Stanford Root — Fuzzing Suite"

if check_server; then
  echo ""
  echo "Dev server already running at $BASE_URL"
else
  header "Starting dev server..."
  npm run dev > /dev/null 2>&1 &
  DEV_PID=$!

  echo "Waiting for dev server (pid $DEV_PID)..."
  ATTEMPTS=0
  MAX_ATTEMPTS=60
  while ! check_server; do
    sleep 1
    ATTEMPTS=$((ATTEMPTS + 1))
    if [ $ATTEMPTS -ge $MAX_ATTEMPTS ]; then
      echo "ERROR: Dev server did not start within ${MAX_ATTEMPTS}s"
      exit 1
    fi
  done
  echo "Dev server ready."
fi

header "1/2  Dumb Fuzzer (crash-only baseline)"
npx tsx scripts/dumb-fuzzer.ts --max-actions 100 || RANDOM_EXIT=$?

header "2/2  Invariant Oracle Fuzzer"
npx tsx scripts/invariant-fuzzer.ts --rounds 30 || INVARIANT_EXIT=$?

header "Summary"

echo ""
echo "Fuzzer              | Result File                    | Exit Code"
echo "--------------------|--------------------------------|----------"
printf "%-19s | %-30s | %s\n" "Dumb Fuzzer"       "random-fuzzer-results.json"    "$RANDOM_EXIT"
printf "%-19s | %-30s | %s\n" "Invariant Oracle"  "invariant-fuzzer-results.json" "$INVARIANT_EXIT"
echo ""
echo "Done. See *-results.json files for detailed output."
