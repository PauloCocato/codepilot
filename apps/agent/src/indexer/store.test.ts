import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EmbeddedChunk } from "./embeddings.js";

vi.mock("../utils/logger.js", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const mockCollection = {
  add: vi.fn(async () => undefined),
  query: vi.fn(async () => ({
    ids: [["id1", "id2"]],
    documents: [["const x = 1;", "function foo() {}"]],
    metadatas: [
      [
        {
          filePath: "src/app.ts",
          language: "typescript",
          type: "module",
          startLine: 1,
          endLine: 10,
          embeddingModel: "test",
        },
        {
          filePath: "src/utils.ts",
          language: "typescript",
          type: "function",
          startLine: 5,
          endLine: 20,
          embeddingModel: "test",
        },
      ],
    ],
    distances: [[0.1, 0.3]],
  })),
  count: vi.fn(async () => 42),
  peek: vi.fn(async () => ({
    metadatas: [
      { filePath: "src/app.ts", language: "typescript" },
      { filePath: "src/utils.ts", language: "typescript" },
      { filePath: "src/main.py", language: "python" },
    ],
  })),
  delete: vi.fn(async () => undefined),
};

const mockClient = {
  getOrCreateCollection: vi.fn(async () => mockCollection),
  deleteCollection: vi.fn(async () => undefined),
};

vi.mock("chromadb", () => ({
  ChromaClient: vi.fn(() => mockClient),
}));

// Import after mocks
const { ChromaStore } = await import("./store.js");

function createEmbeddedChunk(index: number): EmbeddedChunk {
  return {
    filePath: `src/file-${index}.ts`,
    content: `export const value = ${index};`,
    startLine: 1,
    endLine: 5,
    language: "typescript",
    type: "module",
    embedding: [0.1, 0.2, 0.3],
    embeddingModel: "test-model",
  };
}

describe("ChromaStore", () => {
  let store: InstanceType<typeof ChromaStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new ChromaStore("owner", "repo");
  });

  describe("upsert", () => {
    it("should upsert chunks to ChromaDB collection", async () => {
      const chunks = [createEmbeddedChunk(0), createEmbeddedChunk(1)];

      await store.upsert(chunks);

      expect(mockCollection.add).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callArgs = (mockCollection.add as any).mock.calls[0][0] as any;
      expect(callArgs.ids).toHaveLength(2);
      expect(callArgs.embeddings).toHaveLength(2);
      expect(callArgs.documents).toHaveLength(2);
      expect(callArgs.metadatas).toHaveLength(2);
      expect(callArgs.metadatas[0].filePath).toBe("src/file-0.ts");
    });
  });

  describe("search", () => {
    it("should return search results with scores", async () => {
      const results = await store.search("find function", 10);

      expect(results).toHaveLength(2);
      expect(results[0].chunk.filePath).toBe("src/app.ts");
      expect(results[0].score).toBeCloseTo(0.9, 1);
      expect(results[1].score).toBeCloseTo(0.7, 1);
    });

    it("should pass filter to ChromaDB query", async () => {
      await store.search("query", 5, { language: "typescript" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callArgs = (mockCollection.query as any).mock.calls[0][0] as any;
      expect(callArgs.where).toEqual({ language: "typescript" });
    });

    it("should use default topK of 10", async () => {
      await store.search("query");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callArgs = (mockCollection.query as any).mock.calls[0][0] as any;
      expect(callArgs.nResults).toBe(10);
    });
  });

  describe("delete", () => {
    it("should delete the collection", async () => {
      await store.delete("owner/repo");

      expect(mockClient.deleteCollection).toHaveBeenCalledWith({
        name: "codepilot-owner-repo",
      });
    });
  });

  describe("stats", () => {
    it("should return store statistics", async () => {
      const stats = await store.stats();

      expect(stats.totalChunks).toBe(42);
      expect(stats.totalFiles).toBe(3);
      expect(stats.languages).toContain("typescript");
      expect(stats.languages).toContain("python");
    });
  });
});
