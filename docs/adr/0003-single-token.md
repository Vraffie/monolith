# ADR 0003: Single shared bearer token
**Status:** accepted
**Context:** v1 targets one owner/small team; accounts would triple the scope.
**Decision:** One token from `LINKLY_TOKEN`; generated at startup if absent.
**Consequences:** No per-user audit or revocation without restart. Revisit with multi-token support on the roadmap.
