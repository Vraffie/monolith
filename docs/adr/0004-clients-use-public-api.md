# ADR 0004: Clients talk only to the public HTTP API
**Status:** accepted
**Context:** We are adding an SDK and a CLI. The CLI could import `shortener` and use the service layer directly,
which is faster to build.
**Decision:** `linkly_client` speaks HTTP only and `linklyctl` is built on it. Neither imports `shortener`.
**Consequences:** Every feature must be exposed through the API first (good: one contract, one set of docs and auth rules).
Clients work remotely and across versions of the same major release. The cost is some extra work for features that would
be trivial locally (e.g. `check` and `export` page through the API). Server-host maintenance (`purge`, `backup`) stays in
`python -m shortener` because it needs database access by nature.
