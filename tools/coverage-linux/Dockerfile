ARG CI_APPLICATION_IMAGE=thermal-label-studio:lan-aa5838ce8387
FROM node:20-bookworm-slim AS node-runtime
FROM docker:29-cli AS docker-runtime
FROM ${CI_APPLICATION_IMAGE} AS renderer

FROM python:3.14-slim-bookworm

WORKDIR /workspace
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=docker-runtime /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-runtime /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
COPY --from=renderer /usr/local/bin/resvg /renderer/resvg
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium curl ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/workspace/backend \
    TLS_AUTH_LOCAL_HTTP=true \
    TLS_AUTH_ORIGINS=http://127.0.0.1:8000 \
    E2E_BASE_URL=http://127.0.0.1:8000 \
    PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium \
    TLS_TEST_BASE_URL=http://127.0.0.1:8000 \
    CI_RENDERER_PATH=/renderer/resvg \
    CI_FONT_PATH=/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf \
    TLS_FIXTURE_FONT_PATH=/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf \
    TLS_FIXTURE_FONT_FAMILY=Arial

COPY requirements.txt ./requirements.txt
RUN python3 -m pip install --break-system-packages --no-cache-dir -r requirements.txt

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

COPY . .
RUN cd frontend && npm run build

RUN chmod 755 ./tools/coverage-linux/run.sh

ENTRYPOINT ["/workspace/tools/coverage-linux/run.sh"]
