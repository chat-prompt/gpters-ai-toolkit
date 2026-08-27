#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
COMPOSE_FILE="$REPOSITORY_ROOT/infra/ax-local/compose.yml"
REBUILD_DATABASE="gpters_ax_rebuild"
MIGRATIONS_DIR="${AX_LOCAL_MIGRATIONS_DIR:-/migrations}"
FIXTURES_DIR="${AX_LOCAL_FIXTURES_DIR:-/ax-local}"

compose() {
  docker-compose --context colima-gpters-ax -f "$COMPOSE_FILE" "$@"
}

run_sql_file() {
  database=$1
  file=$2
  compose exec -T postgres psql \
    --username gpters \
    --dbname "$database" \
    --set ON_ERROR_STOP=1 \
    --file "$file"
}

compose up -d --wait postgres

# This script is intentionally scoped to one synthetic local database. It never
# removes the compose volume or touches the regular gpters_ax_local database.
compose exec -T postgres dropdb \
  --username gpters \
  --if-exists \
  "$REBUILD_DATABASE"
compose exec -T postgres createdb \
  --username gpters \
  "$REBUILD_DATABASE"

for migration in \
  0000_spooky_sabra.sql \
  0001_lying_senator_kelly.sql \
  0002_useful_sentinel.sql \
  0003_far_mentallo.sql \
  0004_slippery_oracle.sql \
  0005_many_the_initiative.sql \
  0006_careful_jackal.sql \
  0007_sticky_wasp.sql \
  0008_pretty_johnny_storm.sql \
  0008_full_text_search.sql \
  0009_comments.sql \
  0010_mcp_audit_logs.sql \
  0011_oauth_access_tokens.sql \
  0012_add_readme_to_search.sql \
  0013_add_vector_search.sql \
  0014_halfvec_hnsw_index.sql \
  0015_mcp_servers_metadata.sql \
  0016_cli_tools.sql \
  0017_skill_events_exercise.sql \
  0018_catalog_source_tracking.sql \
  0019_evo_failure_patterns.sql \
  0020_restore_vector_indexes.sql \
  0021_evo_retry_tracking.sql \
  0022_ax_subscriptions.sql \
  0023_ax_client_usage.sql
do
  run_sql_file "$REBUILD_DATABASE" "$MIGRATIONS_DIR/$migration"
done

# Organization support used a programmatic migration, so replay its schema
# prerequisite explicitly before loading the backfill fixture.
run_sql_file "$REBUILD_DATABASE" "$FIXTURES_DIR/bootstrap-org-support.sql"

# The 0024 invariant requires exactly one active gpters organization. This
# fixture also exercises the 0028 identity backfill and duplicate cleanup.
run_sql_file "$REBUILD_DATABASE" "$FIXTURES_DIR/seed-pre-0026.sql"

for migration in \
  0024_single_gpters_catalog.sql \
  0025_ax_agent_telemetry_batches.sql \
  0026_ax_usage_collector_state.sql \
  0027_member_lifecycle.sql \
  0028_ax_client_usage_user_id.sql \
  0029_ax_skill_execution_attempts.sql \
  0030_ax_execution_lifecycle.sql
do
  run_sql_file "$REBUILD_DATABASE" "$MIGRATIONS_DIR/$migration"
done

run_sql_file "$REBUILD_DATABASE" "$FIXTURES_DIR/seed-post-0028.sql"
run_sql_file "$REBUILD_DATABASE" "$FIXTURES_DIR/refresh-test-agent.sql"
run_sql_file "$REBUILD_DATABASE" "$FIXTURES_DIR/refresh-demo-states.sql"
run_sql_file "$REBUILD_DATABASE" "$FIXTURES_DIR/refresh-journey-demo.sql"
run_sql_file "$REBUILD_DATABASE" "$FIXTURES_DIR/refresh-execution-demo.sql"
run_sql_file "$REBUILD_DATABASE" "$FIXTURES_DIR/refresh-agent-telemetry-demo.sql"

compose exec -T postgres psql \
  --username gpters \
  --dbname "$REBUILD_DATABASE" \
  --set ON_ERROR_STOP=1 \
  --command "
DO \$\$
DECLARE
  active_members integer;
  catalog_skills integer;
  linked_usage_rows integer;
  journey_sessions integer;
  execution_attempts integer;
  telemetry_batches integer;
BEGIN
  SELECT count(*) INTO active_members
  FROM org_memberships
  WHERE org_id = 'local-org-gpters' AND status = 'active';

  SELECT count(*) INTO catalog_skills
  FROM catalog_items
  WHERE type = 'skill';

  SELECT count(*) INTO linked_usage_rows
  FROM ax_client_usage
  WHERE user_id IS NOT NULL;

  SELECT count(*) INTO journey_sessions
  FROM mcp_sessions
  WHERE session_id LIKE 'local-journey-%';

  SELECT count(*) INTO execution_attempts
  FROM ax_skill_execution_attempts;

  SELECT count(*) INTO telemetry_batches
  FROM ax_agent_telemetry_batches;

  IF active_members <> 20 THEN
    RAISE EXCEPTION 'Expected 20 active members, found %', active_members;
  END IF;
  IF catalog_skills <> 60 THEN
    RAISE EXCEPTION 'Expected 60 skills, found %', catalog_skills;
  END IF;
  IF linked_usage_rows <> 3 THEN
    RAISE EXCEPTION 'Expected 3 linked and deduplicated usage rows, found %', linked_usage_rows;
  END IF;
  IF journey_sessions <> 4 THEN
    RAISE EXCEPTION 'Expected 4 journey fixture sessions, found %', journey_sessions;
  END IF;
  IF execution_attempts <> 6 THEN
    RAISE EXCEPTION 'Expected 6 execution attempts, found %', execution_attempts;
  END IF;
  IF telemetry_batches <> 5 THEN
    RAISE EXCEPTION 'Expected 5 telemetry batches, found %', telemetry_batches;
  END IF;
END \$\$;

SELECT
  current_database() AS database,
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM org_memberships WHERE status = 'active') AS active_members,
  (SELECT count(*) FROM catalog_items WHERE type = 'skill') AS skills,
  (SELECT count(*) FROM skill_events) AS skill_events,
  (SELECT count(*) FROM ax_client_usage) AS usage_rows,
  (SELECT count(*) FROM ax_skill_execution_attempts) AS execution_attempts,
  (SELECT count(*) FROM ax_agent_telemetry_batches) AS telemetry_batches;
"

printf '%s\n' "Clean isolated rebuild verified: $REBUILD_DATABASE"
