"""Domain and API models for authentication and authorization."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class Role(str, Enum):
    """Allowed user roles in Thermal Label Studio."""
    PPIC = "PPIC"
    IT = "IT"

    @classmethod
    def from_str(cls, val: str) -> Role:
        norm = val.strip().upper()
        if norm == "PPIC":
            return cls.PPIC
        if norm == "IT":
            return cls.IT
        raise ValueError(f"Peran '{val}' tidak valid. Harus PPIC atau IT.")


@dataclass(frozen=True)
class User:
    """Internal domain user model."""
    id: str
    username: str
    password_hash: str
    role: Role
    is_active: bool
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class Session:
    """Internal server-side user session model."""
    session_id: str
    session_hash: str
    user_id: str
    username: str
    role: Role
    csrf_token: str
    created_at: datetime
    expires_at: datetime
    last_activity_at: datetime


class LoginRequest(BaseModel):
    """Payload for application login."""
    username: str = Field(..., min_length=1, max_length=64, description="Nama pengguna")
    password: str = Field(..., min_length=1, max_length=128, description="Kata sandi")


class UserProfile(BaseModel):
    """Public user profile data returned to client."""
    id: str
    username: str
    role: str
    is_active: bool


class LoginResponse(BaseModel):
    """Response returned upon successful authentication."""
    status: str = "authenticated"
    user: UserProfile
    csrf_token: str
    expires_at: str


class SessionInfo(BaseModel):
    """Response returned when probing current session status."""
    authenticated: bool
    user: Optional[UserProfile] = None
    csrf_token: Optional[str] = None
    expires_at: Optional[str] = None
