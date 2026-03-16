<p align="center">
  <pre align="center">
   ____          _      ____  _ _       _
  / ___|___   __| | ___|  _ \(_) | ___ | |_
 | |   / _ \ / _` |/ _ \ |_) | | |/ _ \| __|
 | |__| (_) | (_| |  __/  __/| | | (_) | |_
  \____\___/ \__,_|\___|_|   |_|_|\___/ \__|
  </pre>
</p>

<h3 align="center">Your AI-powered engineering teammate that fixes bugs while you sleep.</h3>

<p align="center">
  <a href="https://github.com/PauloCocato/codepilot/actions/workflows/ci.yml"><img src="https://github.com/PauloCocato/codepilot/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Tests-379%20passing-brightgreen" alt="Tests">
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript" alt="TypeScript"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js" alt="Node.js"></a>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> &bull;
  <a href="#-how-it-works">How It Works</a> &bull;
  <a href="#-architecture">Architecture</a> &bull;
  <a href="docs/ARCHITECTURE.md">Docs</a> &bull;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## The Problem

You wake up to 12 new issues on GitHub. Half are bugs, half are feature requests. You know the fix for most of them — but context-switching between issues, reading code, writing patches, running tests, and opening PRs eats your entire day.

**What if an AI agent could do all of that for you?**

## The Solution

CodePilot is an autonomous agent that turns GitHub issues into pull requests. No babysitting. No copy-pasting prompts. Just label an issue and let CodePilot handle the rest.

> Issue opened -> Code analyzed -> Patch generated -> Tests passed -> PR submitted

---

## Key Features

- **Fully Autonomous** — From issue to PR with zero human intervention
- **Multi-LLM** — Claude as primary, OpenAI as fallback. Swap providers with one env var
- **Secure by Default** — All code runs in isolated Docker containers. Network disabled. No root access
- **Self-Correcting** — Failed tests? The agent retries with error feedback (up to 3 attempts)
- **AI Code Review** — Built-in critic scores every patch on correctness, security, style, completeness and simplicity
- **Safety Layer** — 16 security rules detect SQL injection, hardcoded secrets, XSS, SSRF and more
- **Cost Aware** — Tracks every LLM call cost. Set a budget cap per run (default: $1.00)
- **Job Queue** — BullMQ + Redis for reliable async processing with deduplication
- **Observable** — Structured logging (Pino), step-by-step timing, full cost breakdown

---

## How It Works

```
  GitHub Issue                                                    Pull Request
       |                                                               ^
       v                                                               |
  +---------+    +---------+    +--------+    +---------+    +--------+--------+
  | 1.Parse |--->| 2.Index |--->| 3.Plan |--->|4.Generate|--->| 5.Test | 6.PR  |
  | Issue   |    | Code    |    | Fix    |    | Patch   |    |Sandbox |Submit |
  +---------+    +---------+    +--------+    +---------+    +--------+--------+
                                                                  |
                                                             fail? retry
                                                            with feedback
```

| Step | What happens | Powered by |
|------|-------------|-----------|
| **Parse** | Extracts title, labels, file mentions, steps to reproduce | Zod + regex |
| **Index** | Chunks source code, generates embeddings, stores in vector DB | ChromaDB |
| **Plan** | LLM creates a step-by-step fix strategy with relevant code context | Claude / GPT-4o |
| **Generate** | LLM produces a unified diff patch following the plan | Claude / GPT-4o |
| **Test** | Patch applied + tests run inside an isolated Docker container | dockerode |
| **Submit** | If tests pass and critic approves, a PR is created automatically | Octokit |

---

## Quick Start

```bash
# Clone
git clone https://github.com/PauloCocato/codepilot.git && cd codepilot

# Install
npm install

# Configure (add your API keys)
cp .env.example .env

# Build
npm run build

# Run
npm run dev --workspace=apps/agent
```

The agent starts a Fastify server on `http://localhost:3000` with:
- `POST /api/queue/enqueue` — Submit an issue for resolution
- `GET /api/queue/stats` — Queue statistics
- `GET /api/queue/jobs` — Recent jobs
- `GET /api/health` — Health check

---

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes* | — | Claude API key |
| `OPENAI_API_KEY` | Yes* | — | OpenAI API key (fallback) |
| `GITHUB_TOKEN` | Yes | — | GitHub token with repo scope |
| `GITHUB_WEBHOOK_SECRET` | Yes | — | Webhook signature secret |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis for job queue |
| `CHROMA_URL` | No | `http://localhost:8000` | Vector DB URL |
| `MAX_COST_USD` | No | `1.00` | Budget cap per run (USD) |
| `LOG_LEVEL` | No | `info` | `debug` / `info` / `warn` / `error` |

\* At least one LLM key required. Both set = Claude primary + OpenAI fallback.

---

## Architecture

TypeScript monorepo powered by Turborepo:

```
codepilot/
  apps/
    agent/src/
      agent/        # Orchestration: loop, planner, generator, critic, runner
      llm/          # Multi-provider adapters (Claude, OpenAI, Router)
      github/       # Issues, repos, PRs, webhook handler
      indexer/      # Code chunking, embeddings, vector search
      sandbox/      # Docker isolation with security hardening
      safety/       # 16 security rules (injection, secrets, SSRF, XSS...)
      queue/        # BullMQ job queue with deduplication
      db/           # PostgreSQL/Supabase persistence layer
      utils/        # Logging (Pino), config (Zod), cost tracking
    dashboard/      # Next.js monitoring dashboard
  packages/
    shared/         # Shared TypeScript interfaces
  evals/            # SWE-bench evaluation suite
```

**Design principles:**
- **Adapter pattern** for LLMs — add a new provider by implementing one interface
- **Fail loudly, recover gracefully** — every failure is logged with full context, retried when possible
- **Safety by default** — untrusted code never runs outside Docker. All input validated with Zod
- **Cost awareness** — every LLM call logs tokens + cost. Budget enforced per run

> See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for component diagrams and data flow.
> See [docs/DECISIONS.md](docs/DECISIONS.md) for architectural decision records (ADRs).

---

## Testing

290 tests across 34 test files. Unit, integration, and E2E:

```bash
npm run test          # All tests
npm run typecheck     # Type safety
npm run lint          # Code quality
```

The E2E suite tests the full pipeline (parse -> plan -> generate -> critic) with both mock and real LLM calls.

---

## Roadmap

- [x] Core agent pipeline (issue -> PR)
- [x] Multi-LLM support (Claude + OpenAI)
- [x] Docker sandbox with security hardening
- [x] Safety evaluation layer (16 rules)
- [x] BullMQ job queue
- [x] PostgreSQL persistence
- [x] Next.js monitoring dashboard
- [x] SWE-bench evaluation suite
- [x] CI/CD (GitHub Actions)
- [x] GitHub App authentication and webhook wiring
- [x] Real-time dashboard with live Supabase data
- [x] Prometheus metrics endpoint (`/metrics`)
- [x] Multi-repo support with per-repo rate limiting
- [x] Landing page for GitHub App installation
- [x] Dockerfile and docker-compose for deployment
- [x] `.codepilot.yml` per-repo configuration
- [x] Installation management and free tier (5 issues/month)
- [ ] VS Code extension
- [ ] Grafana dashboard templates
- [ ] Auto-merge support
- [ ] Billing/paid tiers

---

## Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for setup instructions, coding conventions, and PR workflow.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with <a href="https://www.anthropic.com/claude">Claude</a> and <a href="https://claude.ai/claude-code">Claude Code</a>
  <br/>
  <sub>Created by <a href="https://github.com/PauloCocato">Paulo Cocato</a></sub>
</p>
