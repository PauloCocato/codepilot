# CodePilot — Project Instructions

> Este arquivo é o CLAUDE.md do projeto. Ele é lido automaticamente pelo Claude Code
> e define as convenções, regras e contexto que todos os agentes devem seguir.

## Project Overview

CodePilot é um agente autônomo que resolve issues do GitHub automaticamente.
Ele lê uma issue, analisa o codebase, gera um patch, roda testes em sandbox, e abre um PR.

## Tech Stack

- **Runtime:** Node.js 20+ com TypeScript (strict mode)
- **Framework HTTP:** Fastify
- **LLM Providers:** Claude API (@anthropic-ai/sdk) + OpenAI (openai) via adapter pattern
- **Vector DB:** ChromaDB (dev) / Pinecone (prod)
- **Database:** PostgreSQL via Supabase (@supabase/supabase-js)
- **Queue:** BullMQ + Redis (ioredis)
- **Sandbox:** Docker via dockerode
- **Git:** simple-git
- **GitHub:** @octokit/rest + @octokit/webhooks
- **Validation:** Zod
- **Logging:** Pino
- **Testing:** Vitest
- **Monorepo:** Turborepo

## Project Structure

```
codepilot/
├── apps/
│   ├── agent/src/          # Core agent service
│   │   ├── agent/          # Agent loop, planner, generator, runner, critic
│   │   ├── llm/            # LLM adapters (Claude, OpenAI, router)
│   │   ├── github/         # GitHub App, issues, repos, PRs
│   │   ├── indexer/        # Embeddings, chunking, vector store
│   │   ├── sandbox/        # Docker execution sandbox
│   │   ├── safety/         # Safety evaluation layer
│   │   └── utils/          # Logger, cost tracker, config
│   └── dashboard/          # Next.js dashboard (Phase 2)
├── packages/
│   ├── shared/             # Shared types and constants
│   └── safety-sdk/         # Extractable safety SDK
├── evals/                  # Benchmarks and evaluation suites
└── docs/                   # DECISIONS.md, ARCHITECTURE.md
```

## Code Conventions

### TypeScript
- Use `strict: true` in tsconfig
- Prefer `interface` over `type` for object shapes
- Use `readonly` on properties that shouldn't change
- Export types from a `types.ts` file in each module
- Use Zod for runtime validation of external inputs (API responses, webhooks, config)

### Naming
- Files: `kebab-case.ts`
- Interfaces/Types: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Enum values: `PascalCase`

### Error Handling
- Use custom error classes extending `Error` with `code` property
- Never swallow errors silently — always log with context
- Use Result pattern (`{ success: true, data } | { success: false, error }`) for agent operations
- Throw only for truly exceptional cases (programmer errors, missing config)

### Testing
- Test files: `*.test.ts` colocated with source
- Use Vitest with `describe`/`it` blocks
- Mock external services (GitHub API, LLM API) in unit tests
- Integration tests use real Docker but mock LLM responses
- Name tests as sentences: `it('should return relevant files for a bug report')`

### Logging
- Use Pino structured logging everywhere
- Every agent step must log: `{ step, issueNumber, attempt, durationMs }`
- Log LLM cost on every completion: `{ provider, model, inputTokens, outputTokens, costUsd }`
- Log levels: `error` (failures), `warn` (retries), `info` (steps), `debug` (details)

### Git Conventions
- Branch naming: `feat/description`, `fix/description`, `refactor/description`
- Commit messages: conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`)
- One logical change per commit
- Always include tests with new features

## Architecture Principles

1. **Adapter Pattern for LLMs** — All LLM interaction goes through the `LLMAdapter` interface. Adding a new provider means implementing one interface.
2. **Separation of Concerns** — Each directory owns one responsibility. `agent/` orchestrates, `llm/` talks to models, `github/` talks to GitHub, etc.
3. **Fail Loudly, Recover Gracefully** — Log every failure with full context. Retry with different approach when possible. Report failure to user when not.
4. **Cost Awareness** — Track and log the cost of every LLM call. Users should always know what they're spending.
5. **Safety by Default** — Never execute untrusted code outside Docker sandbox. Never commit to main without review. Validate all external input.

## Key Interfaces

```typescript
// LLM Adapter — all providers implement this
interface LLMAdapter {
  readonly provider: string;
  complete(params: CompletionParams): Promise<CompletionResult>;
  stream(params: CompletionParams): AsyncGenerator<StreamChunk>;
  estimateCost(params: CompletionParams): CostEstimate;
}

// Agent Result — every agent run produces this
interface AgentResult {
  success: boolean;
  issueNumber: number;
  patch?: string;
  explanation?: string;
  prUrl?: string;
  attempts: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  safetyScore?: number;
  error?: string;
}

// Parsed Issue — structured representation of a GitHub issue
interface ParsedIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  repoOwner: string;
  repoName: string;
  fileMentions: string[];
  stepsToReproduce?: string;
  expectedBehavior?: string;
}
```

## Commands

```bash
npm run dev          # Start agent in development mode
npm run build        # Build all packages
npm run test         # Run all tests
npm run test:unit    # Run unit tests only
npm run test:int     # Run integration tests
npm run lint         # ESLint + Prettier check
npm run typecheck    # TypeScript type checking
```

## Environment Variables

```
# Required
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GITHUB_APP_ID=...
GITHUB_PRIVATE_KEY=...
GITHUB_WEBHOOK_SECRET=...

# Optional (defaults shown)
LLM_PRIMARY_PROVIDER=claude        # claude | openai
LLM_FALLBACK_PROVIDER=openai       # claude | openai | none
VECTOR_DB=chroma                    # chroma | pinecone
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info                      # debug | info | warn | error
SANDBOX_TIMEOUT_MS=60000
MAX_RETRIES=3
```
