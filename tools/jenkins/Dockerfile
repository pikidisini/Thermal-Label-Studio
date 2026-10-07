# The controller runs the source gate and bundled pinned SonarScanner. Docker
# CLI/Compose are present only for source-only `docker compose config` tests;
# this image never mounts a Docker socket and has no deploy logic.
FROM node:22.20.0-bookworm AS node_runtime
FROM python:3.14-slim-bookworm AS python_runtime
FROM sonarsource/sonar-scanner-cli:12.2.0.4256_8.1.0 AS sonar_scanner
FROM docker:29-cli AS docker_cli
FROM thermal-label-studio:local AS tested_application

FROM jenkins/jenkins:2.581-jdk21

USER root
COPY --from=node_runtime /usr/local/ /usr/local/
COPY --from=python_runtime /usr/local/ /usr/local/
COPY --from=sonar_scanner /opt/sonar-scanner /opt/sonar-scanner
COPY --from=docker_cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker_cli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
COPY --from=tested_application /usr/local/bin/resvg /opt/ci/resvg
RUN apt-get update \
    && apt-get install -y --no-install-recommends rsync fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/sonar-scanner/bin:${PATH}"
ENV CI_RENDERER_PATH=/opt/ci/resvg \
    CI_FONT_PATH=/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ci/browsers
COPY frontend/package.json frontend/package-lock.json /opt/ci/browser-tooling/
RUN cd /opt/ci/browser-tooling \
    && npm ci --ignore-scripts \
    && node node_modules/playwright/cli.js install --with-deps chromium \
    && chmod -R a+rX /opt/ci/browsers \
    && rm -rf /opt/ci/browser-tooling
USER jenkins
