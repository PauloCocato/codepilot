# Prompt 6: Agent Loop (O Coração do Sistema)

> Cole este prompt no Claude Code após completar o Prompt 5.
> Todos os módulos anteriores (llm, github, indexer, sandbox) devem estar prontos.

---

## Prompt

```
Implemente o Agent Loop principal do CodePilot. Este é o coração do sistema —
ele orquestra todos os outros módulos para resolver uma issue do GitHub de ponta a ponta.

## Contexto
Leia o CLAUDE.md para convenções.
Módulos prontos: llm/ (adapters), github/ (issues, repos, prs), indexer/ (search), sandbox/ (Docker).

## O que implementar:

### 1. apps/agent/src/agent/types.ts
Tipos do agent:
- `AgentConfig`: { llm: LLMAdapter, vectorStore: VectorStore, sandboxManager: SandboxManager, octokit: Octokit, maxRetries: number, maxContextTokens: number }
- `AgentStep`: { name: string, status: 'running' | 'success' | 'failed', durationMs: number, details?: string }
- `AgentRun`: { id: string, issueNumber: number, steps: AgentStep[], result: AgentResult, startedAt: Date, completedAt?: Date }
- Re-exporte AgentResult de packages/shared

### 2. apps/agent/src/agent/planner.ts
Planejador de soluções:
- `createPlan(issue, codeContext, llm)` → Plan
- `Plan`: { summary: string, steps: PlanStep[], estimatedFiles: string[], approach: string }
- `PlanStep`: { description: string, files: string[], action: 'modify' | 'create' | 'delete' }
- System prompt do planner (inclua no arquivo):
  ```
  You are CodePilot's planning module. Given a GitHub issue and relevant code context,
  create a step-by-step plan to resolve the issue.

  Rules:
  - Be specific: name exact files and functions to change
  - Be minimal: only change what's necessary
  - Consider edge cases and potential regressions
  - If the issue is ambiguous, state your assumptions explicitly
  - Output valid JSON matching the Plan schema
  ```
- Parse a resposta do LLM com Zod validation
- Se o parse falha, retry com feedback "Your response was not valid JSON. Please try again."

### 3. apps/agent/src/agent/generator.ts
Gerador de patches:
- `generatePatch(issue, codeContext, plan, llm, previousError?)` → PatchResult
- `PatchResult`: { patch: string, explanation: string, filesChanged: string[] }
- System prompt do generator:
  ```
  You are CodePilot's code generation module. Given a plan and code context,
  generate a unified diff patch that implements the plan.

  Rules:
  - Output ONLY a valid unified diff wrapped in ```diff markers
  - Minimal changes — only modify what the plan requires
  - Match the existing code style exactly (indentation, quotes, semicolons)
  - Add tests for your changes if the project has a test directory
  - Never introduce new dependencies without explicit need
  - If you need to create a new file, use the format:
    --- /dev/null
    +++ b/path/to/new/file.ts
  ```
- Se `previousError` é fornecido, inclua no prompt: "Previous attempt failed: {error}. Try a different approach."
- Extrai e valida o diff da resposta
- Se diff inválido, retry com feedback

### 4. apps/agent/src/agent/runner.ts
Executor de testes via sandbox:
- `runInSandbox(repoPath, patch, sandboxManager)` → RunResult
- `RunResult`: { patchApplied: boolean, testsRan: boolean, testsPassed: boolean, output: string, error?: string }
- Fluxo:
  1. Cria sandbox com o repo
  2. Aplica o patch (git apply)
  3. Instala dependências se necessário
  4. Roda testes do projeto
  5. Captura output e cleanup
- Se patch falha ao aplicar: retorna { patchApplied: false, error: "..." }
- Se testes falham: retorna output completo para o agent tentar de novo

