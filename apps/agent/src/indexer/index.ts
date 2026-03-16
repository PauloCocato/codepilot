import { chunkCodebase } from "./chunker.js";
import { generateEmbeddings, createEmbeddingAdapter } from "./embeddings.js";
import { ChromaStore } from "./store.js";
import { logger } from "../utils/logger.js";

import type { EmbeddingAdapter } from "./embeddings.js";
import type { SearchResult, SearchFilter } from "./store.js";

export interface IndexResult {
  readonly totalFiles: number;
  readonly totalChunks: number;
  readonly totalTokens: number;
  readonly totalCostUsd: number;
  readonly languages: readonly string[];
  readonly durationMs: number;
}

export async function indexRepository(
  repoPath: string,
  owner: string,
  repo: string,
  adapter?: EmbeddingAdapter,
): Promise<IndexResult> {
  const log = logger.child({ module: "indexer", owner, repo });
  const startTime = Date.now();

  log.info({ repoPath }, "Starting repository indexation");

  const chunks = await chunkCodebase(repoPath);
  log.info({ totalChunks: chunks.length }, "Chunking complete");

  const embeddingAdapter = adapter ?? createEmbeddingAdapter();
  const embeddingResult = await generateEmbeddings(chunks, embeddingAdapter);

  const store = new ChromaStore(owner, repo);
  await store.upsert(embeddingResult.chunks);

  const fileSet = new Set(chunks.map((c) => c.filePath));
  const languageSet = new Set(chunks.map((c) => c.language));
  const durationMs = Date.now() - startTime;

  const result: IndexResult = {
    totalFiles: fileSet.size,
    totalChunks: chunks.length,
    totalTokens: embeddingResult.totalTokens,
    totalCostUsd: embeddingResult.totalCostUsd,
    languages: [...languageSet],
    durationMs,
  };

  log.info(result, "Repository indexation complete");
  return result;
}

export async function searchRelevantCode(
  query: string,
  owner: string,
  repo: string,
  topK = 10,
  filter?: SearchFilter,
): Promise<readonly SearchResult[]> {
  const store = new ChromaStore(owner, repo);
  return store.search(query, topK, filter);
}

export type { CodeChunk, ChunkMetadata } from "./chunker.js";
export { chunkCodebase } from "./chunker.js";
export type {
  EmbeddingAdapter,
  EmbeddedChunk,
  EmbeddingResult,
} from "./embeddings.js";
export { generateEmbeddings, createEmbeddingAdapter } from "./embeddings.js";
export type {
  VectorStore,
  SearchResult,
  SearchFilter,
  StoreStats,
} from "./store.js";
export { ChromaStore } from "./store.js";
