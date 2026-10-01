"""Configuration from environment variables (12-factor style)."""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    host: str = "127.0.0.1"
    port: int = 8080
    db_path: str = "linkly.db"
    token: str = ""
    base_url: str = ""  # public origin used when building short URLs, e.g. https://go.example.com
    token_generated: bool = False

    @classmethod
    def from_env(cls, env=os.environ) -> "Config":
        token = env.get("LINKLY_TOKEN", "")
        generated = not token
        if generated:
            token = secrets.token_urlsafe(24)
        return cls(
            host=env.get("LINKLY_HOST", "127.0.0.1"),
            port=int(env.get("LINKLY_PORT", "8080")),
            db_path=env.get("LINKLY_DB", "linkly.db"),
            token=token,
            base_url=env.get("LINKLY_BASE_URL", "").rstrip("/"),
            token_generated=generated,
        )
