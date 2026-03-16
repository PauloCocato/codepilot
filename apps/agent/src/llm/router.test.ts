import { describe, it, expect, vi } from 'vitest';
import { LLMRouter } from './router.js';
import { LLMError } from './adapter.js';
import type { LLMAdapter, CompletionParams, CompletionResult, StreamChunk, CostEstimate } from './adapter.js';

// Mock pino logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function makeParams(): CompletionParams {
  return {
    messages: [{ role: 'user' as const, content: 'Hello' }],
  };
}

function makeResult(overrides: Partial<CompletionResult> = {}): CompletionResult {
  return {
    content: 'Response',
    model: 'test-model',
    inputTokens: 10,
    outputTokens: 5,
    costUsd: 0.001,
    latencyMs: 100,
    finishReason: 'stop',
    ...overrides,
  };
}

function createMockAdapter(
  provider: string,
  completeFn: (params: CompletionParams) => Promise<CompletionResult>,
): LLMAdapter {
  return {
    provider,
    complete: completeFn,
    async *stream(_params: CompletionParams): AsyncGenerator<StreamChunk> {
      yield { type: 'text', content: 'hello' };
      yield { type: 'done' };
    },
    estimateCost(_params: CompletionParams): CostEstimate {
      return { estimatedInputTokens: 10, estimatedOutputTokens: 100, estimatedCostUsd: 0.01 };
    },
  };
}

describe('LLMRouter', () => {
  it('should route to primary on success', async () => {
    const primary = createMockAdapter('primary', vi.fn().mockResolvedValue(makeResult()));
    const fallback = createMockAdapter('fallback', vi.fn().mockResolvedValue(makeResult()));
    const router = new LLMRouter({ primary, fallback });

    const result = await router.complete(makeParams());

    expect(result.content).toBe('Response');
    expect(primary.complete).toHaveBeenCalledTimes(1);
    expect(fallback.complete).not.toHaveBeenCalled();
  });

  it('should fallback when primary fails', async () => {
    const error = new LLMError('Failed', 'api_error', 'primary', false);
    const primary = createMockAdapter('primary', vi.fn().mockRejectedValue(error));
    const fallbackResult = makeResult({ content: 'Fallback response', model: 'fallback-model' });
    const fallback = createMockAdapter('fallback', vi.fn().mockResolvedValue(fallbackResult));
    const router = new LLMRouter({ primary, fallback });

    const result = await router.complete(makeParams());

    expect(result.content).toBe('Fallback response');
    expect(primary.complete).toHaveBeenCalledTimes(1);
    expect(fallback.complete).toHaveBeenCalledTimes(1);
  });

  it('should throw when primary fails and no fallback is configured', async () => {
    const error = new LLMError('Failed', 'api_error', 'primary', false);
    const primary = createMockAdapter('primary', vi.fn().mockRejectedValue(error));
    const router = new LLMRouter({ primary });

    await expect(router.complete(makeParams())).rejects.toThrow(LLMError);
  });

  it('should throw when both primary and fallback fail', async () => {
    const primaryError = new LLMError('Primary failed', 'api_error', 'primary', false);
    const fallbackError = new LLMError('Fallback failed', 'api_error', 'fallback', false);
    const primary = createMockAdapter('primary', vi.fn().mockRejectedValue(primaryError));
    const fallback = createMockAdapter('fallback', vi.fn().mockRejectedValue(fallbackError));
    const router = new LLMRouter({ primary, fallback });

    await expect(router.complete(makeParams())).rejects.toThrow('Fallback failed');
  });

  it('should accumulate metrics correctly across multiple calls', async () => {
    const error = new LLMError('Failed', 'api_error', 'primary', false);
    const primaryFn = vi.fn()
      .mockResolvedValueOnce(makeResult({ costUsd: 0.01 }))
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(makeResult({ costUsd: 0.02 }));

    const fallbackFn = vi.fn()
      .mockResolvedValueOnce(makeResult({ costUsd: 0.005 }));

    const primary = createMockAdapter('primary', primaryFn);
    const fallback = createMockAdapter('fallback', fallbackFn);
    const router = new LLMRouter({ primary, fallback });

    // Call 1: primary succeeds
    await router.complete(makeParams());
    // Call 2: primary fails, fallback succeeds
    await router.complete(makeParams());
    // Call 3: primary succeeds
    await router.complete(makeParams());

    const metrics = router.getMetrics();

    expect(metrics.totalCalls).toBe(3);
    expect(metrics.primarySuccessRate).toBeCloseTo(2 / 3, 5);
    expect(metrics.fallbackSuccessRate).toBe(1);
    expect(metrics.totalCostUsd).toBeCloseTo(0.035, 5);
  });

  it('should delegate estimateCost to primary adapter', () => {
    const primary = createMockAdapter('primary', vi.fn());
    const router = new LLMRouter({ primary });

    const estimate = router.estimateCost(makeParams());

    expect(estimate.estimatedInputTokens).toBe(10);
    expect(estimate.estimatedOutputTokens).toBe(100);
  });

  it('should have zero success rates when no calls have been made', () => {
    const primary = createMockAdapter('primary', vi.fn());
    const router = new LLMRouter({ primary });

    const metrics = router.getMetrics();

    expect(metrics.primarySuccessRate).toBe(0);
    expect(metrics.fallbackSuccessRate).toBe(0);
    expect(metrics.totalCalls).toBe(0);
    expect(metrics.totalCostUsd).toBe(0);
  });
});