### 5. apps/agent/src/agent/critic.ts
Auto-review do código gerado (optional, enable via config):
- `reviewPatch(patch, issue, codeContext, llm)` → CriticResult
- `CriticResult`: { score: number (0-100), passed: boolean (score >= 60), feedback: string, issues: CriticIssue[] }
- `CriticIssue`: { severity: 'error' | 'warning' | 'info', description: string, file?: string, line?: number }
- System prompt do critic:
  ```
  You are CodePilot's code review module. Review this patch critically.

  Evaluate on 5 criteria (0-20 points each, total max 100):
  1. CORRECTNESS: Does the patch actually fix the issue described?
  2. SECURITY: Does it introduce any security vulnerabilities?
  3. STYLE: Does it match the existing code style?
  4. COMPLETENESS: Are edge cases handled? Are tests included?
  5. SIMPLICITY: Is it the minimal change needed?

  Output valid JSON with your scores, feedback, and specific issues found.
  ```
- Parse com Zod validation

### 6. apps/agent/src/agent/loop.ts ⭐ (Main orchestrator)
O loop principal que conecta tudo:
- `runAgent(issueUrl, config)` → AgentRun
- Fluxo completo:
  ```
  1. PARSE — Extrai owner/repo/number da URL, busca issue via GitHub API
  2. INDEX — Clona repo, indexa codebase (ou usa cache se já indexado)
  3. SEARCH — Busca código relevante para a issue
  4. PLAN — Cria plano de resolução
  5. GENERATE — Gera patch baseado no plano
  6. TEST — Aplica patch e roda testes no sandbox
  7. CRITIC — (se habilitado) Revisa o patch
  8. DECIDE:
     - Se testes passam E critic aprova → SUBMIT
     - Se testes falham → RETRY com error feedback (max 3)
     - Se critic reprova → RETRY com critic feedback (max 2)
     - Se max retries → FAIL
  9. SUBMIT — Cria branch, commita, abre PR, comenta na issue
  10. CLEANUP — Remove sandbox, remove clone (mantém index)
  ```
- Cada step é logado como AgentStep com timing
- Se qualquer step falha com erro não-recuperável, comenta na issue explicando
- Retorna AgentRun completo com todos os steps e resultado final

### 7. apps/agent/src/index.ts
Entry point atualizado:
- Fastify server com rotas:
  - `POST /webhook` — recebe webhooks do GitHub (usa github/app.ts)
  - `POST /api/resolve` — API manual: { issueUrl } → AgentRun
  - `GET /api/health` — healthcheck com versão e uptime
  - `GET /api/stats` — métricas: { totalRuns, successRate, totalCostUsd, avgDurationMs }
- BullMQ worker que processa jobs da fila (criados pelo webhook handler)
- Graceful shutdown: limpa sandboxes, drena fila

### 8. Testes
- planner.test.ts: mock LLM, testa geração de plano + Zod validation + retry
- generator.test.ts: mock LLM, testa extração de diff + retry em diff inválido
- runner.test.ts: mock sandbox, testa fluxo apply → install → test
- critic.test.ts: mock LLM, testa scoring + pass/fail threshold
- loop.test.ts: ⭐ mock ALL dependencies, testa:
  - Happy path: issue → PR em 1 tentativa
  - Retry path: testes falham, agent tenta de novo e sucesso na 2ª
  - Fail path: max retries esgotados → comenta falha na issue
  - Critic rejection: critic reprova → retry com feedback
- Pelo menos 20 test cases no total

## Regras:
- O agent loop NUNCA deve crashar — toda exceção é capturada e logada
- Cada step tem timeout individual
- Custo acumulado é trackeado e logado ao final de cada run
- Se custo de um único run exceder $1.00, aborta e reporta
- Sempre cleanup sandboxes, mesmo em caso de erro (use try/finally)
- O loop deve ser idempotente: rodar 2x na mesma issue não cria 2 PRs
- Rode `npm run test` e `npm run typecheck`
- Commit: "feat: implement agent loop — full issue-to-PR pipeline"
```

---

## Resultado esperado
🎉 Neste ponto, o CodePilot funciona end-to-end! Você pode enviar uma URL de issue e ele:
1. Lê a issue
2. Clona o repo
3. Encontra código relevante
4. Planeja a solução
5. Gera o patch
6. Testa no sandbox
7. Abre um PR

## Próximo prompt
→ `prompt-07-e2e-test-and-polish.md` (teste end-to-end real + README profissional)
