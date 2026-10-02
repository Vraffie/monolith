# Contributing

## Setup
No dependencies. Python 3.10+.
```bash
make test    # unit + end-to-end tests
make run     # start locally
```

## Ground rules
- **Keep the layering** (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)): SQL only in `storage.py`,
  no HTTP concepts in `service.py`/`domain.py`, validation rules in `domain.py`.
- **API first:** new capabilities are added to the server API, then exposed in `hitchly_client` and `hitch` (ADR 0004). Clients must never import `hitchly`.
- **No new runtime dependencies** without an ADR (see ADR 0001).
- **Tests required**: domain rule → `tests/test_domain.py`; behaviour → `tests/test_service.py`;
  new/changed endpoint → `tests/test_api.py`; SDK → `tests/test_client.py`; CLI → `tests/test_cli.py`. Inject the clock instead of sleeping.
- **Docs travel with code**: update `docs/API.md` for API changes, `CHANGELOG.md` for user-visible ones,
  and add an ADR in `docs/adr/` for decisions that are costly to reverse.

## Commits
Small, focused commits with an imperative subject (≤ 72 chars) and a body explaining *why* when it isn't obvious.
Prefix docs-only commits with `docs:`.

## Releasing
1. Move `CHANGELOG.md` entries under a new version heading; bump `version` in `pyproject.toml`, `hitchly/__init__.py` and `hitchly_client/__init__.py`.
2. `make test`, then tag `vX.Y.Z`.
