# Contributing to ONIR CMS

Thank you for considering a contribution. ONIR CMS is an open-source project and
external contributions are welcome.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- For a bug, open an issue with a minimal reproduction.
- For a significant feature or refactor, open an issue or a discussion first so we can
  agree on the approach before you spend time on a large pull request.
- For a security vulnerability, **do not open a public issue**. Follow
  [SECURITY.md](SECURITY.md).
- Keep pull requests focused on one topic.

## Development setup

Requirements:

- Node.js 22 (`.nvmrc`)
- npm
- PostgreSQL 16, or Docker with Compose
- Git

```bash
git clone https://github.com/RINOHeinrich1/onir-cms.git
cd onir-cms
npm ci
cp .env.example .env
```

For a full local Docker environment:

```bash
./scripts/docker-dev-init.sh
docker compose --env-file .env.docker -f docker-compose.dev.yml up --build -d
```

## Branches and commits

- Create a short-lived branch from `main`:
  - `feat/<topic>`
  - `fix/<topic>`
  - `docs/<topic>`
  - `chore/<topic>`
  - `security/<topic>`
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages and
  pull request titles.
- Do not commit directly to `main`.

Examples:

```text
feat(chat): add a new visitor state
fix(templates): reject an empty field label
docs: clarify the Docker upgrade path
```

## Developer Certificate of Origin

Every commit must be signed off. This certifies that you have the right to contribute the
code under the project licence (DCO 1.1):

```bash
git commit -s -m "feat: ..."
```

The sign-off must look like:

```text
Signed-off-by: Your Name <you@example.com>
```

Pull requests with unsigned commits fail the `DCO` check.

## Quality checks

Run these before opening a pull request:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Integration and E2E tests need a disposable database:

```bash
npm run test:integration
npm run test:e2e
```

The immersive template also has an optional visual smoke test. It depends on Chromium/WebGL
and software rendering, so it is not a required CI check:

```bash
npm run smoke:immersive --prefix template-kit
```

Never point `TEST_DATABASE_URL` at production. The test harness refuses databases that do
not look disposable.

## Pull requests

A good pull request:

- explains the problem and the user impact;
- contains tests for the behaviour changed;
- updates documentation when needed;
- does not include secrets, customer data, or production configuration;
- does not mix unrelated refactors with the fix;
- keeps database migrations additive and backward compatible.

Use the pull request template. Link the issue with `Closes #123` when applicable.

Reviews are best effort. There is no paid support SLA for the open-source project.

## Database migrations

- Migrations live in `src/infrastructure/db/migrations/`.
- Never edit a migration that has already been released.
- Add a new migration instead.
- Prefer additive changes and an expand/contract strategy for destructive changes.
- Document breaking changes and upgrade steps in the pull request and release notes.

## Documentation

- User and operator documentation lives in `docs/`.
- Architecture decisions live in `docs/adr/`. Accepted ADRs are immutable; add a new ADR to
  supersede one.
- Code comments should explain non-obvious decisions, not restate the code.

## Security and secrets

- Never commit `.env` files, tokens, private keys, API keys, or customer data.
- Use synthetic data in issues, screenshots, and tests.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
- Dependency and container updates are welcome through Dependabot or focused pull requests.

## AI-assisted contributions

AI-assisted code is acceptable if you understand it, have tested it, and can maintain it.
Do not submit generated code that you cannot explain or verify. Disclose substantial
AI assistance when it affects review.

## Licence

By contributing, you agree that your contribution is licensed under the project's MIT
licence. The DCO sign-off is required; no separate CLA is requested.
