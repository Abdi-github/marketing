# AI Marketing Automation SaaS (for SMEs)

Production-grade, multi-tenant AI marketing automation platform for small and medium enterprises.

> **Status:** step-0 — foundation layer. No application code yet. See [memory/STEP.md](memory/STEP.md).

## What this repo is right now

Step-0 establishes the durable foundation every later step builds on:

- **Project memory** for Claude Code: [CLAUDE.md](CLAUDE.md)
- **Architecture & engineering standards:** [docs/](docs/)
- **Architecture Decision Records:** [docs/ADRs/](docs/ADRs/)
- **Reusable Claude Code tooling:** [.claude/](.claude/) — skills, commands, hooks
- **Step tracker:** [memory/STEP.md](memory/STEP.md)

## Read in this order

1. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system overview
2. [docs/STACK.md](docs/STACK.md) — chosen stack + WHY + alternatives
3. [docs/MULTI_TENANCY.md](docs/MULTI_TENANCY.md) — tenant isolation model
4. [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md) — AI workflows, provider abstraction, cost controls
5. [docs/ENGINEERING_STANDARDS.md](docs/ENGINEERING_STANDARDS.md) — code, testing, security norms
6. [docs/ROADMAP.md](docs/ROADMAP.md) — phased delivery
7. [docs/ADRs/README.md](docs/ADRs/README.md) — load-bearing decisions

## Core engineering rules (from `plan/step-0.md`)

- Multi-tenant SaaS — required
- Queue-driven AI workflows — required
- AI provider abstraction — required

How these map to the architecture: see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
