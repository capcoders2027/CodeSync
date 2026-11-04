FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py .
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

# Copy pre-trained models into a seed directory inside the image.
# The actual /app/models is a Docker volume mount; on first run the entrypoint
# copies from /app/models-seed into /app/models so models persist across restarts.
COPY models/ models-seed/

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Run entrypoint (seeds models if needed, then starts uvicorn)
CMD ["./docker-entrypoint.sh"]
