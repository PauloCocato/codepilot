# PRD: CodePilot — Agente Autônomo de Resolução de Issues

**Autor:** Cocato
**Data:** 15 de Março de 2026
**Status:** Draft v1.0
**Stack:** TypeScript (Node.js) | Multi-provider LLM | Language-agnostic

---

## 1. Problem Statement

Desenvolvedores gastam em média 30-40% do seu tempo em tarefas repetitivas: corrigir bugs simples, atualizar dependências, adicionar testes, e resolver issues de baixa complexidade. Em projetos open-source, issues "good first issue" ficam semanas sem resolução por falta de contribuidores. Manter um codebase saudável exige esforço constante que nem sempre é viável para times pequenos ou mantedores solo.

**Quem é afetado:** Maintainers de projetos open-source, times de engenharia pequenos, devs solo que precisam escalar sua capacidade.

**Impacto de não resolver:** Issues acumulam, bugs simples degradam a experiência do usuário, e devs seniores gastam tempo em tarefas que poderiam ser automatizadas.

---

## 2. Goals

1. **Resolver automaticamente 40%+ das issues classificadas como "good first issue"** em repositórios reais dentro de 6 meses
2. **Reduzir tempo médio de resolução** de issues simples de dias para minutos
3. **Atingir 100 instalações** do GitHub App nos primeiros 3 meses
4. **Gerar US$500+/mês** de receita recorrente até o mês 6
5. **Publicar benchmark comparativo** contra SWE-bench lite com score documentado

---

## 3. Non-Goals (Fase 1)

1. **Resolver issues de arquitetura complexa** — o agent foca em bugs, testes faltantes, refactoring simples, e melhorias incrementais. Reescritas de sistema estão fora de escopo.
2. **Substituir code review humano** — o agent propõe PRs, mas sempre requer aprovação humana antes do merge.
3. **Suportar monorepos gigantes** (>100K arquivos) — otimização para repos grandes é Fase 2.
4. **Executar em hardware local do usuário** — MVP roda na cloud com sandboxing.
5. **Treinar modelos próprios** — usa APIs de LLM existentes, sem fine-tuning.

---

## 4. User Stories

### Persona 1: Open-Source Maintainer

- "Como maintainer de um projeto open-source, quero que issues marcadas como 'bug' sejam investigadas automaticamente, para que eu possa focar em features e arquitetura."
- "Como maintainer, quero revisar o diff proposto pelo agent antes de qualquer merge, para manter controle de qualidade do projeto."
- "Como maintainer, quero configurar quais tipos de issues o agent pode resolver, para evitar mudanças indesejadas em partes sensíveis do código."

### Persona 2: Dev Solo / Indie Hacker

- "Como dev solo, quero que bugs reportados pelos usuários sejam diagnosticados automaticamente, para que eu receba um PR pronto para review ao invés de ter que debugar do zero."
- "Como dev solo, quero ver quanto tempo e dinheiro cada resolução custou, para avaliar o ROI do agent."

### Persona 3: Tech Lead de Time Pequeno

- "Como tech lead, quero que o agent resolva issues de baixa prioridade que ficam no backlog há semanas, para que meu time foque no que importa."
- "Como tech lead, quero um relatório semanal do que o agent resolveu e o que falhou, para ajustar a configuração."

---

## 5. Requirements

### P0 — Must Have (MVP — Mês 1-2)

#### 5.1 Core Agent Loop
**O que:** O agent deve executar um ciclo completo de resolução: ler issue → analisar codebase → planejar solução → gerar código → rodar testes → abrir PR.

**Acceptance Criteria:**
- Agent recebe uma issue URL e produz um PR com a solução proposta
- O ciclo completo executa em menos de 5 minutos para issues simples
- Se os testes falham, o agent tenta uma abordagem alternativa (máx 3 tentativas)
- Cada passo do ciclo é logado com timestamp e raciocínio do agent
- O PR inclui descrição explicando o raciocínio e as mudanças feitas

#### 5.2 Codebase Understanding
**O que:** O agent precisa entender a estrutura do repositório para fazer mudanças contextualizadas.

**Acceptance Criteria:**
- Indexa arquivos do repositório com embeddings vetoriais
- Busca semântica retorna arquivos relevantes para uma issue em menos de 2s
- Reconhece e respeita a estrutura de diretórios (src/, test/, docs/, etc.)
- Suporta qualquer linguagem de programação (language-agnostic) através de parsing baseado em texto, não AST
- Detecta padrões do projeto: framework usado, convenções de naming, estilo de testes

