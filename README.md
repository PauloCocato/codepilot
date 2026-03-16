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
  <img src="https://img.shields.io/badge/Tests-413%20passing-brightgreen" alt="Tests">
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript" alt="TypeScript"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js" alt="Node.js"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#github-app-setup">GitHub App</a> &bull;
  <a href="#vs-code-extension">VS Code Extension</a> &bull;
  <a href="#deployment">Deployment</a> &bull;
  <a href="#api-reference">API</a> &bull;
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
- **GitHub App** — Install on any repo. Webhook-driven with per-installation auth
- **Free Tier** — 5 issues/month per installation with usage tracking
- **Per-Repo Config** — Customize behavior via `.codepilot.yml` in your repo
- **Multi-Repo** — Per-repo rate limiting and isolated vector stores
- **Dashboard** — Next.js monitoring dashboard with real-time Supabase data
- **Prometheus Metrics** — `/metrics` endpoint for Grafana/alerting
- **VS Code Extension** — Resolve issues, monitor runs, get notifications from the editor
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

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- At least one LLM API key (Anthropic or OpenAI)

### 1. Clone and install

```bash
git clone https://github.com/PauloCocato/codepilot.git && cd codepilot
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your API keys:

```env
# Required - LLM (at least one)
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx

# Required - GitHub App (see "GitHub App Setup" section)
GITHUB_APP_ID=12345
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# Optional
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
REDIS_URL=redis://localhost:6379
CHROMA_URL=http://localhost:8000
MAX_COST_USD=1.00
LOG_LEVEL=info
```

### 3. Start infrastructure

```bash
docker compose up -d postgres redis chromadb
```

### 4. Create database tables

Run these SQL files in your PostgreSQL/Supabase:

```bash
# Core tables (agent runs, steps, LLM usage)
psql -f apps/agent/src/db/schema.sql

# Installation and usage tracking tables
psql -f apps/agent/src/db/schema-installations.sql
```

Or paste them in Supabase Dashboard > SQL Editor.

### 5. Build and run

```bash
npm run build
npm run dev --workspace=apps/agent
```

The agent starts on `http://localhost:3000`.

---

## GitHub App Setup

### 1. Register a GitHub App

Go to **GitHub > Settings > Developer Settings > GitHub Apps > New GitHub App**:

| Field | Value |
|-------|-------|
| Name | Your app name (e.g., `my-codepilot`) |
| Homepage URL | `https://github.com/PauloCocato/codepilot` |
| Webhook URL | `https://YOUR-DOMAIN/webhook` |
| Webhook Secret | Generate with `openssl rand -hex 32` |

### 2. Set permissions

| Permission | Access |
|-----------|--------|
| Issues | Read & Write |
| Pull Requests | Read & Write |
| Contents | Read & Write |
| Metadata | Read |

### 3. Subscribe to events

- Issues
- Issue comment
- Installation

### 4. Download the private key

After creating the app, click **Generate a private key**. Save the `.pem` file and add it to your `.env`.

### 5. Install on a repo

Visit `https://github.com/apps/YOUR-APP-NAME/installations/new` and select your repos.

### 6. Test it

Create an issue in your repo with the label `codepilot` (or your configured trigger label). CodePilot will:
1. Receive the webhook
2. Enqueue the job
3. Analyze, plan, generate, test
4. Open a PR

---

## Per-Repo Configuration

Add a `.codepilot.yml` to your repo root to customize behavior:

```yaml
# Label that triggers CodePilot (default: codepilot)
trigger_label: codepilot

# Maximum cost per run in USD (default: 1.00)
max_cost_usd: 1.00

# Auto-merge PRs if tests pass (default: false)
auto_merge: false

# Paths to exclude from indexing
excluded_paths:
  - "vendor/"
  - "generated/"
  - "*.min.js"
```

If the file is missing, defaults are used.

---

## VS Code Extension

The VS Code extension lets you resolve issues and monitor runs from the editor.

### Install

```bash
cd packages/vscode-extension
npm run build
npx vsce package
code --install-extension codepilot-vscode-0.2.0.vsix
```

Or press **F5** in the extension folder to launch the Extension Development Host.

### Features

**Status Bar** — Shows connection status and active run count. Click to show runs.

**Sidebar Panel** — TreeView with:
- Active Runs (with real-time status)
- Recent Runs (completed/failed)
- Queue Stats (waiting, active, completed, failed)

