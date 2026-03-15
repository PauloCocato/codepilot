# Architectural Decision Records (ADRs)

## ADR-001: Monorepo with Turborepo

- **Date:** 2024-12-01
- **Status:** Accepted

### Context
The project needs a structure that supports multiple packages (agent, shared types, future dashboard) while maintaining a single repository for development velocity.

### Decision
Use a monorepo managed by Turborepo with npm workspaces.

### Alternatives Considered
1. **Nx** — More features but heavier setup and steeper learning curve.
2. **Lerna** — Mature but declining community support; Turborepo is faster.
3. **Polyrepo** — Separate repos per package; too much overhead for a small team.

### Rationale
Turborepo provides fast incremental builds with caching, minimal configuration, and native npm workspace support. It fits the project size without adding unnecessary complexity.

### Trade-offs
- (+) Fast incremental builds with local/remote caching
- (+) Simple configuration via `turbo.json`
- (+) Native npm workspaces — no custom linking tools
- (-) Less granular task orchestration compared to Nx
- (-) Smaller plugin ecosystem

---

## ADR-002: TypeScript + Fastify

- **Date:** 2024-12-01
- **Status:** Accepted

### Context
The agent needs a web server to receive GitHub webhooks and expose a health/status API. The language must support strong typing for reliability in a system that generates and applies code patches.

### Decision
Use TypeScript in strict mode with Fastify as the HTTP framework.

### Alternatives Considered
1. **Express** — Widely used but slower, no built-in schema validation, callback-based.
2. **Hono** — Lightweight but less mature ecosystem for server-side use.
3. **Python + FastAPI** — Strong typing with Pydantic, but the team has deeper TypeScript expertise.

### Rationale
TypeScript strict mode catches bugs at compile time. Fastify is the fastest Node.js framework with built-in JSON schema validation, TypeScript-first design, and a plugin architecture that promotes modularity.

### Trade-offs
- (+) Compile-time type safety with strict mode
- (+) Fastify is 2-3x faster than Express
- (+) Built-in schema validation via JSON Schema
- (-) TypeScript adds build step and configuration overhead
- (-) ESM module resolution requires `.js` extensions in imports

---

## ADR-003: Multi-Provider LLM with Adapter Pattern

- **Date:** 2024-12-01
- **Status:** Accepted

### Context
The agent depends heavily on LLM calls for planning, code generation, and review. Relying on a single provider creates a single point of failure and limits model selection.

### Decision
Implement the Adapter pattern with a common `LLMAdapter` interface. Concrete adapters exist for Claude (Anthropic) and GPT (OpenAI). An `LLMRouter` handles failover between providers.

### Alternatives Considered
1. **Single provider (Claude only)** — Simpler but no failover or provider flexibility.
2. **LangChain** — Feature-rich but adds a heavy dependency for what we need.
3. **LiteLLM** — Python-only, not applicable.

### Rationale
The Adapter pattern keeps provider-specific code isolated. The Router adds automatic failover with metrics tracking. Adding a new provider requires only implementing the `LLMAdapter` interface.

### Trade-offs
- (+) Provider-agnostic business logic
- (+) Automatic failover reduces downtime
- (+) Easy to add new providers (Gemini, Mistral, etc.)
- (+) Cost tracking per provider
- (-) Extra abstraction layer adds indirection
- (-) Streaming support varies by provider

---

## ADR-004: ChromaDB as Vector Store

- **Date:** 2024-12-01
- **Status:** Accepted

### Context
The indexer needs to store code embeddings and perform semantic similarity search to find relevant code chunks for a given issue.

### Decision
Use ChromaDB as the vector store, accessed via its TypeScript client.

### Alternatives Considered
1. **Pinecone** — Managed service, but adds cost and external dependency.
2. **Weaviate** — Feature-rich but heavier to self-host.
3. **pgvector (PostgreSQL)** — Requires PostgreSQL; overkill for our use case.
4. **In-memory (FAISS)** — No persistence, not suitable for production.

### Rationale
ChromaDB is open-source, lightweight, easy to run locally or in Docker, has a good TypeScript client, and supports the embedding + search workflow we need with minimal configuration.

### Trade-offs
- (+) Open-source and free
- (+) Simple API — upsert and query
- (+) Runs locally or as a Docker container
- (+) Good TypeScript client
- (-) Less mature than Pinecone for production workloads
- (-) Limited filtering capabilities compared to Weaviate
- (-) No built-in replication or sharding

---

## ADR-005: Docker for Sandboxing

- **Date:** 2024-12-01
- **Status:** Accepted

### Context
The agent applies patches and runs tests on untrusted code. This must happen in an isolated environment to prevent damage to the host system.

### Decision
Use Docker containers as sandboxes. Each agent run creates a fresh container, mounts the repository, runs tests, and destroys the container.

### Alternatives Considered
1. **Firecracker microVMs** — Stronger isolation but significantly more complex to set up.
2. **gVisor** — Good security but adds runtime overhead and compatibility issues.
3. **Direct execution** — No isolation; unacceptable security risk.
4. **Nix sandboxes** — Good isolation but niche tooling.

### Rationale
Docker provides sufficient isolation for our threat model (running test suites on code we generated). It is widely available, well-documented, and integrates easily via the `dockerode` library.

