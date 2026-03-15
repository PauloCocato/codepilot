# Prompt 7: Teste E2E Real + README Profissional + DECISIONS.md

> Cole este prompt no Claude Code após completar o Prompt 6.
> O agent loop completo já deve estar implementado.

---

## Prompt

```
Agora vamos testar o CodePilot end-to-end com uma issue real e criar a documentação profissional.

## Parte 1: Teste End-to-End

### 1.1 Criar repositório de teste
Crie um repo de teste chamado `codepilot-test-repo` em apps/agent/tests/e2e/test-repo/ com:
- package.json com "test": "vitest run"
- src/math.ts com funções: add, subtract, multiply, divide
- A função `divide` tem um bug: não trata divisão por zero (retorna Infinity ao invés de throw)
- tests/math.test.ts com testes que PASSAM para add, subtract, multiply
- tests/math.test.ts com um teste que FALHA para divide por zero

### 1.2 Criar issue de teste
Crie em apps/agent/tests/e2e/test-issue.json:
```json
{
  "number": 1,
  "title": "Bug: divide function doesn't handle division by zero",
  "body": "## Bug Report\n\nThe `divide` function in `src/math.ts` returns `Infinity` when dividing by zero instead of throwing an error.\n\n## Steps to Reproduce\n1. Call `divide(10, 0)`\n2. Returns `Infinity` instead of throwing\n\n## Expected Behavior\nShould throw an Error with message 'Division by zero'\n\n## Actual Behavior\nReturns `Infinity`",
  "labels": ["bug", "codepilot"]
}
```

### 1.3 Teste E2E automatizado
Crie apps/agent/tests/e2e/agent.e2e.test.ts:
- Usa o test-repo e test-issue como input
- Mock GitHub API (não precisa clonar de verdade, usa o repo local)
- Usa LLM adapter REAL (Claude ou OpenAI) — precisa de API key
- O agent deve:
  1. Parsear a issue
  2. Indexar o test-repo
  3. Encontrar src/math.ts como arquivo relevante
  4. Gerar um patch que adiciona tratamento de divisão por zero
  5. Aplicar o patch e rodar testes — testes devem PASSAR
- Marcar com `{ timeout: 120000 }` (2 minutos)
- Skip se API keys não configuradas: `describe.skipIf(!process.env.ANTHROPIC_API_KEY)`

## Parte 2: README.md Profissional

Crie um README.md na raiz do projeto com:

### Estrutura:
1. **Logo/Banner** — ASCII art simples "CodePilot" + tagline
2. **Badges** — TypeScript, License MIT, Tests, CI status
3. **One-liner** — "AI agent that resolves GitHub issues automatically"
4. **Demo GIF placeholder** — `![Demo](docs/demo.gif)` com nota "Coming soon"
5. **How it works** — Diagrama ASCII do fluxo (issue → PR) em 6 steps
6. **Quick Start** — Instalação em 5 comandos
7. **Configuration** — Tabela de variáveis de ambiente
8. **Architecture** — Breve explicação + link para docs/ARCHITECTURE.md
9. **Benchmarks** — Placeholder para resultados do SWE-bench
10. **Contributing** — Como contribuir
11. **License** — MIT

### Tom: Profissional mas acessível. Imagine um dev scrollando pelo GitHub — ele deve entender o que é em 5 segundos e querer testar em 30 segundos.

## Parte 3: DECISIONS.md Completo

Atualize docs/DECISIONS.md com ADRs para TODAS as decisões feitas até agora:
- ADR-001: Monorepo com Turborepo
- ADR-002: TypeScript + Fastify
- ADR-003: Multi-Provider LLM com Adapter Pattern
- ADR-004: ChromaDB como vector store (dev)
- ADR-005: Docker para sandboxing
- ADR-006: Unified diff para patches (vs AST manipulation)
- ADR-007: Language-agnostic via heurísticas (vs AST por linguagem)
- ADR-008: BullMQ para job queue
- ADR-009: Self-reflection/Critic como módulo opcional

Cada ADR deve ter: Data, Status, Contexto, Decisão, Alternativas, Razão, Trade-off.
IMPORTANTE: Seja HONESTO sobre os trade-offs. Isso é o que impressiona recrutadores.

## Parte 4: ARCHITECTURE.md

Atualize docs/ARCHITECTURE.md com:
- Diagrama de componentes (ASCII) mostrando como os módulos se conectam
- Fluxo de dados de uma issue até um PR (sequência)
- Explicação de cada módulo (2-3 frases cada)
- Decisões de segurança e por que foram tomadas

## Regras:
- README deve ser impecável — esta é a primeira impressão do projeto
- DECISIONS.md deve ser brutalmente honesto sobre trade-offs
- O teste E2E pode usar API real — mas documente o custo estimado
- Rode todos os testes: `npm run test`
- Commit: "feat: add E2E test, README, DECISIONS.md, and ARCHITECTURE.md"
```

---

## Resultado esperado
🏆 Projeto completo com teste E2E real, documentação profissional, e registro de decisões técnicas. Pronto para publicar no GitHub e começar a usar.

## Prompts Futuros (Fase 2+)
- prompt-08-safety-layer.md — SafetyGuard evaluation layer
- prompt-09-dashboard.md — Next.js dashboard de configuração
- prompt-10-github-marketplace.md — Publicar como GitHub App
