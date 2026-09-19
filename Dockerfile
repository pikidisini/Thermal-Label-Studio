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

# Copy requirements and install
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY engine/ /app/engine/
COPY assets/ /app/assets/
COPY data_samples/ /app/data_samples/
COPY backend/ /app/backend/
# Runtime migration command reads the reviewed SQL baseline explicitly; it is
# never executed automatically during container startup.
COPY docs/database/ /app/docs/database/

# Copy built frontend assets from stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["python", "backend/run_server.py"]