**Commands** (`Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `CodePilot: Resolve Issue` | Submit an issue URL or `owner/repo#123` for resolution |
| `CodePilot: Show Active Runs` | Quick pick of active/waiting jobs |
| `CodePilot: Show Run Details` | Full details of a run (cost, steps, PR link) |
| `CodePilot: Configure Server` | Open extension settings |

**Notifications** — Toast when a run completes (with clickable PR link) or fails.

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `codepilot.serverUrl` | `http://localhost:3000` | Agent server URL |
| `codepilot.pollingInterval` | `10` | Polling interval in seconds (3-120) |
| `codepilot.notifications` | `true` | Show completion/failure notifications |

---

## Dashboard

The Next.js dashboard provides a web UI for monitoring.

```bash
npm run dev --workspace=apps/dashboard
```

Opens on `http://localhost:3001` with:
- **Home** — Stats cards (total runs, success rate, avg cost, active installations)
- **Runs** — Paginated list of all agent runs with status, cost, timestamps
- **Run Detail** — Step timeline, LLM usage breakdown, diff viewer, safety score
- **Settings** — Configuration panel
- **Landing Page** — `/landing` route with "Install on GitHub" CTA

When `SUPABASE_URL` is configured, the dashboard shows real data. Otherwise, it falls back to demo data.

---

## Deployment

### Docker Compose (recommended)

```bash
# Start everything (agent + postgres + redis + chromadb)
docker compose up -d

# View logs
docker compose logs -f agent

# Stop
docker compose down
```

The `docker-compose.yml` includes:

| Service | Port | Description |
|---------|------|-------------|
| `agent` | 3000 | CodePilot Fastify server |
| `postgres` | 5432 | PostgreSQL database |
| `redis` | 6379 | BullMQ job queue |
| `chromadb` | 8000 | Vector database |

### Webhook Exposure

GitHub requires HTTPS for webhooks. Options:

- **Production:** Reverse proxy (Caddy/nginx) with SSL
- **Development:** `ngrok http 3000` for a temporary tunnel

Update the Webhook URL in your GitHub App settings.

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/health` | GET | Health check (`{ status, version, uptime }`) |
| `POST /api/queue/enqueue` | POST | Submit issue for resolution |
| `GET /api/queue/stats` | GET | Queue statistics (waiting, active, completed, failed) |
| `GET /api/queue/jobs` | GET | Recent jobs (`?limit=20`) |
| `GET /api/queue/jobs/:id` | GET | Job status and details |
| `GET /api/repos` | GET | List registered repos with config and rate limits |
| `GET /api/repos/:owner/:repo` | GET | Specific repo info |
| `GET /api/stats` | GET | Agent stats (total runs, success rate, cost) |
| `GET /metrics` | GET | Prometheus metrics |
| `POST /webhook` | POST | GitHub webhook receiver (signature-verified) |

### Enqueue Example

```bash
curl -X POST http://localhost:3000/api/queue/enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "issueUrl": "https://github.com/owner/repo/issues/42",
    "repoOwner": "owner",
    "repoName": "repo",
    "issueNumber": 42,
    "triggeredBy": "api",
    "installationId": 12345
  }'
```

### Prometheus Metrics

Available at `GET /metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `codepilot_runs_total` | Counter | Total agent runs (by status, trigger) |
| `codepilot_run_duration_seconds` | Histogram | Run duration |
| `codepilot_run_cost_usd` | Histogram | Cost per run |
| `codepilot_llm_requests_total` | Counter | LLM API calls (by provider, model) |
| `codepilot_llm_tokens_total` | Counter | Tokens used (by provider, direction) |
| `codepilot_llm_cost_usd_total` | Counter | LLM cost (by provider) |
| `codepilot_llm_latency_seconds` | Histogram | LLM latency |
| `codepilot_queue_depth` | Gauge | Queue depth (by state) |
| `codepilot_safety_score` | Histogram | Safety evaluation scores |
| `codepilot_safety_violations_total` | Counter | Safety violations (by category) |
| `codepilot_active_installations` | Gauge | Active GitHub App installations |

---

## Architecture

TypeScript monorepo powered by Turborepo:

```
codepilot/
  apps/
    agent/src/
      agent/        # Orchestration: loop, planner, generator, critic, runner
      llm/          # Multi-provider adapters (Claude, OpenAI, Router)
      github/       # App auth, issues, repos, PRs, webhook, config reader
      indexer/      # Code chunking, embeddings, vector search
      sandbox/      # Docker isolation with security hardening
      safety/       # 16 security rules (injection, secrets, SSRF, XSS...)
      queue/        # BullMQ job queue with deduplication
      db/           # PostgreSQL/Supabase persistence layer
      metrics/      # Prometheus metrics collector
      utils/        # Logging (Pino), config (Zod), cost tracking
    dashboard/      # Next.js monitoring dashboard + landing page
  packages/
    shared/         # Shared TypeScript interfaces
    vscode-extension/ # VS Code extension
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

413 tests across 43+ test files. Unit, integration, and E2E:

```bash
npm run test          # All tests
npm run typecheck     # Type safety (6 packages)
npm run lint          # Code quality
npm run build         # Build all packages
```

The E2E suite tests the full pipeline (parse -> plan -> generate -> critic) with both mock and real LLM calls.

---

## Configuration Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes* | — | Claude API key |
| `OPENAI_API_KEY` | Yes* | — | OpenAI API key (fallback) |
| `GITHUB_APP_ID` | Yes | — | GitHub App ID |
| `GITHUB_PRIVATE_KEY` | Yes | — | GitHub App private key (PEM) |
| `GITHUB_WEBHOOK_SECRET` | Yes | — | Webhook signature secret |
| `SUPABASE_URL` | No | — | Supabase project URL |
| `SUPABASE_ANON_KEY` | No | — | Supabase anonymous key |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis for job queue |
| `CHROMA_URL` | No | `http://localhost:8000` | ChromaDB URL |
| `MAX_COST_USD` | No | `1.00` | Budget cap per run (USD) |
| `LOG_LEVEL` | No | `info` | `debug` / `info` / `warn` / `error` |
| `PORT` | No | `3000` | Fastify server port |
| `WORKER_CONCURRENCY` | No | `2` | BullMQ worker concurrency |
| `GITHUB_APP_URL` | No | — | GitHub App install URL (for landing page) |

\* At least one LLM key required. Both set = Claude primary + OpenAI fallback.

---

## Roadmap

- [x] Core agent pipeline (issue -> PR)
- [x] Multi-LLM support (Claude + OpenAI)
- [x] Docker sandbox with security hardening
- [x] Safety evaluation layer (16 rules)
- [x] BullMQ job queue with deduplication
- [x] PostgreSQL persistence (Supabase)
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
- [x] VS Code extension (status bar, sidebar, commands, polling)
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
