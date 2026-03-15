# Prompt 1: Setup do Monorepo

> Cole este prompt no Claude Code para executar a primeira tarefa.
> Pré-requisito: Node.js 20+, Docker instalado, diretório vazio para o projeto.

---

## Prompt

```
Crie a estrutura inicial do projeto CodePilot — um monorepo TypeScript com Turborepo.

## O que criar:

1. **Monorepo root** com Turborepo:
   - turbo.json com pipelines: build, test, lint, typecheck, dev
   - package.json root com workspaces: ["apps/*", "packages/*"]
   - tsconfig.base.json com strict: true, target ES2022, module NodeNext
   - .gitignore (node_modules, dist, .env, .turbo)
   - .env.example com todas as variáveis listadas abaixo

2. **apps/agent** — o serviço principal:
   - package.json com dependências:
     - Prod: fastify, @anthropic-ai/sdk, openai, @octokit/rest, @octokit/webhooks, simple-git, dockerode, bullmq, ioredis, chromadb, pino, pino-pretty, zod, dotenv
     - Dev: typescript, @types/node, vitest, tsx, eslint, prettier
   - tsconfig.json extendendo tsconfig.base.json
   - Criar TODAS as pastas vazias com um index.ts placeholder em cada:
     - src/agent/ (loop, planner, searcher, generator, runner, critic, types)
     - src/llm/ (adapter, claude, openai, router)
     - src/github/ (app, issues, repos, prs)
     - src/indexer/ (embeddings, chunker, store)
     - src/sandbox/ (docker, executor)
     - src/safety/ (evaluator, rules/, report)
     - src/utils/ (logger, cost, config)
   - src/index.ts como entry point (Fastify server placeholder)

3. **packages/shared**:
   - package.json
   - src/types.ts com as interfaces: LLMAdapter, CompletionParams, CompletionResult, AgentResult, ParsedIssue (copie exatamente do CLAUDE.md)
   - src/constants.ts com: MAX_RETRIES=3, SANDBOX_TIMEOUT_MS=60000, DEFAULT_TEMPERATURE=0.2
   - src/index.ts re-exportando tudo

4. **docker-compose.yml** para dev:
   - PostgreSQL 16 (porta 5432)
   - Redis 7 (porta 6379)
   - ChromaDB (porta 8000)

5. **docs/**:
   - DECISIONS.md com o template de ADR
   - ARCHITECTURE.md com placeholder

6. **.github/workflows/ci.yml**:
   - Roda em push e PR
   - Steps: checkout, setup node 20, npm install, typecheck, lint, test

## Variáveis de ambiente (.env.example):
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY=base64-encoded-key
GITHUB_WEBHOOK_SECRET=whsec_xxx
LLM_PRIMARY_PROVIDER=claude
LLM_FALLBACK_PROVIDER=openai
VECTOR_DB=chroma
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/codepilot
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
SANDBOX_TIMEOUT_MS=60000
MAX_RETRIES=3

## Regras:
- Cada index.ts placeholder deve exportar pelo menos um tipo ou função stub
- Todos os imports devem usar caminhos relativos com extensão .js (ESM)
- Depois de criar tudo, rode: npm install && npm run typecheck
- Se typecheck falhar, corrija até passar
- Faça um commit: "feat: initial monorepo setup with Turborepo"
```

---

## Resultado esperado
Após rodar este prompt, você terá um monorepo funcional com todas as pastas, tipos compartilhados, Docker Compose para dev, e CI/CD configurado. O `npm run typecheck` deve passar sem erros.

## Próximo prompt
→ `prompt-02-llm-adapters.md`
