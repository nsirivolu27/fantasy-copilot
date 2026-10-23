#!/bin/sh
set -e

# Assemble DATABASE_URL from the parts AWS Secrets Manager injects.
#
# RDS stores host, port, username, password and dbname as separate keys, and a
# task definition can only inject whole keys. Building the URL here keeps the
# password out of the task definition, CloudFormation and the console.
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"
  echo "[entrypoint] DATABASE_URL assembled for ${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] DATABASE_URL is not set and no DB_HOST was provided." >&2
  exit 1
fi

# Apply the schema on boot. `db push` is idempotent, so a restart is a no-op,
# and a rolling deployment that adds a column brings it with it.
echo "[entrypoint] applying schema"
node scripts/prisma-schema.mjs
./node_modules/.bin/prisma db push --schema=prisma/generated-schema.prisma --skip-generate

echo "[entrypoint] starting server on ${PORT:-3000}"
exec node server.js
