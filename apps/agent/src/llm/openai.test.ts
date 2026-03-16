import { describe, it, expect, vi } from "vitest";
import { OpenAIAdapter } from "./openai.js";
import { LLMError } from "./adapter.js";
import type { CompletionParams } from "./adapter.js";
import type OpenAI from "openai";

// Mock pino logger
vi.mock("../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function makeParams(
  overrides: Partial<CompletionParams> = {},
): CompletionParams {
  return {
    messages: [{ role: "user" as const, content: "Hello" }],
    ...overrides,
  };
}

function makeMockResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "chatcmpl-123",
    object: "chat.completion",
    model: "gpt-4o",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "Hello back!" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    ...overrides,
  };
}

function createMockClient(createFn: (...args: unknown[]) => unknown) {
  return {
    chat: {
      completions: {
        create: createFn,
      },
    },
  } as unknown as OpenAI;
}

describe("OpenAIAdapter", () => {
  describe("complete", () => {
    it("should return a valid CompletionResult on success", async () => {
      const mockClient = createMockClient(
        vi.fn().mockResolvedValue(makeMockResponse()),
      );
      const adapter = new OpenAIAdapter({ client: mockClient });

      const result = await adapter.complete(makeParams());

      expect(result.content).toBe("Hello back!");
      expect(result.model).toBe("gpt-4o");
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
      expect(result.finishReason).toBe("stop");
      expect(result.costUsd).toBeGreaterThan(0);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should map length finish_reason correctly", async () => {
      const mockClient = createMockClient(
        vi.fn().mockResolvedValue(
          makeMockResponse({
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Truncated" },
                finish_reason: "length",
              },
            ],
          }),
        ),
      );
      const adapter = new OpenAIAdapter({ client: mockClient });

      const result = await adapter.complete(makeParams());

      expect(result.finishReason).toBe("length");
    });

    it("should throw LLMError on API failure", async () => {
      const mockClient = createMockClient(
        vi.fn().mockRejectedValue(new Error("Network error")),
      );
      const adapter = new OpenAIAdapter({ client: mockClient, maxRetries: 0 });

      await expect(adapter.complete(makeParams())).rejects.toThrow(LLMError);
      await expect(adapter.complete(makeParams())).rejects.toMatchObject({
        code: "api_error",
        provider: "openai",
      });
    });

    it("should calculate cost using gpt-4o pricing", async () => {
      const mockClient = createMockClient(
        vi.fn().mockResolvedValue(
          makeMockResponse({
            usage: {
              prompt_tokens: 1_000_000,
              completion_tokens: 100_000,
              total_tokens: 1_100_000,
            },
          }),
        ),
      );
      const adapter = new OpenAIAdapter({ client: mockClient });

      const result = await adapter.complete(makeParams());

      // gpt-4o: $2.50/MTok input, $10/MTok output
      // 1M * $2.5/M + 100K * $10/M = $2.5 + $1.0 = $3.5
      expect(result.costUsd).toBeCloseTo(3.5, 2);
    });

    it("should include systemPrompt as system message", async () => {
      const createFn = vi.fn().mockResolvedValue(makeMockResponse());
      const mockClient = createMockClient(createFn);
      const adapter = new OpenAIAdapter({ client: mockClient });

      await adapter.complete(makeParams({ systemPrompt: "You are helpful" }));

      const callArgs = createFn.mock.calls[0]?.[0] as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(callArgs.messages[0]).toEqual({
        role: "system",
        content: "You are helpful",
      });
    });
  });

  describe("stream", () => {
    it("should yield text chunks and a done chunk", async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: "Hello" } }] };
          yield { choices: [{ delta: { content: " world" } }] };
        },
      };

      const mockClient = createMockClient(
        vi.fn().mockResolvedValue(mockStream),
      );
      const adapter = new OpenAIAdapter({ client: mockClient });
      const chunks: Array<{ type: string; content?: string }> = [];

      for await (const chunk of adapter.stream(makeParams())) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: "text", content: "Hello" },
        { type: "text", content: " world" },
        { type: "done" },
      ]);
    });
  });

  describe("estimateCost", () => {
    it("should estimate cost based on message length", () => {
      const adapter = new OpenAIAdapter({ client: createMockClient(vi.fn()) });

      const estimate = adapter.estimateCost({
        messages: [{ role: "user", content: "a".repeat(4000) }],
        maxTokens: 1000,
      });

      expect(estimate.estimatedInputTokens).toBe(1000);
      expect(estimate.estimatedOutputTokens).toBe(1000);
      expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
    });
  });
});
