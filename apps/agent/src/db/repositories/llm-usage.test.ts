import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LLMUsageRepository } from "./llm-usage.js";
import type { InsertLLMUsage } from "../types.js";

// Suppress pino output during tests
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createMockClient() {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };
  chainable.select.mockReturnValue(chainable);
  chainable.insert.mockReturnValue(chainable);
  chainable.eq.mockReturnValue(chainable);
  chainable.gte.mockReturnValue(chainable);
  chainable.order.mockReturnValue(chainable);

  return {
    from: vi.fn().mockReturnValue(chainable),
    _chain: chainable,
  };
}

const RUN_ID = "550e8400-e29b-41d4-a716-446655440000";

const VALID_USAGE: InsertLLMUsage = {
  run_id: RUN_ID,
  provider: "claude",
  model: "claude-sonnet-4-20250514",
  input_tokens: 1500,
  output_tokens: 500,
  cost_usd: 0.012,
  latency_ms: 2300,
  purpose: "generate",
};

const MOCK_ROW = {
  id: "770e8400-e29b-41d4-a716-446655440002",
  ...VALID_USAGE,
  created_at: "2026-03-16T00:00:00Z",
};

describe("LLMUsageRepository", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let repo: LLMUsageRepository;

  beforeEach(() => {
    mockClient = createMockClient();
    repo = new LLMUsageRepository(mockClient as unknown as SupabaseClient);
  });

  describe("record", () => {
    it("should insert a usage record and return it", async () => {
      mockClient._chain.single.mockResolvedValue({
        data: MOCK_ROW,
        error: null,
      });

      const result = await repo.record(VALID_USAGE);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.provider).toBe("claude");
        expect(result.data.input_tokens).toBe(1500);
      }
    });

    it("should return validation error for invalid provider", async () => {
      const invalid = { ...VALID_USAGE, provider: "gemini" as "claude" };

      const result = await repo.record(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("should return error when insert fails", async () => {
      mockClient._chain.single.mockResolvedValue({
        data: null,
        error: { message: "insert failed" },
      });

      const result = await repo.record(VALID_USAGE);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("INSERT_FAILED");
      }
    });
  });

  describe("findByRunId", () => {
    it("should return usage records for a run", async () => {
      mockClient._chain.order.mockResolvedValue({
        data: [MOCK_ROW],
        error: null,
      });

      const result = await repo.findByRunId(RUN_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].run_id).toBe(RUN_ID);
      }
    });

    it("should return empty array when no usage exists", async () => {
      mockClient._chain.order.mockResolvedValue({ data: [], error: null });

      const result = await repo.findByRunId(RUN_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });

  describe("getProviderStats", () => {
    it("should aggregate stats by provider", async () => {
      mockClient._chain.select.mockResolvedValue({
        data: [
          {
            provider: "claude",
            input_tokens: 1000,
            output_tokens: 500,
            cost_usd: 0.01,
          },
          {
            provider: "claude",
            input_tokens: 2000,
            output_tokens: 800,
            cost_usd: 0.02,
          },
          {
            provider: "openai",
            input_tokens: 500,
            output_tokens: 200,
            cost_usd: 0.005,
          },
        ],
        error: null,
      });

      const result = await repo.getProviderStats();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        const claude = result.data.find((s) => s.provider === "claude");
        expect(claude).toBeDefined();
        expect(claude!.totalCalls).toBe(2);
        expect(claude!.totalInputTokens).toBe(3000);
        expect(claude!.totalOutputTokens).toBe(1300);
        expect(claude!.totalCostUsd).toBeCloseTo(0.03);
      }
    });

    it("should filter by since date when provided", async () => {
      // For the "since" path, select() must return a chainable with gte(),
      // and gte() must be thenable (resolve to { data, error }).
      const gteResult = Promise.resolve({ data: [], error: null });
      const gteFn = vi.fn().mockReturnValue(gteResult);
      mockClient._chain.select.mockReturnValue({
        gte: gteFn,
        then: gteResult.then.bind(gteResult),
      });

      const result = await repo.getProviderStats("2026-03-01T00:00:00Z");

      expect(result.success).toBe(true);
      expect(gteFn).toHaveBeenCalledWith("created_at", "2026-03-01T00:00:00Z");
    });

    it("should return empty array when no usage exists", async () => {
      mockClient._chain.select.mockResolvedValue({ data: [], error: null });

      const result = await repo.getProviderStats();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });
});