#### 5.3 Multi-Provider LLM Support
**O que:** Suporte a múltiplos providers de LLM com adapter pattern.

**Acceptance Criteria:**
- Adapter para Claude API (Anthropic) funcional
- Adapter para OpenAI GPT funcional
- Interface unificada: trocar provider é mudar 1 variável de ambiente
- Fallback automático: se provider primário falha, tenta o secundário
- Logging de custo por provider por request

#### 5.4 Sandboxed Code Execution
**O que:** Executar testes e código gerado de forma segura e isolada.

**Acceptance Criteria:**
- Código roda em container Docker isolado
- Timeout de 60s por execução (configurável)
- Sem acesso à rede (exceto para instalar dependências)
- Sem acesso ao filesystem do host
- Logs de execução capturados e disponíveis para debug

#### 5.5 GitHub Integration
**O que:** Integração bidirecional com GitHub para ler issues e criar PRs.

**Acceptance Criteria:**
- GitHub App instalável com 1 clique via GitHub Marketplace
- Lê issues com labels configuráveis (default: "codepilot", "good-first-issue")
- Clona repositório automaticamente
- Cria branch com naming convention: `codepilot/issue-{number}-{slug}`
- Abre PR com template padronizado incluindo: resumo, raciocínio, mudanças, e link para a issue
- Comenta na issue original linkando o PR

### P1 — Nice to Have (Mês 3-4)

#### 5.6 Self-Reflection & Critic
**O que:** O agent revisa seu próprio código antes de submeter, avaliando qualidade e segurança.

**Acceptance Criteria:**
- Critic module avalia o diff gerado contra 5 critérios: correção, segurança, estilo, performance, completude
- Score de 0-100 para cada critério
- Se score total < 60, agent tenta abordagem diferente
- Métricas de melhoria: % de PRs aceitos com vs sem critic

#### 5.7 RAG Brain (Documentation-Aware)
**O que:** O agent consulta documentação do projeto para gerar código mais correto.

**Acceptance Criteria:**
- Indexa README, docs/, e comentários inline
- Respostas do agent citam documentação relevante
- Verificação: solução é consistente com a documentação?
- Suporta docs em múltiplos formatos: .md, .rst, .txt, docstrings

#### 5.8 Safety Evaluation Layer
**O que:** Camada que avalia se o código gerado é seguro antes de submeter o PR.

**Acceptance Criteria:**
- Detecta padrões inseguros: SQL injection, XSS, path traversal, hardcoded secrets
- Recusa gerar código que acesse dados sensíveis (env vars, credentials)
- Recusa resolver issues que pedem funcionalidade maliciosa
- Safety report incluído no PR como checklist
- Zero falsos negativos em suite de 50 testes adversariais

#### 5.9 Configuration Dashboard
**O que:** Interface web para o usuário configurar o comportamento do agent.

**Acceptance Criteria:**
- Painel web acessível após login via GitHub OAuth
- Configurar: labels monitoradas, branches alvo, limites de custo, provider de LLM
- Ver histórico de issues resolvidas com status (sucesso/falha/pendente)
- Ver custo acumulado por mês
- Pausar/retomar o agent com 1 clique

### P2 — Future Considerations (Mês 5-6+)

#### 5.10 PilotOps Monitoring
**O que:** Dashboard de monitoramento do agent em produção.

**Acceptance Criteria:**
- Métricas em tempo real: latência, custo, taxa de sucesso, safety score
- Alertas configuráveis por email/Slack
- Detecção de drift de qualidade ao longo do tempo
- Exportável como módulo standalone para outros agents

#### 5.11 Multi-Repo Support
**O que:** Um único dashboard gerenciando agents em múltiplos repositórios.

#### 5.12 Fine-tuning de Estilo
**O que:** Agent aprende o estilo de código do projeto a partir dos PRs anteriores aprovados.

#### 5.13 Integração com GitLab / Bitbucket
**O que:** Expandir além do GitHub para outras plataformas de Git.

---

