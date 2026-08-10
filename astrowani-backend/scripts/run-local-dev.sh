#!/usr/bin/env bash
# Runs the backend against the LOCAL astrowani_dev Postgres database (via
# PostgREST on port 3001), never the real production Supabase project — even
# though .env still has production credentials in it. This works because
# dotenv never overrides an already-set environment variable, so setting
# SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/JWT_SECRET here BEFORE node starts
# means .env's production values are simply skipped for this run.
#
# Prerequisites (see sql/dev_core_tables_bootstrap.sql + scripts/introspectCoreTables.js):
#   - Local Postgres running with an `astrowani_dev` database
#   - PostgREST running on port 3001, pointed at astrowani_dev
#     (config + binary under the scratchpad — see conversation history for setup)
#
# Usage: bash scripts/run-local-dev.sh
set -e
cd "$(dirname "$0")/.."

export SUPABASE_URL="http://localhost:3002"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoicG9zdGdyZXMiLCJpYXQiOjE3ODYzNTcwMDd9.pg1reU7ewFqTnVYIijs5YzUMByTZg6cgL6y0Vpi8rUg"
export JWT_SECRET="local-dev-only-backend-jwt-secret-never-used-in-prod-9f8e7d"

echo "Starting backend against LOCAL astrowani_dev (not production) ..."
node index.js
