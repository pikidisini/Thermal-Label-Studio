# Local image provenance

This is the declared image provenance for the local stack. A pinned tag fixes
the selected release name, but does not record an immutable digest. Record the
resolved `RepoDigests` from the actual authorized deployment separately; this
document does not claim that an image was pulled or built merely because it is
listed here.

| Local role | Declared image or base | Publisher/provenance | Status and constraint |
| --- | --- | --- | --- |
| Studio application | `thermal-label-studio:local`, built from `node:22-alpine`, `debian:bookworm-slim`, and `python:3.14-slim-bookworm` | Custom local image; base images are Docker Official Images | Built locally because it packages this repository's application, verified renderer archive, and frontend. It is not an upstream application image. |
| Application PostgreSQL | `pgvector/pgvector:pg16` | pgvector publisher image | Retain this image while reusing the existing application PostgreSQL volume. Replacing it with `postgres` would be a database-engine/image change, not a provenance cleanup. |
| Application object storage | `thermal-minio-source:2025-10-15` | Custom local image, previously built from `github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z` | No upstream image label/digest is recorded for this local image. Keep it while reusing the existing MinIO objects; rebuild/replacement requires a separate migration and restore plan. |
| SonarQube server | `sonarqube:26.9.0.129388-community` | SonarSource image | Pinned local quality-service image. |
| SonarQube database | `postgres:17.11` | Docker Official Image | Separate SonarQube database and volumes only. |
| Sonar scanner | `sonarsource/sonar-scanner-cli:12.2.0.4256_8.1.0` | SonarSource image | Used only for analysis of a curated read-only snapshot. |
| Codex Sonar MCP | `sonarsource/sonarqube-mcp:1.19.0.2785` | SonarSource image | Launched with an ignored read-only-token environment file and no mounts. |
| Jenkins controller | `thermal-label-jenkins:local`, built from `jenkins/jenkins:2.581-jdk21`, `node:22.20.0-bookworm`, `python:3.14-slim-bookworm`, `sonarsource/sonar-scanner-cli:12.2.0.4256_8.1.0`, `docker:29-cli`, and local `thermal-label-studio:local` | Custom local image; upstream bases are publisher/official images as named | Built locally to provide Node/Python source gates, a native pinned scanner, source-only Docker Compose validation, and the tested application's Linux `resvg`. It has no Docker socket mount and cannot create containers. |

Do not infer that all images are Docker Official Images. The application,
Jenkins, and MinIO images are local/custom images; `pgvector`, SonarSource, and
Jenkins are publisher images with their own release/provenance processes.