## 6. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub App (Webhook)                   │
│                 Recebe events de issues                   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                   Orchestrator Service                    │
│              (Node.js + TypeScript + Fastify)             │
│                                                          │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────────┐  │
│  │ Issue     │  │ Codebase  │  │   LLM Adapter Layer  │  │
│  │ Parser    │→ │ Indexer   │→ │  ┌───────┐ ┌──────┐  │  │
│  │           │  │ (Embed +  │  │  │Claude │ │ GPT  │  │  │
│  │           │  │  Vector)  │  │  │Adapter│ │Adapt.│  │  │
│  └──────────┘  └───────────┘  │  └───────┘ └──────┘  │  │
│                               └──────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Agent Loop Engine                      │  │
│  │  Plan → Search → Generate → Test → Review → PR     │  │
│  │                                                     │  │
│  │  ┌─────────┐  ┌──────────┐  ┌───────────────────┐  │  │
│  │  │Planner  │→ │Generator │→ │  Sandbox Runner    │  │  │
│  │  │(Claude/ │  │(Code     │  │  (Docker isolated) │  │  │
│  │  │ GPT)    │  │ patches) │  │                    │  │  │
│  │  └─────────┘  └──────────┘  └───────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐ │
│  │ Critic   │  │ Safety   │  │   PR Creator           │ │
│  │ Module   │  │ Evaluator│  │   (GitHub API)         │ │
│  └──────────┘  └──────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                   Data Layer                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │PostgreSQL│  │ChromaDB/ │  │  Redis (Queue +      │  │
│  │(Issues,  │  │Pinecone  │  │   Rate Limiting)     │  │
│  │ PRs, $)  │  │(Vectors) │  │                      │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Tech Stack Detalhada

| Componente | Tecnologia | Justificativa |
|---|---|---|
| **Runtime** | Node.js 20+ com TypeScript | Escolha do desenvolvedor; excelente para I/O async |
| **Framework HTTP** | Fastify | Mais rápido que Express, schema validation nativa |
| **LLM - Claude** | @anthropic-ai/sdk | SDK oficial, streaming support |
| **LLM - OpenAI** | openai (npm) | SDK oficial, function calling |
| **Vector DB** | ChromaDB (dev) / Pinecone (prod) | ChromaDB grátis para dev; Pinecone escala melhor |
| **Embeddings** | Voyage AI ou OpenAI ada-002 | Voyage é otimizado para code; ada-002 é mais barato |
| **Database** | PostgreSQL (via Supabase) | Free tier generoso, boa DX |
| **Queue** | BullMQ + Redis | Job queue robusta para processamento async |
| **Sandbox** | Docker + dockerode | Execução isolada de código/testes |
| **Git Operations** | simple-git (npm) | Interface programática para Git |
| **GitHub API** | @octokit/rest + @octokit/webhooks | SDKs oficiais do GitHub |
| **Frontend** | Next.js 14+ | Dashboard de configuração e métricas |
| **Auth** | GitHub OAuth via NextAuth | Login com GitHub = zero fricção |
| **Deploy** | Railway ou Fly.io | PaaS simples, affordable para MVP |
| **CI/CD** | GitHub Actions | Dogfooding: CI do próprio CodePilot |
| **Monitoramento** | Pino (logging) + custom metrics | Structured logging desde o dia 1 |

---

## 8. Estrutura do Repositório

