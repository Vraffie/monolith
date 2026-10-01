"""Configuration from environment variables (12-factor style)."""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    host: str = "127.0.0.1"
    port: int = 8080
    db_path: str = "hitchly.db"
    token: str = ""
    base_url: str = ""  # public origin used when building short URLs, e.g. https://go.example.com
    token_generated: bool = False
    trust_proxy: bool = False  # take client IP from X-Forwarded-For (only behind a proxy you control)
    create_limit: int = 60  # POST /api/links per client per minute; 0 disables
    probe_limit: int = 60  # server-side URL probes (trace / dead-link check) per client per minute; 0 disables
    probe_allow_private: bool = False  # let probes reach private/internal addresses (SSRF risk; for trusted LANs only)
    auth_fail_limit: int = 10  # failed token attempts per client per minute before 429

    @classmethod
    def from_env(cls, env=os.environ) -> "Config":
        token = env.get("HITCHLY_TOKEN", "")
        generated = not token
        if generated:
            token = secrets.token_urlsafe(24)
        return cls(
            host=env.get("HITCHLY_HOST", "127.0.0.1"),
            port=int(env.get("HITCHLY_PORT", "8080")),
            db_path=env.get("HITCHLY_DB", "hitchly.db"),
            token=token,
            base_url=env.get("HITCHLY_BASE_URL", "").rstrip("/"),
            token_generated=generated,
            trust_proxy=env.get("HITCHLY_TRUST_PROXY", "").lower() in ("1", "true", "yes"),
            create_limit=int(env.get("HITCHLY_CREATE_LIMIT", "60")),
            probe_limit=int(env.get("HITCHLY_PROBE_LIMIT", "60")),
            probe_allow_private=env.get("HITCHLY_PROBE_ALLOW_PRIVATE", "").lower() in ("1", "true", "yes"),
            auth_fail_limit=int(env.get("HITCHLY_AUTH_FAIL_LIMIT", "10")),
        )
