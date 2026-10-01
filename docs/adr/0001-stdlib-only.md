# ADR 0001: Standard library only
**Status:** accepted
**Context:** The product goal is "install and run in a minute" for self-hosters.
**Decision:** Use `http.server`, `sqlite3`, `unittest`; no third-party packages.
**Consequences:** No supply-chain surface or install step. We own routing/JSON handling and
`ThreadingHTTPServer` is not a hardened internet-facing server — deploy behind a reverse proxy.