```
codepilot/
├── apps/
│   ├── agent/                    # Core agent service
│   │   ├── src/
│   │   │   ├── index.ts          # Entry point (Fastify server + webhook handler)
│   │   │   ├── agent/
│   │   │   │   ├── loop.ts       # Main agent loop: plan → search → generate → test → review
│   │   │   │   ├── planner.ts    # Analisa issue e cria plano de execução
│   │   │   │   ├── searcher.ts   # Busca semântica no codebase
│   │   │   │   ├── generator.ts  # Gera patches de código
│   │   │   │   ├── runner.ts     # Executa testes no sandbox
│   │   │   │   ├── critic.ts     # Auto-review do código gerado (P1)
│   │   │   │   └── types.ts      # Tipos compartilhados do agent
│   │   │   ├── llm/
│   │   │   │   ├── adapter.ts    # Interface base do LLM adapter
│   │   │   │   ├── claude.ts     # Adapter para Claude API
│   │   │   │   ├── openai.ts     # Adapter para OpenAI API
│   │   │   │   └── router.ts     # Roteamento + fallback entre providers
│   │   │   ├── github/
│   │   │   │   ├── app.ts        # GitHub App webhook handler
│   │   │   │   ├── issues.ts     # Ler e parsear issues
│   │   │   │   ├── repos.ts      # Clonar e gerenciar repos
│   │   │   │   └── prs.ts        # Criar PRs e comentar
│   │   │   ├── indexer/
│   │   │   │   ├── embeddings.ts # Gerar embeddings do codebase
│   │   │   │   ├── chunker.ts    # Estratégia de chunking de código
│   │   │   │   └── store.ts      # Interface com vector DB
│   │   │   ├── sandbox/
│   │   │   │   ├── docker.ts     # Gerenciar containers Docker
│   │   │   │   ├── executor.ts   # Executar comandos no sandbox
│   │   │   │   └── templates/    # Dockerfiles para diferentes runtimes
│   │   │   ├── safety/           # (P1) Safety evaluation layer
│   │   │   │   ├── evaluator.ts  # Avalia segurança do código gerado
│   │   │   │   ├── rules/        # Regras de segurança (SQL injection, XSS, etc.)
│   │   │   │   └── report.ts     # Gera safety report para o PR
│   │   │   └── utils/
│   │   │       ├── logger.ts     # Structured logging com Pino
│   │   │       ├── cost.ts       # Tracking de custo por request/provider
│   │   │       └── config.ts     # Configuração centralizada
│   │   ├── tests/
│   │   │   ├── unit/             # Testes unitários
│   │   │   ├── integration/      # Testes de integração
│   │   │   └── fixtures/         # Repos de teste e issues mock
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── dashboard/                # Next.js dashboard (P1)
│       ├── src/
│       │   ├── app/              # App Router pages
│       │   ├── components/       # React components
│       │   └── lib/              # API clients, utils
│       └── package.json
│
├── packages/
│   ├── shared/                   # Tipos e utils compartilhados
│   │   ├── src/
│   │   │   ├── types.ts          # Tipos compartilhados entre apps
│   │   │   └── constants.ts
│   │   └── package.json
│   └── safety-sdk/               # (P1) SDK extraível do SafetyGuard
│       ├── src/
│       │   ├── index.ts
│       │   └── rules/
│       └── package.json
│
├── evals/                        # Benchmarks e avaliações
│   ├── swe-bench/                # Runner contra SWE-bench lite
│   ├── adversarial/              # Issues adversariais para safety testing
│   └── results/                  # Resultados históricos
│
├── docs/
│   ├── DECISIONS.md              # Registro de decisões arquiteturais
│   ├── ARCHITECTURE.md           # Diagrama e explicação da arquitetura
│   ├── FINDINGS.md               # Descobertas e insights do desenvolvimento
│   └── SETUP.md                  # Guia de setup local
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                # Lint + testes em cada PR
│   │   ├── deploy.yml            # Deploy automático
│   │   └── evals.yml             # Roda evals semanalmente
│   └── ISSUE_TEMPLATE/
│
├── turbo.json                    # Turborepo config (monorepo)
├── package.json                  # Root package.json
├── tsconfig.base.json
├── docker-compose.yml            # Dev environment (Postgres + Redis + Chroma)
├── .env.example
├── LICENSE                       # MIT
└── README.md
```

---

## 9. Agent Loop — Fluxo Detalhado

