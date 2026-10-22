# Uniqo - Your Style. Your Rarity.
# Container for Railway (or any Docker host). Standard-library Python only: nothing to pip install.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UNIQO_HOST=0.0.0.0 \
    # the database and admin uploads live on the mounted volume, so they survive redeploys
    UNIQO_DATA_DIR=/data \
    # Railway terminates HTTPS in front of the app: trust its X-Forwarded-* headers and send Secure cookies
    UNIQO_TRUST_PROXY=1 \
    UNIQO_SECURE_COOKIES=1 \
    # no guessable default admin password on a public server
    UNIQO_PUBLIC=1

WORKDIR /app
COPY server.py seed_data.py lobby_catalog.py ./
COPY public ./public

# Railway injects PORT; the server reads it (falls back to 8080 locally)
EXPOSE 8080
CMD ["python", "server.py"]
