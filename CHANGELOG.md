# Changelog

All notable changes to `@dsh-external/dsh-github-push` are documented in this file.

## [Unreleased]

### Added
- `dryRun` mode: print the planned git/README/topics steps without changing anything.
- `skipTopics` option: skip GitHub About topics updates.
- Unit tests for URL normalization, topic derivation, DSH CLI README sections, and README generation.
- `LICENSE` (BSD-3-Clause) and `CHANGELOG.md`.

### Changed
- Existing READMEs are now optimized/append-only by default; they are never rewritten unless `readmeMode=rewrite` is explicitly requested.
- README generation now includes DSH CLI install/uninstall commands for DSH plugins:
  - `dsh plugin --profile web add <package>`
  - `dsh plugin --profile web remove <package>`

### Fixed
- Added the official `dsh.bundle` manifest and `cordis.patch.yml` so the plugin can be installed via `dsh plugin add`.
- `cordis.patch.yml` is now listed in `package.json`'s `files` array. It was previously excluded from published/packed
  installs (npm and `git+https` installs honor `files`), so a fresh install shipped no bundle patch and the declared
  `dsh.bundle.patch` pointed at a missing file, breaking profile startup.