```
┌────────────────────────────────────────────────────────────────┐
│                      AGENT LOOP                                 │
│                                                                 │
│  ┌──────┐    ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │PARSE │───►│  SEARCH  │───►│ GENERATE │───►│    TEST      │  │
│  │Issue │    │ Codebase │    │  Patch   │    │  (Sandbox)   │  │
│  └──────┘    └──────────┘    └──────────┘    └──────┬───────┘  │
│                                                      │          │
│                                              ┌───────▼───────┐  │
│                                              │  Tests pass?  │  │
│                                              └───────┬───────┘  │
│                                               YES ╱     ╲ NO   │
│                                    ┌─────────╱       ╲────────┐ │
│                                    ▼                          ▼ │
│                              ┌──────────┐          ┌─────────┐  │
│                              │  CRITIC  │          │ RETRY   │  │
│                              │  Review  │          │ (max 3) │  │
│                              └────┬─────┘          └────┬────┘  │
│                                   │                     │       │
│                          Score ≥ 60?            Retries left?   │
│                          YES ╱ ╲ NO            YES ╱  ╲ NO     │
│                          ╱     ╲               ╱      ╲        │
│                    ┌────▼──┐  ┌──▼───┐   Back to    ┌──▼───┐   │
│                    │CREATE │  │RETRY │   SEARCH     │REPORT│   │
│                    │  PR   │  │      │              │FAIL  │   │
│                    └───────┘  └──────┘              └──────┘   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Step-by-step:

**PARSE** — Extrai da issue: descrição do problema, passos para reproduzir, linguagem, arquivos mencionados, labels. Produz um `IssuePlan` estruturado.

**SEARCH** — Usando o plan, busca no codebase via embeddings os arquivos mais relevantes. Ranqueia por relevância e constrói um "contexto" com os top 10-20 arquivos.

**GENERATE** — Envia o contexto + issue para o LLM com prompt: "Dado este codebase e esta issue, gere um patch que resolve o problema. Retorne no formato unified diff."

**TEST** — Aplica o patch no sandbox Docker, instala dependências, roda a test suite do projeto. Captura stdout/stderr.

**CRITIC** (P1) — Se testes passam, o critic avalia: o patch realmente resolve a issue? Introduz vulnerabilidades? Segue o estilo do projeto? Score de 0-100.

**PR** — Se aprovado pelo critic (ou se critic está desabilitado), cria branch, commita, e abre PR no GitHub com descrição detalhada.

**RETRY** — Se testes falham ou critic rejeita, o agent recebe o feedback (error logs, critic comments) e tenta novamente com uma abordagem diferente. Máximo 3 tentativas.

**FAIL** — Se esgotou retries, comenta na issue explicando o que tentou e por que falhou. Isso é valioso: o humano ganha um diagnóstico detalhado mesmo sem solução automática.

---

## 10. LLM Adapter Interface

```typescript
// packages/shared/src/types.ts

interface LLMAdapter {
  readonly provider: 'claude' | 'openai' | 'custom';

  complete(params: CompletionParams): Promise<CompletionResult>;
  stream(params: CompletionParams): AsyncGenerator<StreamChunk>;
  estimateCost(params: CompletionParams): CostEstimate;
}

interface CompletionParams {
  systemPrompt: string;
  messages: Message[];
  maxTokens: number;
  temperature?: number;      // default: 0.2 para code gen
  tools?: ToolDefinition[];  // function calling
  responseFormat?: 'text' | 'json';
}

interface CompletionResult {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  cost: { usd: number };
  provider: string;
  model: string;
  latencyMs: number;
}

interface CostEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
}
```

---

## 11. Success Metrics

### Leading Indicators (mudam rápido)

| Métrica | Target Mês 2 | Target Mês 4 | Target Mês 6 |
|---------|-------------|-------------|-------------|
| Issues analisadas/semana | 50 | 200 | 500 |
| PRs abertos/semana | 10 | 50 | 150 |
| Taxa de tests passing (PRs) | 60% | 75% | 85% |
| Tempo médio de resolução | <5 min | <3 min | <2 min |
| GitHub App installs | 10 | 50 | 100 |

### Lagging Indicators (mudam ao longo do tempo)

| Métrica | Target Mês 3 | Target Mês 6 |
|---------|-------------|-------------|
| PRs merged (aceitos por humanos) | 20% | 40% |
| MRR (receita mensal recorrente) | US$50 | US$500 |
| SWE-bench lite score | 15% | 25% |
| NPS dos usuários | 30 | 50 |
| Blog posts publicados | 3 | 6 |

---

## 12. Open Questions

| # | Pergunta | Quem responde | Prioridade |
|---|----------|--------------|-----------|
| 1 | Qual vector DB usar em produção? ChromaDB (grátis, self-hosted) vs Pinecone (managed, $20/mês)? | Engineering | P0 — decidir na semana 2 |
| 2 | Rate limiting: quantas issues/hora por free tier? | Product | P0 — decidir antes do launch |
| 3 | Como lidar com repos privados? Precisa clonar e indexar — implicações de segurança | Engineering | P1 — antes de aceitar repos privados |
| 4 | Pricing: US$19/mês é competitivo? Pesquisar concorrentes | Product | P0 — decidir antes do launch |
| 5 | GDPR: o agent indexa código de usuários — precisamos de DPA? | Legal | P1 — antes de escalar na EU |
| 6 | Qual modelo usar para embeddings de código? Voyage-code-2 vs ada-002 | Engineering | P0 — decidir na semana 2 |

---

## 13. Competitive Landscape

| Produto | Preço | Diferencial CodePilot |
|---------|-------|-----------------------|
| GitHub Copilot | $19/mês | Copilot é autocompletar; CodePilot resolve issues inteiras |
| Devin (Cognition) | $500/mês | Enterprise. CodePilot foca em indie/open-source, 25x mais barato |
| SWE-Agent (Princeton) | Open-source | Research-only, não é produto. CodePilot é productized |
| Sweep AI | $480/mês | Enterprise pricing. CodePilot tem free tier |
| CodeRabbit | $15/mês | Review-only, não resolve. CodePilot resolve + review |

**Posicionamento:** "O Devin para indie hackers" — mesmo poder, fração do preço, foco em open-source.

---

## 14. Timeline & Milestones

| Marco | Data | Entregável |
|-------|------|-----------|
| **M1: First PR** | Semana 3 (Abril 2026) | Agent abre primeiro PR automaticamente |
| **M2: GitHub App Live** | Semana 7 (Maio 2026) | App instalável pelo GitHub Marketplace |
| **M3: SWE-bench Score** | Semana 8 (Maio 2026) | Benchmark público documentado |
| **M4: Safety Layer** | Semana 12 (Junho 2026) | SafetyGuard integrado + blog post |
| **M5: Product Hunt** | Semana 16 (Julho 2026) | Launch público |
| **M6: Monitoring** | Semana 20 (Agosto 2026) | PilotOps dashboard funcional |
| **M7: Portfolio Complete** | Semana 24 (Setembro 2026) | Tudo pronto para aplicação Anthropic/OpenAI |

---

## 15. Guia de Implementação — Como Começar HOJE

### Dia 1: Setup do Monorepo

```bash
# Criar o projeto
mkdir codepilot && cd codepilot
npx create-turbo@latest . --skip-install
npm install

