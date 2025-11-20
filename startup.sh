#!/bin/sh

# Generate Prisma Client
npx prisma generate

# Retry applying schema until the database is reachable
MAX_ATTEMPTS=30
SLEEP_SECONDS=2
ATTEMPT=1

echo "Applying Prisma schema to the database (up to $MAX_ATTEMPTS attempts)..."
until npx prisma db push; do
  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    echo "Failed to apply Prisma schema after $MAX_ATTEMPTS attempts. Exiting."
    exit 1
  fi
  echo "Database not ready yet (attempt $ATTEMPT/$MAX_ATTEMPTS). Retrying in ${SLEEP_SECONDS}s..."
  ATTEMPT=$((ATTEMPT + 1))
  sleep "$SLEEP_SECONDS"
done

# Start the application
node main.js
