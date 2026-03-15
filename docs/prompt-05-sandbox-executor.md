# Prompt 5: Docker Sandbox Executor

> Cole este prompt no Claude Code após completar o Prompt 4.
> Pré-requisito: Docker Desktop rodando localmente.

---

## Prompt

```
Implemente o sandbox de execução Docker para o CodePilot.
Este módulo executa código gerado pelo agent em um ambiente isolado e seguro.

## Contexto
Leia o CLAUDE.md para convenções.
Os módulos llm/, github/, e indexer/ já estão prontos.

## O que implementar:

### 1. apps/agent/src/sandbox/docker.ts
Gerenciamento de containers Docker:
- `SandboxManager` class:
  - `createSandbox(config)` → Sandbox
    - config: { repoPath, language?, timeout?, memoryLimit?, networkEnabled? }
    - Copia o repo para dentro do container
    - Defaults: timeout=60s, memory=512MB, network=false
  - `destroySandbox(sandbox)` → void (remove container + volumes)
  - `listActiveSandboxes()` → Sandbox[] (para cleanup)
  - `cleanupStale(maxAgeMs)` → número de sandboxes removidos
- `Sandbox` interface: { id, containerId, status, createdAt, repoPath }
- Usa dockerode para interagir com Docker

### 2. apps/agent/src/sandbox/templates/
Dockerfiles para diferentes runtimes (detecção automática):
- `Dockerfile.node` — Node.js 20 + npm
- `Dockerfile.python` — Python 3.12 + pip
- `Dockerfile.generic` — Ubuntu com ferramentas básicas
- Todos devem:
  - Rodar como user não-root
  - Ter um WORKDIR /workspace
  - Incluir git para operações básicas
  - NÃO ter acesso à rede por default

### 3. apps/agent/src/sandbox/executor.ts
Execução de comandos no sandbox:
- `execute(sandbox, command, options?)` → ExecutionResult
  - options: { timeout?, env?, stdin? }
  - `ExecutionResult`: { exitCode, stdout, stderr, durationMs, timedOut }
- `installDependencies(sandbox)` → ExecutionResult
  - Detecta package manager: npm (package.json), pip (requirements.txt), etc.
  - Roda install automaticamente
- `runTests(sandbox)` → TestResult
  - Detecta test runner: npm test, pytest, go test, etc.
  - `TestResult` extends ExecutionResult com { passed, failed, skipped, testOutput }
  - Parseia output para extrair contagem de testes
- `applyAndTest(sandbox, patch)` → ApplyTestResult
  - Aplica o patch (git apply)
  - Instala dependências se package.json mudou
  - Roda testes
  - `ApplyTestResult`: { patchApplied, testsRun, testsPassed, result: ExecutionResult }

### 4. apps/agent/src/sandbox/detector.ts
Detecção automática de ambiente:
- `detectRuntime(repoPath)` → RuntimeConfig
- `RuntimeConfig`: { language, dockerfile, installCmd, testCmd, buildCmd? }
- Regras de detecção:
  - package.json → Node.js, npm install, npm test
  - requirements.txt ou pyproject.toml → Python, pip install, pytest
  - go.mod → Go, go mod download, go test ./...
  - Cargo.toml → Rust, cargo build, cargo test
  - Makefile → Generic, make, make test
  - Fallback: Generic runtime

### 5. Testes
- docker.test.ts: mock do dockerode, testa create/destroy/cleanup
- executor.test.ts: mock do sandbox, testa execute/installDeps/runTests
- detector.test.ts: testa detecção para Node, Python, Go, Rust, fallback
  - Crie fixture directories com package.json, requirements.txt, etc.
- Integration test (executor.integration.test.ts):
  - Cria sandbox real com Docker
  - Copia um mini-repo Node.js de teste
  - Roda npm install + npm test
  - Verifica que resultado é correto
  - Cleanup do container
  - Marque como `{ timeout: 30000 }` no vitest

## Regras:
- SEGURANÇA é prioridade #1 neste módulo
- Containers NUNCA devem ter acesso à rede por default
- Containers NUNCA devem montar volumes do host além do repo copiado
- Timeout deve ser enforced tanto pelo Docker quanto pelo código
- Memory limit deve ser enforced pelo Docker
- Logue criação e destruição de cada container
- Limpe containers órfãos no startup da aplicação
- Rode `npm run test` e `npm run typecheck`
- Commit: "feat: implement Docker sandbox for safe code execution"
```

---

## Resultado esperado
Sistema de sandbox onde o agent pode aplicar patches e rodar testes em qualquer repo, com isolamento total, timeout, e cleanup automático.

## Próximo prompt
→ `prompt-06-agent-loop.md`