# Estrutura de apps
mkdir -p apps/agent/src/{agent,llm,github,indexer,sandbox,utils}
mkdir -p apps/dashboard
mkdir -p packages/shared/src
mkdir -p evals/{swe-bench,adversarial,results}
mkdir -p docs

# Dependências core do agent
cd apps/agent
npm init -y
npm install typescript @types/node tsx fastify
npm install @anthropic-ai/sdk openai
npm install @octokit/rest @octokit/webhooks
npm install simple-git dockerode
npm install bullmq ioredis
npm install chromadb
npm install pino pino-pretty
npm install zod                    # Schema validation
npm install -D vitest @types/node

# Setup TypeScript
npx tsc --init
```

### Dia 1-2: Primeiro Arquivo — O LLM Adapter

```typescript
// apps/agent/src/llm/adapter.ts
// COMECE AQUI — este é o building block fundamental

export interface LLMAdapter {
  readonly provider: string;
  complete(params: CompletionParams): Promise<CompletionResult>;
}

export interface CompletionParams {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens: number;
  temperature?: number;
}

export interface CompletionResult {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  cost: { usd: number };
  latencyMs: number;
}
```

```typescript
// apps/agent/src/llm/claude.ts
import Anthropic from '@anthropic-ai/sdk';
import type { LLMAdapter, CompletionParams, CompletionResult } from './adapter';

export class ClaudeAdapter implements LLMAdapter {
  readonly provider = 'claude';
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(params: CompletionParams): Promise<CompletionResult> {
    const start = Date.now();
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature ?? 0.2,
      system: params.systemPrompt,
      messages: params.messages,
    });

    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      cost: { usd: this.calculateCost(response.usage) },
      latencyMs: Date.now() - start,
    };
  }

  private calculateCost(usage: { input_tokens: number; output_tokens: number }) {
    // Sonnet pricing (atualizar conforme necessário)
    return (usage.input_tokens * 3 / 1_000_000) + (usage.output_tokens * 15 / 1_000_000);
  }
}
```

### Dia 3-4: Issue Parser + GitHub Integration

```typescript
// apps/agent/src/github/issues.ts
import { Octokit } from '@octokit/rest';

export interface ParsedIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  repoOwner: string;
  repoName: string;
  language?: string;
  fileMentions: string[];    // arquivos mencionados na issue
  stepsToReproduce?: string;
  expectedBehavior?: string;
}

export async function parseIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<ParsedIssue> {
  const { data: issue } = await octokit.issues.get({
    owner, repo, issue_number: issueNumber,
  });

  return {
    number: issue.number,
    title: issue.title,
    body: issue.body || '',
    labels: issue.labels.map(l => typeof l === 'string' ? l : l.name || ''),
    repoOwner: owner,
    repoName: repo,
    fileMentions: extractFilePaths(issue.body || ''),
    stepsToReproduce: extractSection(issue.body || '', 'steps to reproduce'),
    expectedBehavior: extractSection(issue.body || '', 'expected behavior'),
  };
}

