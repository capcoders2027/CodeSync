#!/bin/sh
set -e

echo "Applying Prisma schema to database..."
# prisma db push syncs the schema without requiring migration files.
# --accept-data-loss is safe here because we control the schema evolution.
npx prisma db push --accept-data-loss

echo "Starting server..."
exec npx tsx src/index.ts
