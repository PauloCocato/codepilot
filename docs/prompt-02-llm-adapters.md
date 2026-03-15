# Prompt 2: LLM Adapters (Claude + OpenAI + Router)

> Cole este prompt no Claude Code após completar o Prompt 1.
> O monorepo já deve estar configurado e o typecheck passando.

---

## Prompt

```
Implemente o sistema de LLM Adapters para o CodePilot. Este é o building block mais fundamental — toda comunicação com LLMs passa por aqui.

## Contexto
Leia o CLAUDE.md na raiz do projeto para entender as convenções.
Leia packages/shared/src/types.ts para ver as interfaces base.

## O que implementar:

### 1. apps/agent/src/llm/adapter.ts
Interface base + tipos auxiliares:
- Estenda a interface LLMAdapter de packages/shared com:
  - `stream()` que retorna AsyncGenerator<StreamChunk>
  - `estimateCost()` que recebe CompletionParams e retorna estimativa
- Tipo `StreamChunk`: { type: 'text' | 'done', content?: string }
- Tipo `CostEstimate`: { estimatedInputTokens, estimatedOutputTokens, estimatedCostUsd }
- Tipo `LLMError` (custom error class): { code: 'rate_limit' | 'context_too_long' | 'api_error' | 'timeout', provider, retryable: boolean, retryAfterMs?: number }

### 2. apps/agent/src/llm/claude.ts
Adapter para Claude API:
- Usa @anthropic-ai/sdk
- Model default: 'claude-sonnet-4-20250514'
- Implementa complete() com retry automático para rate limits (max 3, exponential backoff)
- Implementa stream() usando client.messages.stream()
- Implementa estimateCost() com pricing:
  - Sonnet input: $3/MTok, output: $15/MTok
  - Haiku input: $0.25/MTok, output: $1.25/MTok
- Loga cada chamada com Pino: { provider: 'claude', model, inputTokens, outputTokens, costUsd, latencyMs }
- Trata erros da API e converte para LLMError com retryable flag

### 3. apps/agent/src/llm/openai.ts
Adapter para OpenAI:
- Usa pacote 'openai'
- Model default: 'gpt-4o'
- Mesma interface que claude.ts
- Pricing: gpt-4o input $2.50/MTok, output $10/MTok
- Retry automático para rate limits

### 4. apps/agent/src/llm/router.ts
Router inteligente entre providers:
- Construtor recebe: { primary: LLMAdapter, fallback?: LLMAdapter }
- complete(): tenta primary, se falhar com retryable=false ou após max retries, tenta fallback
- Loga cada decisão de routing: { action: 'primary' | 'fallback', reason }
- Expõe métricas: { primarySuccessRate, fallbackSuccessRate, totalCalls, totalCostUsd }

### 5. Testes (apps/agent/src/llm/*.test.ts)
- claude.test.ts: mock do SDK, testa complete, stream, retry em rate limit, estimateCost
- openai.test.ts: mesmo pattern
- router.test.ts: testa fallback quando primary falha, métricas acumulam corretamente
- Pelo menos 10 test cases no total

## Regras:
- NUNCA faça chamadas reais a APIs nos testes — use mocks
- Toda função pública precisa de JSDoc com @example
- Use Zod para validar as respostas das APIs antes de retornar
- Rode `npm run test` e `npm run typecheck` e garanta que ambos passam
- Commit: "feat: implement LLM adapters with Claude, OpenAI, and smart router"
```

---

## Resultado esperado
Sistema completo de LLM adapters com fallback automático, tracking de custo, e cobertura de testes. Você pode testar com uma chave de API real para validar.

## Próximo prompt
→ `prompt-03-github-integration.md`
