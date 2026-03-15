import { describe, it, expect, vi } from 'vitest';
import { generateEmbeddings } from './embeddings.js';
import type { EmbeddingAdapter } from './embeddings.js';
import type { CodeChunk } from './chunker.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

function createMockAdapter(dimensions = 128): EmbeddingAdapter {
  return {
    modelName: 'test-model',
    dimensions,
    embed: vi.fn(async (texts: readonly string[]) =>
      texts.map(() => Array.from({ length: dimensions }, () => Math.random())),
    ),
  };
}

function createChunk(index: number): CodeChunk {
  return {
    filePath: `src/file-${index}.ts`,
    content: `export const value${index} = ${index};\n`.repeat(10),
    startLine: 1,
    endLine: 10,
    language: 'typescript',
    type: 'module',
  };
}

describe('embeddings', () => {
  describe('generateEmbeddings', () => {
    it('should generate embeddings for all chunks', async () => {
      const adapter = createMockAdapter();
      const chunks = [createChunk(0), createChunk(1), createChunk(2)];

      const result = await generateEmbeddings(chunks, adapter);

      expect(result.chunks).toHaveLength(3);
      for (const embedded of result.chunks) {
        expect(embedded.embedding).toHaveLength(128);
        expect(embedded.embeddingModel).toBe('test-model');
      }
    });

    it('should preserve original chunk data in embedded chunks', async () => {
      const adapter = createMockAdapter();
      const chunks = [createChunk(0)];

      const result = await generateEmbeddings(chunks, adapter);

      expect(result.chunks[0].filePath).toBe('src/file-0.ts');
      expect(result.chunks[0].language).toBe('typescript');
      expect(result.chunks[0].type).toBe('module');
      expect(result.chunks[0].startLine).toBe(1);
    });

    it('should batch chunks when count exceeds batch size', async () => {
      const adapter = createMockAdapter();
      // Create 250 chunks to trigger 3 batches (100 + 100 + 50)
      const chunks = Array.from({ length: 250 }, (_, i) => createChunk(i));

      const result = await generateEmbeddings(chunks, adapter);

      expect(result.chunks).toHaveLength(250);
      // embed() should be called 3 times for 3 batches
      expect(adapter.embed).toHaveBeenCalledTimes(3);
    });

    it('should track total tokens and cost', async () => {
      const adapter = createMockAdapter();
      const chunks = [createChunk(0), createChunk(1)];

      const result = await generateEmbeddings(chunks, adapter);

      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.totalCostUsd).toBeGreaterThan(0);
    });

    it('should handle empty chunks array', async () => {
      const adapter = createMockAdapter();

      const result = await generateEmbeddings([], adapter);

      expect(result.chunks).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
      expect(adapter.embed).not.toHaveBeenCalled();
    });

    it('should use correct embedding model name', async () => {
      const adapter: EmbeddingAdapter = {
        modelName: 'voyage-code-3',
        dimensions: 1024,
        embed: vi.fn(async (texts: readonly string[]) =>
          texts.map(() => Array.from({ length: 1024 }, () => Math.random())),
        ),
      };
      const chunks = [createChunk(0)];

      const result = await generateEmbeddings(chunks, adapter);

      expect(result.chunks[0].embeddingModel).toBe('voyage-code-3');
      expect(result.chunks[0].embedding).toHaveLength(1024);
    });
  });
});
