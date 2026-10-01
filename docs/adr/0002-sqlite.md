# ADR 0002: SQLite for storage
**Status:** accepted
**Context:** Single-node, read-heavy workload with small writes (one click row per redirect).
**Decision:** SQLite, one connection per operation (thread-safe, simple), SQL isolated in `storage.py`.
**Consequences:** Backup = copy a file. Single-writer limit; swap `Storage` for another backend if needed.
