# Governance

## Maintainer

ONIR CMS is currently maintained by **RINO Heinrich** (`@RINOHeinrich1`).

The maintainer is responsible for:

- reviewing and merging pull requests;
- protecting `main` and release tags;
- publishing releases and container images;
- handling security reports;
- maintaining the roadmap and architecture decisions;
- enforcing the Code of Conduct.

## Decision making

The project uses **lazy consensus**:

- small changes are decided in the pull request;
- significant changes start with an issue or a discussion;
- architecture decisions are recorded as ADRs in `docs/adr/`;
- if consensus is not reached, the maintainer decides and documents the rationale.

## Becoming a maintainer

Contributors who demonstrate sustained, high-quality work and good judgement may be invited
as maintainers. There is no fixed number of contributions or minimum delay. The current
maintainer makes the final decision.

## Releases

- `main` must stay releasable.
- Releases follow SemVer and are tagged `vX.Y.Z`.
- Release notes and the changelog are generated from Conventional Commits.
- Production deployment is not part of the public repository workflow.

## Changes to this document

Changes to governance require a pull request and explicit approval from the maintainer.
