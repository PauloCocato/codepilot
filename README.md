# CodePilot — Prompts para Claude Code

## Como Usar Este Sistema

Estes prompts foram desenhados para que o Claude Code implemente o CodePilot
módulo por módulo, de forma incremental e testável.

### Arquitetura dos Prompts

```
CLAUDE.md              → Regras globais (Claude Code lê automaticamente)
  │
  ├── prompt-01        → Setup do monorepo (fundação)
  │     │
  │     ├── prompt-02  → LLM Adapters (Claude + OpenAI + Router)
  │     │
  │     ├── prompt-03  → GitHub Integration (Issues, Repos, PRs)
  │     │
  │     ├── prompt-04  → Codebase Indexer (Embeddings + Search)
  │     │
  │     ├── prompt-05  → Docker Sandbox (execução segura)
  │     │
  │     ├── prompt-06  → Agent Loop (orquestrador principal) ⭐
  │     │
  │     └── prompt-07  → E2E Test + README + DECISIONS.md
  │
  └── (futuros)
        ├── prompt-08  → Safety Evaluation Layer
        ├── prompt-09  → Dashboard Next.js
        └── prompt-10  → GitHub Marketplace
```

### Passo a Passo

#### 1. Preparação
```bash
# Crie o diretório do projeto
mkdir codepilot && cd codepilot
git init

# Copie o CLAUDE.md para a raiz
cp CLAUDE.md ./CLAUDE.md
```

#### 2. Execute Cada Prompt em Ordem
Abra o Claude Code na pasta `codepilot/` e cole o conteúdo do bloco
``` ``` de cada prompt, um por vez:

```bash
# No terminal, dentro da pasta codepilot:
claude   # abre o Claude Code

# Cole o prompt-01 (setup) → espere completar → verifique
# Cole o prompt-02 (LLM) → espere completar → verifique
# ... e assim por diante
```

#### 3. Verifique Cada Etapa
Após cada prompt, confirme que:
- `npm run typecheck` passa
- `npm run test` passa
- `git log` mostra o commit correto

#### 4. Dicas de Uso

**Se o Claude Code errar:**
Cole este follow-up:
```
O typecheck/teste falhou com este erro: [cole o erro].
Corrija sem alterar a arquitetura. Mantenha as convenções do CLAUDE.md.
```

**Se quiser rodar 2 prompts em paralelo (agentes separados):**
Os prompts 02, 03, 04, e 05 são INDEPENDENTES entre si.
Você pode rodar em paralelo:
- Agente A: prompt-02 (LLM) + prompt-03 (GitHub)
- Agente B: prompt-04 (Indexer) + prompt-05 (Sandbox)
O prompt-06 (Agent Loop) depende de TODOS os anteriores.

**Estimativa de tempo por prompt:**
| Prompt | Tempo estimado | Custo API estimado |
|--------|---------------|-------------------|
| 01 Setup | 5-10 min | ~$0.50 |
| 02 LLM | 15-25 min | ~$1.50 |
| 03 GitHub | 15-25 min | ~$1.50 |
| 04 Indexer | 15-25 min | ~$1.50 |
| 05 Sandbox | 10-20 min | ~$1.00 |
| 06 Loop | 25-40 min | ~$3.00 |
| 07 E2E | 15-25 min | ~$2.00 |
| **Total** | **~2-3 horas** | **~$11.00** |

### Por Que 7 Prompts e Não 1?

1. **Contexto limitado** — Cada prompt cabe confortavelmente na janela de contexto do Claude Code
2. **Testabilidade** — Cada módulo é testável independentemente
3. **Recuperação de erros** — Se um prompt falha, você não perde tudo
4. **Paralelismo** — Prompts 2-5 podem rodar em paralelo
5. **Qualidade** — Prompts focados produzem código melhor que um prompt gigante

### Próximos Passos Após os 7 Prompts

Com o MVP funcionando, os próximos prompts (a criar) seriam:

- **prompt-08: Safety Layer** — Avaliação de segurança do código gerado
- **prompt-09: Dashboard** — Next.js dashboard para configuração e métricas
- **prompt-10: GitHub Marketplace** — Publicar como GitHub App instalável
- **prompt-11: SWE-bench** — Runner de benchmark contra SWE-bench lite
- **prompt-12: Blog Post Generator** — Gerar blog post com findings do benchmark
