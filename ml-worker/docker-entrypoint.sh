#!/bin/sh
set -e

# If the volume mount at /app/models is empty (first run), seed it from the
# baked-in image copy at /app/models-seed so models survive container restarts.
if [ ! -d "/app/models/v1.0.0" ]; then
  echo "[ML Worker] Models not found in volume – seeding from image..."
  cp -r /app/models-seed/. /app/models/
  echo "[ML Worker] Models seeded successfully."
else
  echo "[ML Worker] Models already present in volume."
fi

exec uvicorn app:app --host 0.0.0.0 --port 8000

