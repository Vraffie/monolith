# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [1.0.0] - 2026-10-01
### Added
- Link shortening with random or custom slugs and optional expiry.
- Click analytics (total, per day, top referrers).
- Token-protected JSON API and single-file web UI.
- `purge` command, Dockerfile, `linkly` console script.
- Documentation: product brief, architecture, ADRs, API reference, deployment guide.

### Fixed
- Unread request bodies (oversized or unauthorised POSTs) could be misparsed as the next request on a keep-alive connection.
