"""Export reviewed public source; never change Git, services or operational data."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = ("backend/app", "backend/tests", "backend/schema", "engine", "frontend/src",
               "frontend/tests", "frontend/css", "scripts", "tools", ".github")
ROOT_FILES = (".dockerignore", ".env.example", ".gitattributes", ".gitignore", "AGENTS.md",
              "CONTRIBUTING.md", "Dockerfile", "docker-compose.yml", "Jenkinsfile", "README.md",
              "requirements.txt", "sonar-project.properties")
GENERATED_PARTS = {"__pycache__", "node_modules", "dist", ".venv", "test-results", "playwright-report"}


def source_files() -> list[Path]:
    candidates = [ROOT / name for name in ROOT_FILES]
    candidates.extend((ROOT / "docs").glob("*.md"))
    candidates.extend(path for path in (ROOT / "frontend").iterdir() if path.is_file())
    for directory in DIRECTORIES:
        candidates.extend(path for path in (ROOT / directory).rglob("*") if path.is_file())
    files = []
    for path in sorted(set(candidates)):
        relative = path.relative_to(ROOT)
        if any(part in GENERATED_PARTS for part in relative.parts):
            continue
        if path.name.startswith(".env") and not path.name.endswith(".example"):
            continue
        if path.name.endswith(".local.json") or path.suffix in {".log", ".pyc", ".exe", ".zip"}:
            continue
        if path.is_symlink():
            raise ValueError(f"Review symlink before export: {relative}")
        path.resolve().relative_to(ROOT)
        files.append(path)
    return files


def main() -> None:
    directory = ROOT / ".tmp" / f"checkpoint-source-{uuid4()}"
    directory.mkdir(parents=True)
    archive = directory / "Thermal-Label-Studio-source.zip"
    inventory = []
    with ZipFile(archive, "w", ZIP_DEFLATED) as output:
        for path in source_files():
            content = path.read_bytes()
            name = path.relative_to(ROOT).as_posix()
            output.writestr(name, content)
            inventory.append({"path": name, "bytes": len(content),
                              "sha256": hashlib.sha256(content).hexdigest()})
    manifest = {"archive": archive.name, "archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
                "files": inventory, "git_initialized": False, "published": False}
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(directory)


if __name__ == "__main__":
    main()