function extractFilePaths(text: string): string[] {
  // Regex para encontrar caminhos de arquivo mencionados
  const patterns = [
    /`([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)`/g,           // `src/index.ts`
    /(?:in|at|file)\s+([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)/gi, // in src/index.ts
  ];
  const files = new Set<string>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      files.add(match[1]);
    }
  }
  return [...files];
}

function extractSection(body: string, heading: string): string | undefined {
  const regex = new RegExp(`#+\\s*${heading}[\\s\\S]*?(?=#+|$)`, 'i');
  const match = body.match(regex);
  return match?.[0]?.trim();
}
```

### Dia 5-7: O Agent Loop (Versão Mínima)

```typescript
// apps/agent/src/agent/loop.ts
import type { LLMAdapter } from '../llm/adapter';
import type { ParsedIssue } from '../github/issues';
import { logger } from '../utils/logger';

interface AgentResult {
  success: boolean;
  patch?: string;           // unified diff
  explanation?: string;     // raciocínio do agent
  attempts: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  error?: string;
}

const MAX_RETRIES = 3;

export async function runAgentLoop(
  issue: ParsedIssue,
  codebaseContext: string,      // arquivos relevantes concatenados
  llm: LLMAdapter,
): Promise<AgentResult> {
  let attempts = 0;
  let totalCost = 0;
  let totalLatency = 0;
  let lastError: string | undefined;

  while (attempts < MAX_RETRIES) {
    attempts++;
    logger.info({ attempt: attempts, issue: issue.number }, 'Starting attempt');

    // Step 1: PLAN
    const plan = await llm.complete({
      systemPrompt: PLANNER_PROMPT,
      messages: [{ role: 'user', content: formatPlanRequest(issue, codebaseContext, lastError) }],
      maxTokens: 2000,
    });
    totalCost += plan.cost.usd;
    totalLatency += plan.latencyMs;

    // Step 2: GENERATE
    const generation = await llm.complete({
      systemPrompt: GENERATOR_PROMPT,
      messages: [
        { role: 'user', content: formatGenerateRequest(issue, codebaseContext, plan.content) },
      ],
      maxTokens: 4000,
    });
    totalCost += generation.cost.usd;
    totalLatency += generation.latencyMs;

    const patch = extractPatch(generation.content);
    if (!patch) {
      lastError = 'Failed to extract valid patch from LLM response';
      logger.warn({ attempt: attempts }, lastError);
      continue;
    }

    // Step 3: TEST (simplificado — versão completa usa Docker)
    // TODO: Implementar sandbox Docker na semana 3
    // Por agora, retorna o patch para review manual

    return {
      success: true,
      patch,
      explanation: plan.content,
      attempts,
      totalCostUsd: totalCost,
      totalLatencyMs: totalLatency,
    };
  }

  return {
    success: false,
    attempts,
    totalCostUsd: totalCost,
    totalLatencyMs: totalLatency,
    error: lastError || 'Max retries exceeded',
  };
}

// --- Prompts ---

const PLANNER_PROMPT = `You are CodePilot, an autonomous coding agent.
Your job is to analyze a GitHub issue and create a plan to resolve it.

Rules:
- Be specific about which files need to change and why
- Consider edge cases and potential regressions
- If the issue is unclear, state your assumptions
- Output a step-by-step plan in markdown format`;

const GENERATOR_PROMPT = `You are CodePilot, an autonomous coding agent.
Generate a code patch that resolves the issue according to the plan.

Rules:
- Output a unified diff format patch
- Only change what is necessary — minimal diffs
- Follow the existing code style of the project
- Add comments only if the code is non-obvious
- Wrap the patch in \`\`\`diff ... \`\`\` markers`;

function formatPlanRequest(
  issue: ParsedIssue,
  context: string,
  previousError?: string,
): string {
  let prompt = `## Issue #${issue.number}: ${issue.title}\n\n${issue.body}\n\n`;
  prompt += `## Relevant Code\n\n${context}\n\n`;
  if (previousError) {
    prompt += `## Previous Attempt Failed\n\n${previousError}\n\nPlease try a different approach.\n`;
  }
  prompt += `## Task\n\nAnalyze this issue and create a step-by-step plan to resolve it.`;
  return prompt;
}

