```
   ____          _      ____  _ _       _
  / ___|___   __| | ___|  _ \(_) | ___ | |_
 | |   / _ \ / _` |/ _ \ |_) | | |/ _ \| __|
 | |__| (_) | (_| |  __/  __/| | | (_) | |_
  \____\___/ \__,_|\___|_|   |_|_|\___/ \__|
```

**AI agent that resolves GitHub issues automatically.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-290%20passing-brightgreen)]()
[![CI](https://github.com/PauloCocato/codepilot/actions/workflows/ci.yml/badge.svg)](https://github.com/PauloCocato/codepilot/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js)](https://nodejs.org/)

---

## What is CodePilot?

CodePilot is an autonomous AI agent that reads GitHub issues, understands the codebase, generates a fix as a unified diff patch, validates it by running tests in a Docker sandbox, and opens a pull request — all without human intervention.

<!-- Demo GIF placeholder -->
<!-- ![CodePilot Demo](docs/assets/demo.gif) -->

---

## How It Works

```
 GitHub Issue                                            Pull Request
     |                                                        ^
     v                                                        |
 +--------+    +---------+    +--------+    +--------+    +--------+
 | 1.Parse | -> | 2.Index | -> | 3.Plan | -> |4.Patch | -> |5.Test  | -> | 6.PR |
 | Issue   |    | Code    |    | Fix    |    |Generate|    |Sandbox |    |Submit|
 +--------+    +---------+    +--------+    +--------+    +--------+    +------+
                                                               |
                                                          (fail? retry
                                                           with feedback)
```

1. **Parse Issue** — Extracts structured data from the GitHub issue (title, body, labels, file mentions, steps to reproduce).
2. **Index Codebase** — Chunks the repository source code and generates vector embeddings for semantic search.
3. **Plan Fix** — Sends the issue + relevant code context to an LLM to produce a step-by-step solution plan.
4. **Generate Patch** — The LLM generates a unified diff patch following the plan.
5. **Test in Sandbox** — The patch is applied and tests run inside an isolated Docker container.
6. **Submit PR** — If tests pass and the critic module approves, a pull request is created automatically.

If tests fail, the agent retries with error feedback (up to 3 attempts). A critic module scores patches on correctness, security, style, completeness, and simplicity.

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/PauloCocato/codepilot.git && cd codepilot

# 2. Install dependencies
npm install

# 3. Copy the environment template and fill in your keys
cp .env.example .env

# 4. Build all packages
npm run build

# 5. Run the agent
npm run dev --workspace=apps/agent
```

---

## Configuration

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key for Claude |
| `OPENAI_API_KEY` | Yes* | OpenAI API key (fallback provider) |
| `GITHUB_TOKEN` | Yes | GitHub personal access token with repo scope |
| `GITHUB_WEBHOOK_SECRET` | Yes | Secret for validating GitHub webhook payloads |
| `CHROMA_URL` | No | ChromaDB server URL (default: `http://localhost:8000`) |
| `REDIS_URL` | No | Redis URL for BullMQ job queue (default: `redis://localhost:6379`) |
| `DOCKER_SOCKET` | No | Docker socket path (default: `/var/run/docker.sock`) |
| `LOG_LEVEL` | No | Pino log level (default: `info`) |
| `MAX_COST_USD` | No | Maximum cost budget per agent run in USD (default: `1.00`) |
| `PORT` | No | Fastify server port (default: `3000`) |

\* At least one LLM provider key is required. If both are set, Claude is used as primary with OpenAI as fallback.

---

## Architecture

CodePilot is built as a TypeScript monorepo using Turborepo with the following structure:

```
codepilot/
  apps/
    agent/              # Main agent application
      src/
        agent/          # Orchestration loop, planner, generator, critic, runner
        github/         # GitHub API integration (issues, repos, PRs)
        indexer/        # Codebase chunking, embeddings, vector store
        llm/            # Multi-provider LLM adapters (Claude, OpenAI, Router)
        sandbox/        # Docker sandbox for safe code execution
        safety/         # Safety evaluation layer
        utils/          # Logging, config, cost tracking
  packages/
    shared/             # Shared types and constants
```

For detailed architecture documentation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

For architectural decision records, see [docs/DECISIONS.md](docs/DECISIONS.md).

---

## Development

```bash
# Run all tests
npm run test

# Type checking
npm run typecheck

# Run tests in watch mode
npm run test:watch --workspace=apps/agent

# Build
npm run build
```

---

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on:

- Development setup
- Branch naming and commit conventions
- TDD workflow
- Pull request process

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

## Acknowledgments

Built with [Claude](https://www.anthropic.com/claude) and [Claude Code](https://claude.ai/claude-code).
