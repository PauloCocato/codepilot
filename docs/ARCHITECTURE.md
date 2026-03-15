# CodePilot Architecture

## Component Diagram

```
                         +-----------------+
                         |   GitHub API    |
                         | (Webhooks/REST) |
                         +--------+--------+
                                  |
                                  v
+-------------------------------------------------------------------------------------+
|                           apps/agent                                                 |
|                                                                                      |
|  +-------------+     +-------------+     +-----------+     +----------+              |
|  |   Fastify   | --> |   BullMQ    | --> |   Agent   | --> |  GitHub  |              |
|  |  Webhooks   |     |  Job Queue  |     |   Loop    |     |   PRs    |              |
|  +-------------+     +-------------+     +-----+-----+     +----------+              |
|                                                |                                     |
|                          +---------------------+---------------------+               |
|                          |                     |                     |               |
|                          v                     v                     v               |
|                    +-----------+         +-----------+         +-----------+         |
|                    |  Planner  |         | Generator |         |  Critic   |         |
|                    +-----------+         +-----------+         +-----------+         |
|                          |                     |                     |               |
|                          v                     v                     v               |
|                    +-----------+         +-----------+         +-----------+         |
|                    |    LLM    |         |    LLM    |         |    LLM    |         |
|                    |  Adapter  |         |  Adapter  |         |  Adapter  |         |
|                    +-----------+         +-----------+         +-----------+         |
|                          |                     |                                     |
|                          v                     v                                     |
|                    +-----------+         +-----------+                               |
|                    |  Indexer  |         |  Sandbox  |                               |
|                    | (ChromaDB)|         |  (Docker) |                               |
|                    +-----------+         +-----------+                               |
|                                                                                      |
+-------------------------------------------------------------------------------------+
|                       packages/shared (types, constants)                             |
+-------------------------------------------------------------------------------------+
```

## Data Flow: Issue to Pull Request

```
1. GitHub Webhook (issue labeled "codepilot")
       |
2. Fastify receives webhook, validates signature
       |
3. BullMQ enqueues agent job
       |
4. Agent Loop picks up job:
       |
       +---> 4a. Parse Issue
       |          Extract title, body, labels, file mentions,
       |          steps to reproduce, expected behavior
       |
       +---> 4b. Clone Repository
       |          git clone into temp directory
       |
       +---> 4c. Index Codebase
       |          Chunk files --> Generate embeddings --> Store in ChromaDB
       |
       +---> 4d. Search Relevant Code
       |          Build queries from issue --> Semantic search --> Top-K results
       |
       +---> 4e. Create Plan (LLM)
       |          Issue + code context --> Step-by-step solution plan
       |
       +---> 4f. Generate Patch (LLM)
       |          Issue + context + plan --> Unified diff patch
       |
       +---> 4g. Test in Sandbox (Docker)
       |          Apply patch --> Install deps --> Run tests
       |          If tests fail: retry from 4f with error feedback
       |
       +---> 4h. Critic Review (LLM)
       |          Score patch on correctness, security, style,
       |          completeness, simplicity (0-100)
       |          If score < 60: retry from 4f with feedback
       |
       +---> 4i. Submit PR
       |          Create branch --> Apply patch --> Commit --> Push --> Open PR
       |
5. Cleanup temp directory
```

## Module Descriptions

### `apps/agent/src/agent/`

The orchestration core. The **loop** module (`loop.ts`) drives the entire issue-to-PR pipeline. It coordinates all other modules in sequence, handles retries, tracks cost, and manages the agent lifecycle.

- **planner.ts** — Sends the parsed issue and relevant code context to an LLM to produce a structured solution plan (JSON with steps, files, and approach). Validates the response with Zod schemas and retries on validation failure.
- **generator.ts** — Takes the plan and generates a unified diff patch via LLM. Parses the response to extract the diff, explanation, and list of changed files. Retries with error context on malformed output.
- **critic.ts** — Reviews a generated patch by sending it to an LLM for scoring on 5 criteria (correctness, security, style, completeness, simplicity). A score of 60/100 or higher is required to pass.
- **searcher.ts** — Builds multiple search queries from the issue (title, file mentions, error messages, keywords) and performs semantic search against the vector store. Deduplicates and formats results as a context string for the LLM.
- **runner.ts** — Creates a Docker sandbox, applies the patch, and runs the test suite. Returns structured results indicating whether the patch applied successfully and tests passed.