function formatGenerateRequest(
  issue: ParsedIssue,
  context: string,
  plan: string,
): string {
  return `## Issue #${issue.number}: ${issue.title}\n\n${issue.body}\n\n## Relevant Code\n\n${context}\n\n## Plan\n\n${plan}\n\n## Task\n\nGenerate a unified diff patch that implements this plan. Wrap in \`\`\`diff markers.`;
}

function extractPatch(response: string): string | null {
  const match = response.match(/```diff\n([\s\S]*?)```/);
  return match?.[1]?.trim() || null;
}
```

### DECISIONS.md (começar no dia 1)

```markdown
# Architecture Decision Records

## ADR-001: Monorepo com Turborepo
**Data:** 2026-03-15
**Status:** Aceita
**Contexto:** O projeto terá múltiplos packages (agent, dashboard, shared, safety-sdk).
**Decisão:** Usar Turborepo como monorepo tool.
**Alternativas:** Nx (mais features, mais complexo), Lerna (legado), yarn workspaces puro.
**Razão:** Turborepo é simples, rápido, e suficiente para o escopo. Não preciso de generators ou plugins.
**Trade-off:** Se o projeto crescer muito, pode precisar migrar para Nx.

## ADR-002: TypeScript + Fastify
**Data:** 2026-03-15
**Status:** Aceita
**Contexto:** Escolha de runtime e framework HTTP.
**Decisão:** Node.js com TypeScript e Fastify.
**Alternativas:** Python + FastAPI (melhor ecossistema ML), Go + Fiber (performance).
**Razão:** Preferência do desenvolvedor. TypeScript oferece type safety, Fastify é o framework mais rápido do ecossistema Node.
**Trade-off:** Ecossistema de ML é mais fraco em TS que em Python. Mitigo usando APIs de LLM diretamente.

## ADR-003: Multi-Provider LLM com Adapter Pattern
**Data:** 2026-03-15
**Status:** Aceita
**Contexto:** Qual LLM usar.
**Decisão:** Interface adapter que suporta Claude e OpenAI, com fallback automático.
**Razão:** Evita vendor lock-in. Permite comparar qualidade entre providers. Fallback aumenta reliability.
**Trade-off:** Mais código para manter. Prompts podem precisar de ajuste por provider.
```

---

## 16. Ordem de Implementação — Primeiras 2 Semanas

| Dia | O Que Construir | Arquivo(s) | Teste |
|-----|----------------|-----------|-------|
| 1 | Setup monorepo + deps | turbo.json, package.json, tsconfig | `npm run build` funciona |
| 2 | LLM Adapter (Claude) | llm/adapter.ts, llm/claude.ts | Unit test: completar prompt simples |
| 3 | LLM Adapter (OpenAI) + Router | llm/openai.ts, llm/router.ts | Test: fallback funciona |
| 4 | GitHub Issue Parser | github/issues.ts | Test: parseia issue real |
| 5 | Codebase Indexer (embeddings) | indexer/embeddings.ts, chunker.ts | Test: indexa repo pequeno |
| 6 | Semantic Search | indexer/store.ts | Test: busca retorna arquivos relevantes |
| 7 | Agent Loop v1 (sem sandbox) | agent/loop.ts, planner.ts | Test: gera patch para issue simples |
| 8 | Git Operations | github/repos.ts | Test: clona, cria branch, commita |
| 9 | PR Creator | github/prs.ts | Test: abre PR real em repo de teste |
| 10 | Webhook Handler (Fastify) | index.ts, github/app.ts | Integration test: issue → PR end-to-end |
| 11 | Docker Sandbox | sandbox/docker.ts, executor.ts | Test: roda `npm test` no sandbox |
| 12 | Agent Loop v2 (com sandbox) | agent/loop.ts, runner.ts | Test: gera patch + roda testes |
| 13 | Logging + Cost tracking | utils/logger.ts, cost.ts | Métricas sendo coletadas |
| 14 | README + DECISIONS.md | docs/ | Documentação completa para GitHub |

**Ao final do dia 14, você terá:** um agent funcional que lê uma issue do GitHub, analisa o código, gera um patch, roda os testes, e abre um PR — tudo automaticamente.

---

*PRD v1.0 — CodePilot Agent — Março 2026*
