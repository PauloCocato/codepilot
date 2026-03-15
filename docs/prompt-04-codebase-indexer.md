# Prompt 4: Codebase Indexer (Embeddings + Semantic Search)

> Cole este prompt no Claude Code após completar o Prompt 3.

---

## Prompt

```
Implemente o sistema de indexação e busca semântica de codebase para o CodePilot.
Este módulo permite ao agent entender a estrutura do repositório e encontrar arquivos relevantes para cada issue.

## Contexto
Leia o CLAUDE.md para convenções.
O GitHub layer (apps/agent/src/github/) já está pronto.

## O que implementar:

### 1. apps/agent/src/indexer/chunker.ts
Estratégia de chunking inteligente para código:
- `chunkCodebase(repoPath)` → CodeChunk[]
- `CodeChunk`: { filePath, content, startLine, endLine, language, type }
- `type`: 'function' | 'class' | 'module' | 'config' | 'test' | 'docs'
- Estratégia language-agnostic baseada em heurísticas:
  - Arquivos < 100 linhas: chunk inteiro
  - Arquivos > 100 linhas: split por blocos lógicos (funções, classes)
  - Detectar linguagem pela extensão do arquivo
  - Chunk size target: 50-150 linhas, com overlap de 10 linhas entre chunks
- Ignorar: node_modules, .git, dist, build, __pycache__, binários, imagens
- Incluir metadata: imports, exports, function/class names (extrair via regex)
- Logging: total de arquivos, chunks gerados, linguagens detectadas

### 2. apps/agent/src/indexer/embeddings.ts
Geração de embeddings:
- `generateEmbeddings(chunks, adapter)` → EmbeddedChunk[]
- `EmbeddedChunk`: extends CodeChunk com { embedding: number[], embeddingModel: string }
- Suporte a dois providers via adapter pattern:
  - OpenAI: text-embedding-3-small (1536 dims, $0.02/MTok)
  - Voyage AI: voyage-code-3 (1024 dims, $0.06/MTok) — melhor para código
- Interface `EmbeddingAdapter`: { embed(texts: string[]) → number[][] }
- Batch processing: enviar em lotes de 100 chunks para eficiência
- Progress logging: "Embedding chunk {n}/{total}..."
- Track custo total de embeddings

### 3. apps/agent/src/indexer/store.ts
Interface com vector database:
- `VectorStore` interface: { upsert, search, delete, stats }
- `ChromaStore` implementação usando chromadb:
  - Collection name: `codepilot-{owner}-{repo}`
  - Metadata: filePath, language, type, startLine, endLine
  - `upsert(chunks)` — insere ou atualiza chunks
  - `search(query, topK=10, filter?)` → SearchResult[]
  - `SearchResult`: { chunk: CodeChunk, score: number }
  - `filter`: { language?, type?, filePath? }
  - `delete(repoId)` — limpa collection inteira
  - `stats()` → { totalChunks, totalFiles, languages }
- Implementação futura: PineconeStore (mesma interface)

### 4. apps/agent/src/indexer/index.ts
Orquestrador de indexação:
- `indexRepository(repoPath, owner, repo)` → IndexResult
- `IndexResult`: { totalFiles, totalChunks, languages, durationMs, costUsd }
- Fluxo: chunk codebase → generate embeddings → upsert to store
- `searchRelevantCode(query, owner, repo, topK?)` → CodeChunk[]
  - Busca semântica + reranking por relevância
  - Retorna chunks com contexto (inclui 5 linhas antes/depois)

### 5. apps/agent/src/agent/searcher.ts
Busca contextual para o agent:
- `searchForIssue(issue: ParsedIssue, store: VectorStore)` → string
- Estratégia multi-query:
  1. Busca pelo título da issue
  2. Busca pelos file paths mencionados
  3. Busca por error messages / stack traces do body
  4. Busca por keywords extraídas do body
- Combina e deduplica resultados
- Formata como string de contexto para o LLM:
  ```
  ## File: src/auth/login.ts (lines 45-89)
  ```typescript
  [código]
  ​```
  ## File: src/utils/hash.ts (lines 1-30)
  ...
  ```
- Limite: máximo 30K tokens de contexto (estimar ~4 chars/token)

### 6. Testes
- chunker.test.ts:
  - Chunka um arquivo Python de 200 linhas corretamente
  - Chunka um arquivo TypeScript com classes e funções
  - Ignora node_modules e binários
  - Chunk overlap funciona
- embeddings.test.ts: mock do adapter, testa batching
- store.test.ts: mock do ChromaDB, testa upsert/search/delete
- searcher.test.ts: testa estratégia multi-query com mocks
- Pelo menos 12 test cases

## Regras:
- Chunking deve ser language-agnostic (regex, não AST)
- Embedding adapter deve ser swap-able via env var
- Nunca inclua o conteúdo inteiro de um arquivo gigante no contexto — respeite o limite de tokens
- Rode `npm run test` e `npm run typecheck`
- Commit: "feat: implement codebase indexer with semantic search"
```

---

## Resultado esperado
Sistema completo de indexação: qualquer repo é chunkado, embedado, e pesquisável semanticamente. O agent pode perguntar "onde está o bug de autenticação?" e receber os arquivos relevantes.

## Próximo prompt
→ `prompt-05-sandbox-executor.md`
