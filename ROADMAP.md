# Roadmap

This roadmap is indicative. Priorities may change based on security, community feedback, and
maintainer capacity. It is not a commitment or a support SLA.

## 0.1.x — Alpha

- Stabilise installation and upgrades.
- Improve test coverage for public chat flows, tenant isolation, and AI providers.
- Harden authentication, rate limiting, and secret handling.
- Improve documentation and contributor onboarding.
- Keep the Docker images and release process reproducible.

## 0.2 — Beta

- Stable extension points for premium and community modules.
- Better observability and operational diagnostics.
- Additional template SDK examples and compatibility tests.
- Accessibility and internationalisation foundations.
- Clearer upgrade and backup tooling.

## 0.3 — Release candidate

- Freeze the public API and template host contract.
- Document compatibility guarantees.
- Complete security review and dependency policy.
- Publish a migration guide from alpha versions.

## 1.0 — Stable

- Semantic versioning guarantees for the public API and template contract.
- Long-term migration policy.
- Stable self-hosting documentation.

## Out of scope for the MIT core

Premium modules, commercial hosting, and custom integrations may be developed in separate
private repositories. The public core must remain usable without them.