### `apps/agent/src/llm/`

Multi-provider LLM integration using the Adapter pattern.

- **adapter.ts** — Defines the `LLMAdapter` interface, error types, response schemas (Zod), and utility functions for cost calculation, token estimation, and exponential backoff.
- **claude.ts** — Anthropic Claude adapter implementing `LLMAdapter`. Handles API calls, streaming, cost tracking, and retry logic with exponential backoff.
- **openai.ts** — OpenAI GPT adapter implementing the same interface. Supports completion and streaming with provider-specific response parsing.
- **router.ts** — Smart router that tries the primary adapter first and falls back to the secondary on failure. Tracks success rates and total cost per provider.

### `apps/agent/src/github/`

GitHub API integration layer.

- **app.ts** — Fastify application setup with webhook endpoint. Validates webhook signatures and dispatches events to the job queue.
- **issues.ts** — Fetches and parses GitHub issues into a structured `ParsedIssue` type. Extracts file mentions, steps to reproduce, code blocks, and detects issue type from labels/content.
- **repos.ts** — Repository operations: clone, create branch, apply patch (`git apply`), commit, push, and cleanup temporary directories.
- **prs.ts** — Creates pull requests and comments on issues via the Octokit client.

### `apps/agent/src/indexer/`

Codebase analysis and semantic search.

- **chunker.ts** — Walks the repository file tree, detects language by extension, and splits source files into overlapping chunks (default: 100 lines with 20-line overlap). Respects `.gitignore` and skips binary/generated files.
- **embeddings.ts** — Generates vector embeddings for code chunks using either OpenAI or a local embedding model. Batches requests for efficiency.
- **store.ts** — ChromaDB wrapper implementing the `VectorStore` interface. Supports upsert and semantic similarity search with configurable top-K results.

### `apps/agent/src/sandbox/`

Isolated code execution environment.

- **docker.ts** — Manages Docker containers via `dockerode`. Creates containers with resource limits (CPU, memory, timeout), mounts the repository, and provides exec capabilities.
- **executor.ts** — Higher-level execution functions: apply patches, install dependencies, and run test suites inside a sandbox container. Returns structured test results (passed/failed/skipped counts).
- **detector.ts** — Detects the project runtime (Node.js, Python, Go, Rust, etc.) by examining `package.json`, `requirements.txt`, `go.mod`, and other configuration files.

### `apps/agent/src/safety/`

Safety evaluation for generated patches (future expansion).

### `apps/agent/src/utils/`

Shared utilities for the agent application.

- **logger.ts** — Pino logger configured with structured JSON logging and child logger support for per-module context.
- **config.ts** — Environment variable loading and validation using Zod schemas.
- **cost.ts** — Cost tracking across multiple LLM calls within a single agent run.

### `packages/shared/`

Shared TypeScript types and constants used across all packages.

- **types.ts** — Core interfaces: `LLMAdapter`, `CompletionParams`, `CompletionResult`, `ParsedIssue`, `AgentResult`, and related types.
- **constants.ts** — Shared constants: `MAX_RETRIES`, `SANDBOX_TIMEOUT_MS`, `DEFAULT_TEMPERATURE`.

## Security Decisions

1. **Webhook Signature Validation** — All incoming GitHub webhooks are validated against `GITHUB_WEBHOOK_SECRET` using HMAC-SHA256 before processing. Invalid signatures are rejected with 401.

2. **Docker Sandbox Isolation** — All patch application and test execution happens inside ephemeral Docker containers with resource limits. Containers are destroyed after each run regardless of outcome.

3. **No Host Filesystem Access** — The sandbox mounts a temporary copy of the repository. The agent never modifies the host filesystem directly.

4. **Cost Budget Enforcement** — Each agent run has a configurable maximum cost (`MAX_COST_USD`, default $1.00). The loop checks the budget before each LLM call and aborts if exceeded.

5. **Secret Management** — All secrets are loaded from environment variables, never hardcoded. The configuration module validates their presence at startup.

6. **Rate Limit Handling** — LLM adapters detect rate limit errors and implement exponential backoff with jitter. GitHub API rate limits trigger automatic retry with appropriate delays.
