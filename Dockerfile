# Application image for Studio, rendering and layout persistence.
FROM node:22-alpine AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/index.html frontend/vite.config.js frontend/postcss.config.js frontend/tailwind.config.js ./
COPY frontend/src ./src
RUN npm run build

# Linux/amd64 only: the renderer archive is fixed and must be independently
# checksum-pinned before an authorized build. No unverified download fallback.
FROM debian:bookworm-slim AS renderer-builder
ARG RESVG_SHA256
RUN printf '%s' "$RESVG_SHA256" | grep -Eq '^[a-f0-9]{64}$' \
    && apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl -fSL https://github.com/RazrFalcon/resvg/releases/download/v0.44.0/resvg-linux-x86_64.tar.gz -o /tmp/resvg.tar.gz \
    && printf '%s  /tmp/resvg.tar.gz\n' "$RESVG_SHA256" | sha256sum -c - \
    && mkdir /renderer && tar -xzf /tmp/resvg.tar.gz -C /renderer \
    && chmod 755 /renderer/resvg

FROM python:3.14-slim-bookworm AS application-runner
RUN apt-get update && apt-get install -y --no-install-recommends fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home fixture
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY --from=renderer-builder /renderer/resvg /usr/local/bin/resvg
COPY backend/app /app/backend/app
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist
ENV TLS_BIND_HOST=0.0.0.0 \
    PYTHONPATH=/app/backend \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TLS_RENDERER_PATH=/usr/local/bin/resvg \
    TLS_FIXTURE_FONT_PATH=/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf \
    TLS_FIXTURE_FONT_FAMILY="Liberation Sans" \
    TLS_FRONTEND_DIST=/app/frontend/dist
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import json,urllib.request; r=urllib.request.urlopen('http://127.0.0.1:8000/ready', timeout=3); assert json.load(r)=={'status':'ready'}"
CMD ["python", "-m", "app.run"]
