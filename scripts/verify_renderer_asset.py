"""Verify and safely extract a pinned Linux renderer archive."""
from __future__ import annotations

import argparse
import hashlib
import tarfile
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_safe(archive: Path, destination: Path) -> Path:
    destination = destination.resolve()
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:gz") as tar:
        members = tar.getmembers()
        for member in members:
            target = (destination / member.name).resolve()
            if target != destination and destination not in target.parents:
                raise ValueError(f"Archive contains an unsafe path: {member.name}")
        tar.extractall(destination, filter="data")
    candidates = [path for path in destination.rglob("resvg") if path.is_file()]
    if len(candidates) != 1:
        raise ValueError(f"Expected exactly one resvg binary, found {len(candidates)}")
    candidates[0].chmod(candidates[0].stat().st_mode | 0o111)
    return candidates[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    expected = args.sha256.strip().lower()
    if len(expected) != 64 or any(char not in "0123456789abcdef" for char in expected):
        parser.error("--sha256 must be exactly 64 hexadecimal characters")
    if not args.archive.is_file():
        parser.error(f"Renderer archive does not exist: {args.archive}")
    actual = sha256(args.archive)
    if actual != expected:
        raise SystemExit(f"CHECKSUM_MISMATCH: expected {expected}, got {actual}")
    binary = extract_safe(args.archive, args.output)
    print(f"Renderer archive verification: PASS; binary={binary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
