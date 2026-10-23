# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| `0.1.x` | Yes |
| `< 0.1` | No |

The project is in alpha. Security fixes are applied to the latest `0.1.x` release and to
`main` when applicable. Older releases may not receive backports.

## Recent security updates

- **0.1.1** upgrades Next.js to **16.4.2**, which includes upstream fixes for
  critical RCE advisories in `use cache` and the Image Optimization API, plus a
  Server Actions denial-of-service advisory. Upgrade as soon as possible.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Preferred channel: open a private report with GitHub Security Advisories:

<https://github.com/RINOHeinrich1/onir-cms/security/advisories/new>

If GitHub Security Advisories are unavailable, email **it.specialist.gasca@gmail.com** with:

- affected version or commit;
- a description of the issue and its impact;
- reproduction steps or a proof of concept;
- any suggested mitigation;
- whether you want to be credited.

Please do not include real customer data, production credentials, or secrets in the report.
Use synthetic data.

## What to expect

- Acknowledgement as soon as reasonably possible.
- An initial assessment and, when confirmed, a remediation plan.
- A coordinated disclosure timeline.
- Credit in the advisory if you request it and it is appropriate.

This is a best-effort open-source project; no bug bounty or response SLA is offered.

## Scope

In scope:

- authentication and session handling;
- authorisation and tenant isolation;
- exposure of secrets or personal data;
- injection, SSRF, path traversal, and unsafe file handling;
- vulnerabilities in the application code or shipped container images.

Out of scope:

- vulnerabilities in third-party services or dependencies without a demonstrated impact on
  ONIR CMS;
- social engineering;
- denial-of-service against a production instance you do not own;
- reports based only on automated scanner output without a reproducible impact.

## Safe testing

Only test systems you own or have explicit written permission to test. Do not access,
modify, or exfiltrate data that does not belong to you. Do not test against the maintainer's
production instance without permission.

## Secrets

If you accidentally commit a secret, revoke it immediately. Removing it from the latest
commit is not enough: Git history, forks, caches, and logs may retain it.

## Dependency and container security

Dependabot, CodeQL, secret scanning, and GitHub Actions security features are enabled on the
public repository. Please report a dependency issue privately if exploitation is plausible.
