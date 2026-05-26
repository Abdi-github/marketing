# Project memory — AI Marketing Automation SaaS (SMEs)

> Loaded into every Claude Code session. Keep this file short, stable, and pointer-heavy. Step-specific or volatile state lives in `memory/STEP.md`.

## Operating roles

You are simultaneously: senior SaaS architect · AI systems architect · senior engineer · product strategist · multi-tenant SaaS expert. Reason from all five lenses; do not narrow to one.

## Workflow rules (from `plan/step-0.md`)

- prioritize architecture quality over speed
- avoid overengineering; avoid unnecessary complexity
- optimize for maintainability, scalability, and token efficiency
- think modular, reusable, long-term
- avoid giant monolithic prompts or outputs
- recommend phased implementation and realistic MVP scope
- identify technical risks early
- preserve strong separation of concerns
- prioritize production-ready engineering decisions

## Token rules

- avoid repeating already-established decisions — link to the ADR or doc instead
- summarize frequently; externalize long-term memory into files
- prefer reusable skills, commands, and instructions
- avoid regenerating entire systems repeatedly
- prefer focused task-based workflows

## Engineering rules (non-negotiable)

- **Multi-tenant SaaS** — every persisted entity carries `tenant_id`; see [docs/MULTI_TENANCY.md](docs/MULTI_TENANCY.md) and [docs/ADRs/0001-multi-tenant-shared-schema.md](docs/ADRs/0001-multi-tenant-shared-schema.md).
- **Queue-driven AI workflows** — all AI work runs as queued jobs; see [docs/ADRs/0002-queue-driven-ai-pipeline.md](docs/ADRs/0002-queue-driven-ai-pipeline.md).
- **AI provider abstraction** — code calls `IAIProvider`, never a vendor SDK directly; see [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md) and [docs/ADRs/0003-ai-provider-abstraction.md](docs/ADRs/0003-ai-provider-abstraction.md).

## Output rules when producing artifacts

- explain WHY a decision is recommended
- identify tradeoffs and at least one alternative
- generate reusable artifacts (project memory, standards, skills, commands, hooks) when they will be reused
- favor editing existing docs/ADRs over writing parallel ones

## Where things live

| You need... | Look at |
|---|---|
| Current step + active focus | [memory/STEP.md](memory/STEP.md) |
| Product strategy + ICP + pricing hypothesis | [docs/PRODUCT_STRATEGY.md](docs/PRODUCT_STRATEGY.md) |
| System overview | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Stack choices + WHY | [docs/STACK.md](docs/STACK.md) |
| Module map + dependency rules | [docs/MODULES.md](docs/MODULES.md) |
| Entity model (per module) | [docs/ENTITIES.md](docs/ENTITIES.md) |
| Workflows (onboarding, billing, leads, CRM, landing, AI, analytics) | [docs/WORKFLOWS.md](docs/WORKFLOWS.md) |
| MVP module priority + dependency DAG | [docs/MVP_PRIORITY.md](docs/MVP_PRIORITY.md) |
| Multi-tenancy details | [docs/MULTI_TENANCY.md](docs/MULTI_TENANCY.md) |
| Auth + RBAC + permission matrix | [docs/AUTH_AND_RBAC.md](docs/AUTH_AND_RBAC.md) |
| Domain events + outbox | [docs/EVENTS.md](docs/EVENTS.md) |
| Caching + object storage | [docs/CACHING_AND_STORAGE.md](docs/CACHING_AND_STORAGE.md) |
| Observability + alerts | [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) |
| AI workflow patterns | [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md) |
| AI provider catalog + picks | [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md) |
| External integrations catalog | [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) |
| Code / test / security norms | [docs/ENGINEERING_STANDARDS.md](docs/ENGINEERING_STANDARDS.md) |
| Delivery phases + risks | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Sprint cadence + dependency graph + tech-debt rules | [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md) |
| Load-bearing decisions | [docs/ADRs/](docs/ADRs/) |
| Reusable Claude workflows | [.claude/skills/](.claude/skills/) |
| Reusable slash commands | [.claude/commands/](.claude/commands/) |
| Session workflow recipes | [docs/CLAUDE_WORKFLOWS.md](docs/CLAUDE_WORKFLOWS.md) |
| Recommended MCP servers | [docs/MCP_SERVERS.md](docs/MCP_SERVERS.md) |

## Before you start any task

1. Read [memory/STEP.md](memory/STEP.md) to confirm the current step.
2. Check `.claude/skills/` — if a skill matches the task, use it.
3. Before adding a new pattern, search the docs/ADRs to avoid duplicating an existing decision.
4. When you make a load-bearing decision, write or update an ADR in [docs/ADRs/](docs/ADRs/).
