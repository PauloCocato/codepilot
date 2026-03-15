import type { CodeChunk } from './chunker.js';
import { logger } from '../utils/logger.js';

export interface EmbeddingAdapter {
  readonly modelName: string;
  readonly dimensions: number;
  embed(texts: readonly string[]): Promise<readonly number[][]>;
}

export interface EmbeddedChunk extends CodeChunk {
  readonly embedding: readonly number[];
  readonly embeddingModel: string;
}

export interface EmbeddingResult {
  readonly chunks: readonly EmbeddedChunk[];
  readonly totalTokens: number;
  readonly totalCostUsd: number;
}

const BATCH_SIZE = 100;

const COST_PER_MILLION_TOKENS: Readonly<Record<string, number>> = {
  'text-embedding-3-small': 0.02,
  'voyage-code-3': 0.06,
};

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function generateEmbeddings(
  chunks: readonly CodeChunk[],
  adapter: EmbeddingAdapter,
): Promise<EmbeddingResult> {
  const log = logger.child({ module: 'embeddings', model: adapter.modelName });
  const embeddedChunks: EmbeddedChunk[] = [];
  let totalTokens = 0;

  const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, chunks.length);
    const batchChunks = chunks.slice(start, end);
    const batchTexts = batchChunks.map((c) => c.content);

    log.info(
      { batch: batchIndex + 1, totalBatches, chunkRange: `${start + 1}-${end}/${chunks.length}` },
      `Embedding chunk ${start + 1}/${chunks.length}...`,
    );

    const embeddings = await adapter.embed(batchTexts);

    for (let i = 0; i < batchChunks.length; i++) {
      const chunk = batchChunks[i];
      const embedding = embeddings[i];
      totalTokens += estimateTokenCount(chunk.content);

      embeddedChunks.push({
        ...chunk,
        embedding,
        embeddingModel: adapter.modelName,
      });
    }
  }

  const costPerToken = (COST_PER_MILLION_TOKENS[adapter.modelName] ?? 0.02) / 1_000_000;
  const totalCostUsd = totalTokens * costPerToken;

  log.info({
    totalChunks: chunks.length,
    totalTokens,
    totalCostUsd: totalCostUsd.toFixed(6),
    model: adapter.modelName,
  }, 'Embedding generation complete');

  return {
    chunks: embeddedChunks,
    totalTokens,
    totalCostUsd,
  };
}

export class OpenAIEmbeddingAdapter implements EmbeddingAdapter {
  readonly modelName = 'text-embedding-3-small';
  readonly dimensions = 1536;

  private readonly apiKey: string;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env['OPENAI_API_KEY'];
    if (!key) {
      throw new Error('OPENAI_API_KEY is required for OpenAI embedding adapter');
    }
    this.apiKey = key;
  }

  async embed(texts: readonly string[]): Promise<readonly number[][]> {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: this.apiKey });

    const response = await client.embeddings.create({
      model: this.modelName,
      input: texts as string[],
    });

    return response.data.map((item) => item.embedding);
  }
}

export class VoyageEmbeddingAdapter implements EmbeddingAdapter {
  readonly modelName = 'voyage-code-3';
  readonly dimensions = 1024;

  private readonly apiKey: string;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env['VOYAGE_API_KEY'];
    if (!key) {
      throw new Error('VOYAGE_API_KEY is required for Voyage embedding adapter');
    }
    this.apiKey = key;
  }

  async embed(texts: readonly string[]): Promise<readonly number[][]> {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        input: texts,
        input_type: 'document',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Voyage AI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { data: readonly { embedding: number[] }[] };
    return data.data.map((item) => item.embedding);
  }
}

export function createEmbeddingAdapter(provider?: string): EmbeddingAdapter {
  const selectedProvider = provider ?? process.env['EMBEDDING_PROVIDER'] ?? 'openai';

  switch (selectedProvider) {
    case 'openai':
      return new OpenAIEmbeddingAdapter();
    case 'voyage':
      return new VoyageEmbeddingAdapter();
    default:
      throw new Error(`Unknown embedding provider: ${selectedProvider}. Supported: openai, voyage`);
  }
}
