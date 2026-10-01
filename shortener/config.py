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
    trust_proxy: bool = False  # take client IP from X-Forwarded-For (only behind a proxy you control)
    create_limit: int = 60  # POST /api/links per client per minute; 0 disables
    auth_fail_limit: int = 10  # failed token attempts per client per minute before 429

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
            trust_proxy=env.get("LINKLY_TRUST_PROXY", "").lower() in ("1", "true", "yes"),
            create_limit=int(env.get("LINKLY_CREATE_LIMIT", "60")),
            auth_fail_limit=int(env.get("LINKLY_AUTH_FAIL_LIMIT", "10")),
        )
