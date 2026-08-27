#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
COMPOSE_FILE="$REPOSITORY_ROOT/infra/ax-local/compose.yml"
LOCAL_TEST_TOKEN="mcp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
ATTEMPT_ID=$(node -e "console.log(require('node:crypto').randomUUID())")
START_EVENT_ID=$(node -e "console.log(require('node:crypto').randomUUID())")
EVENT_ID=$(node -e "console.log(require('node:crypto').randomUUID())")

compose() {
  docker-compose --context colima-gpters-ax -f "$COMPOSE_FILE" "$@"
}

web_status=$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3002/api/mcp || true)
if [ "$web_status" != "200" ] && [ "$web_status" != "401" ]; then
  echo "AX local web server is not running at http://127.0.0.1:3002" >&2
  echo "Run 'pnpm ax:local:dev' in another terminal first." >&2
  exit 1
fi

compose --profile test-agent run --rm --no-deps \
  -e GPTERS_TOKEN="$LOCAL_TEST_TOKEN" \
  -e ATTEMPT_ID="$ATTEMPT_ID" \
  -e START_EVENT_ID="$START_EVENT_ID" \
  -e EVENT_ID="$EVENT_ID" \
  test-agent

attempt_row=""
poll_count=0
while [ "$poll_count" -lt 20 ]; do
  attempt_row=$(compose exec -T postgres psql \
    --username gpters \
    --dbname gpters_ax_local \
    --tuples-only \
    --no-align \
    --command "SELECT status || '|' || validation_method || '|' || validation_passed || '|' || agent || '|' || agent_id || '|' || start_observed || '|' || source || '|' || skill_id FROM ax_skill_execution_attempts WHERE attempt_id = '$ATTEMPT_ID';")
  [ -n "$attempt_row" ] && break
  poll_count=$((poll_count + 1))
  sleep 0.25
done

expected="success|artifact|true|test-agent|ax-isolated-test-agent|true|aitk|local-skill-60"
if [ "$attempt_row" != "$expected" ]; then
  echo "Execution report verification failed: ${attempt_row:-missing}" >&2
  exit 1
fi

event_count=$(compose exec -T postgres psql \
  --username gpters \
  --dbname gpters_ax_local \
  --tuples-only \
  --no-align \
  --command "SELECT count(*) FROM ax_skill_execution_events WHERE event_id = '$EVENT_ID' AND phase = 'completed';")

if [ "$event_count" != "1" ]; then
  echo "Idempotency verification failed: expected 1 row, found $event_count" >&2
  exit 1
fi

phase_count=$(compose exec -T postgres psql \
  --username gpters \
  --dbname gpters_ax_local \
  --tuples-only \
  --no-align \
  --command "SELECT count(*) FROM ax_skill_execution_events WHERE attempt_id = '$ATTEMPT_ID';")
if [ "$phase_count" != "2" ]; then
  echo "Lifecycle verification failed: expected start and completion events, found $phase_count" >&2
  exit 1
fi

echo "Verified local execution report: $attempt_row"
echo "Verified idempotent retry: $event_count row"
echo "Verified lifecycle events: $phase_count rows"