### Trade-offs
- (+) Widely available on all platforms
- (+) Strong process and filesystem isolation
- (+) Easy to set resource limits (CPU, memory, time)
- (+) Mature ecosystem with `dockerode` TypeScript bindings
- (-) Container startup adds latency (~2-5 seconds)
- (-) Docker socket access is itself a security consideration
- (-) Not as strong as VM-level isolation (Firecracker)

---

## ADR-006: Unified Diff for Patches

- **Date:** 2024-12-01
- **Status:** Accepted

### Context
The agent generates code changes that must be applied to a repository. The format needs to be parseable, reviewable, and compatible with standard tooling.

### Decision
Use the unified diff format (as produced by `git diff`) for all patches.

### Alternatives Considered
1. **Full file replacement** — Simpler but makes review harder and wastes tokens.
2. **AST-based transforms** — More precise but language-specific and complex.
3. **JSON patch format** — Not standard for code; no tooling support.

### Rationale
Unified diff is the standard format for code changes. It is understood by `git apply`, GitHub PR diffs, and human reviewers. It also minimizes token usage by only including changed lines with context.

### Trade-offs
- (+) Standard format understood by all git tooling
- (+) Human-readable and reviewable
- (+) Minimal token usage (only changed lines + context)
- (+) Works with `git apply` directly
- (-) LLMs sometimes generate malformed diffs
- (-) Line number sensitivity — small context shifts break patches

---

## ADR-007: Language-Agnostic via Heuristics

- **Date:** 2024-12-01
- **Status:** Accepted

### Context
The agent should work with repositories in any programming language, not just TypeScript.

### Decision
Use language-agnostic heuristics for codebase analysis: file extension detection, universal chunking (line-based with overlap), and LLM-based understanding rather than language-specific parsers.

### Alternatives Considered
1. **Tree-sitter parsers** — Language-specific AST parsing; accurate but requires a parser per language.
2. **Language Server Protocol (LSP)** — Rich semantic info but heavy to set up per language.
3. **TypeScript-only** — Simplest but too limiting.

### Rationale
By relying on file extension detection for language identification and line-based chunking with overlap, the system works with any language without additional parsers. The LLM handles semantic understanding regardless of language.

### Trade-offs
- (+) Works with any programming language out of the box
- (+) No per-language parser dependencies
- (+) Simpler codebase and maintenance
- (-) Less precise chunking than AST-based approaches
- (-) May split functions/classes at suboptimal boundaries
- (-) Language detection is heuristic-based (file extensions)

---

## ADR-008: BullMQ for Job Queue

- **Date:** 2024-12-01
- **Status:** Accepted

### Context
GitHub webhooks arrive asynchronously and agent runs take 30-120 seconds. We need a job queue to decouple webhook reception from agent execution, with retry and concurrency control.

### Decision
Use BullMQ backed by Redis for job queue management.

### Alternatives Considered
1. **RabbitMQ** — Powerful but requires a separate broker service with more complex setup.
2. **AWS SQS** — Managed but adds cloud vendor lock-in.
3. **In-process queue** — No persistence; lost on restart.
4. **PostgreSQL-based queue (Graphile Worker)** — Good but adds PostgreSQL dependency.

### Rationale
BullMQ is Redis-based, has excellent TypeScript support, provides built-in retry with exponential backoff, rate limiting, priority queues, and a dashboard (Bull Board). Redis is already lightweight and commonly available.

### Trade-offs
- (+) Excellent TypeScript-first API
- (+) Built-in retry, backoff, rate limiting, priorities
- (+) Redis is lightweight and easy to run
- (+) Bull Board provides a monitoring dashboard
- (-) Requires Redis as an additional service
- (-) Redis is single-threaded; may bottleneck at very high scale
- (-) No built-in dead-letter queue patterns (requires manual setup)

---

## ADR-009: Self-Reflection/Critic as Optional Module

- **Date:** 2024-12-01
- **Status:** Accepted

### Context
LLM-generated patches may contain bugs, security issues, or style problems. A review step improves quality but adds cost and latency.

### Decision
Implement a critic module that scores patches on 5 criteria (correctness, security, style, completeness, simplicity) with a passing threshold of 60/100. The critic is integrated into the agent loop but can be bypassed via configuration.

### Alternatives Considered
1. **No review** — Faster but lower quality; relies entirely on test results.
2. **External code review tool (SonarQube, CodeClimate)** — More thorough but adds external dependency and latency.
3. **Multiple LLM reviewers** — Higher quality but 2-3x the cost.

### Rationale
A single LLM-based critic provides a good balance of quality improvement and cost. The scoring system (5 criteria, 0-20 each) gives structured feedback that can guide retry attempts. Making it optional lets users trade quality for speed when needed.

### Trade-offs
- (+) Catches issues that tests alone miss (security, style, completeness)
- (+) Structured scoring enables data-driven quality tracking
- (+) Feedback from failed reviews improves retry quality
- (+) Optional — can be disabled for cost/speed
- (-) Adds one extra LLM call per attempt (~$0.01-0.05)
- (-) LLM reviewing LLM output has inherent limitations
- (-) Score threshold (60) is somewhat arbitrary
