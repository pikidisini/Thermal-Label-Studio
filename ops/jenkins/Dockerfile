FROM node:20-bookworm-slim AS node-runtime
FROM docker:29-cli AS docker-cli
FROM jenkins/jenkins:lts-jdk21

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip git curl ca-certificates tar \
    fonts-dejavu-core fonts-freefont-ttf fonts-liberation fontconfig libcups2 \
    && curl -fsSL https://github.com/RazrFalcon/resvg/releases/download/v0.44.0/resvg-linux-x86_64.tar.gz \
       | tar -xz -C /usr/local/bin && chmod +x /usr/local/bin/resvg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/bin/docker-compose /usr/local/bin/docker-compose
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && mkdir -p /usr/local/lib/docker/cli-plugins /usr/lib/docker/cli-plugins \
    && ln -s /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose \
    && ln -s /usr/local/libexec/docker/cli-plugins/docker-compose /usr/lib/docker/cli-plugins/docker-compose
USER jenkins
