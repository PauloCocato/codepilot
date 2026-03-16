import type { CodeChunk } from './chunker.js';
import type { EmbeddedChunk } from './embeddings.js';
import { logger } from '../utils/logger.js';

export interface SearchResult {
  readonly chunk: CodeChunk;
  readonly score: number;
}

export interface StoreStats {
  readonly totalChunks: number;
  readonly totalFiles: number;
  readonly languages: readonly string[];
}

export interface SearchFilter {
  readonly language?: string;
  readonly type?: CodeChunk['type'];
  readonly filePath?: string;
}

export interface VectorStore {
  upsert(chunks: readonly EmbeddedChunk[]): Promise<void>;
  search(query: string, topK?: number, filter?: SearchFilter): Promise<readonly SearchResult[]>;
  delete(repoId: string): Promise<void>;
  stats(): Promise<StoreStats>;
}

export class ChromaStore implements VectorStore {
  private readonly collectionName: string;
  private readonly log;

  constructor(owner: string, repo: string) {
    this.collectionName = `codepilot-${owner}-${repo}`;
    this.log = logger.child({ module: 'chroma-store', collection: this.collectionName });
  }

  private async getCollection(): Promise<{
    add: (params: {
      ids: string[];
      embeddings: number[][];
      documents: string[];
      metadatas: Record<string, string | number>[];
    }) => Promise<void>;
    query: (params: {
      queryTexts?: string[];
      nResults?: number;
      where?: Record<string, unknown>;
    }) => Promise<{
      ids: string[][];
      documents: (string | null)[][];
      metadatas: (Record<string, string | number> | null)[][];
      distances: number[][];
    }>;
    count: () => Promise<number>;
    peek: (params: { limit: number }) => Promise<{
      metadatas: (Record<string, string | number> | null)[];
    }>;
    delete: (params: { where: Record<string, unknown> }) => Promise<void>;
  }> {
    const { ChromaClient } = await import('chromadb');
    const client = new ChromaClient();
    const collection = await client.getOrCreateCollection({
      name: this.collectionName,
    });
    return collection as unknown as ReturnType<ChromaStore['getCollection']> extends Promise<infer T> ? Promise<T> : never;
  }

  async upsert(chunks: readonly EmbeddedChunk[]): Promise<void> {
    this.log.info({ chunkCount: chunks.length }, 'Upserting chunks to ChromaDB');

    const collection = await this.getCollection();

    const BATCH_SIZE = 500;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      const ids = batch.map((c, idx) => `${c.filePath}:${c.startLine}-${c.endLine}-${i + idx}`);
      const embeddings = batch.map((c) => [...c.embedding]);
      const documents = batch.map((c) => c.content);
      const metadatas = batch.map((c) => ({
        filePath: c.filePath,
        language: c.language,
        type: c.type,
        startLine: c.startLine,
        endLine: c.endLine,
        embeddingModel: c.embeddingModel,
      }));

      await collection.add({ ids, embeddings, documents, metadatas });

      this.log.debug(
        { batch: Math.floor(i / BATCH_SIZE) + 1, count: batch.length },
        'Batch upserted',
      );
    }

    this.log.info({ totalUpserted: chunks.length }, 'Upsert complete');
  }

  async search(
    query: string,
    topK = 10,
    filter?: SearchFilter,
  ): Promise<readonly SearchResult[]> {
    this.log.debug({ query: query.slice(0, 100), topK, filter }, 'Searching ChromaDB');

    const collection = await this.getCollection();

    const where: Record<string, unknown> = {};
    if (filter?.language) {
      where['language'] = filter.language;
    }
    if (filter?.type) {
      where['type'] = filter.type;
    }
    if (filter?.filePath) {
      where['filePath'] = { $contains: filter.filePath };
    }

    const queryParams: {
      queryTexts: string[];
      nResults: number;
      where?: Record<string, unknown>;
    } = {
      queryTexts: [query],
      nResults: topK,
    };

    if (Object.keys(where).length > 0) {
      queryParams.where = where;
    }

    const results = await collection.query(queryParams);

    const searchResults: SearchResult[] = [];
    const ids = results.ids[0] ?? [];
    const documents = results.documents[0] ?? [];
    const metadatas = results.metadatas[0] ?? [];
    const distances = results.distances[0] ?? [];

    for (let i = 0; i < ids.length; i++) {
      const doc = documents[i];
      const meta = metadatas[i];
      if (!doc || !meta) continue;

      const score = 1 - (distances[i] ?? 0);

      searchResults.push({
        chunk: {
          filePath: String(meta['filePath'] ?? ''),
          content: doc,
          startLine: Number(meta['startLine'] ?? 0),
          endLine: Number(meta['endLine'] ?? 0),
          language: String(meta['language'] ?? ''),
          type: String(meta['type'] ?? 'module') as CodeChunk['type'],
        },
        score,
      });
    }

    this.log.debug({ resultCount: searchResults.length }, 'Search complete');
    return searchResults;
  }

  async delete(repoId: string): Promise<void> {
    this.log.info({ repoId }, 'Deleting collection');

    const { ChromaClient } = await import('chromadb');
    const client = new ChromaClient();

    try {
      await client.deleteCollection({ name: this.collectionName });
      this.log.info('Collection deleted');
    } catch {
      this.log.warn('Collection not found or already deleted');
    }
  }

  async stats(): Promise<StoreStats> {
    const collection = await this.getCollection();
    const count = await collection.count();

    const sample = await collection.peek({ limit: Math.min(count, 100) });
    const fileSet = new Set<string>();
    const languageSet = new Set<string>();

    for (const meta of sample.metadatas) {
      if (meta) {
        fileSet.add(String(meta['filePath'] ?? ''));
        languageSet.add(String(meta['language'] ?? ''));
      }
    }

    return {
      totalChunks: count,
      totalFiles: fileSet.size,
      languages: [...languageSet],
    };
  }
}
