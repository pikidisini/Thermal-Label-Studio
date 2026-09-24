"""Cryptographic security utilities for password hashing and token generation.

Follows OWASP Password Storage and Session Management cheat sheet guidelines:
- Algorithm: PBKDF2-HMAC-SHA256 with 600,000 iterations and 16-byte random salt.
- Session tokens: 32 bytes of cryptographically secure random entropy (64 hex characters).
- Token storage: only SHA-256 hashes of session tokens are persisted to disk.
- Timing-attack resilience: constant-time digest comparison via secrets.compare_digest.
"""

from __future__ import annotations

import hashlib
import os
import secrets
from typing import Tuple

PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 600_000
SALT_BYTES = 16


def hash_password(password: str, iterations: int = PBKDF2_ITERATIONS) -> str:
    """Hashes a plaintext password using PBKDF2-HMAC-SHA256 with a fresh random salt.

    Returns string formatted as: pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
    """
    if not isinstance(password, str) or not password:
        raise ValueError("Kata sandi tidak boleh kosong.")
    salt = os.urandom(SALT_BYTES)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"{PBKDF2_ALGORITHM}${iterations}${salt.hex()}${derived.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """Verifies a plaintext password against a stored PBKDF2 hash using constant-time comparison."""
    if not isinstance(password, str) or not isinstance(hashed, str):
        return False
    parts = hashed.split("$")
    if len(parts) != 4:
        return False
    algo, iter_str, salt_hex, hash_hex = parts
    if algo != PBKDF2_ALGORITHM:
        return False
    try:
        iterations = int(iter_str)
        salt = bytes.fromhex(salt_hex)
        expected_hash = bytes.fromhex(hash_hex)
    except (ValueError, TypeError):
        return False

    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return secrets.compare_digest(derived, expected_hash)


def hash_token(token: str) -> str:
    """Calculates SHA-256 digest of a session or auth token for secure database persistence."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_secure_token(nbytes: int = 32) -> str:
    """Generates cryptographically secure random hex string."""
    return secrets.token_hex(nbytes)
