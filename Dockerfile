# Multi-stage Dockerfile for Thermal Label Studio
# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Python FastAPI Backend with resvg and font dependencies
FROM python:3.11-slim AS backend-runner

# Install system dependencies for fonts, resvg and Cairo/Pango rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    fonts-liberation \
    fontconfig \
    libcups2 \
    curl \
    tar \
    ca-certificates \
    && curl -fsSL https://github.com/RazrFalcon/resvg/releases/download/v0.44.0/resvg-linux-x86_64.tar.gz \
       | tar -xz -C /usr/local/bin && chmod +x /usr/local/bin/resvg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root engine dependencies and requirements
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY web_app/backend/requirements.txt ./web_app_requirements.txt
RUN pip install --no-cache-dir -r web_app_requirements.txt

# Copy source code
COPY engine/ /app/engine/
COPY assets/ /app/assets/
COPY web_app/backend/ /app/web_app/backend/

# Copy built frontend assets from stage 1
COPY --from=frontend-builder /app/frontend/dist /app/web_app/frontend/dist

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["python", "web_app/backend/run_server.py"]
