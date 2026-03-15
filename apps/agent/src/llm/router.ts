import type { CompletionParams, CompletionResult, StreamChunk, CostEstimate, LLMAdapter } from './adapter.js';
import { LLMError } from './adapter.js';
import { logger } from '../utils/logger.js';

/** Metrics tracked by the LLM router */
export interface RouterMetrics {
  readonly primarySuccessRate: number;
  readonly fallbackSuccessRate: number;
  readonly totalCalls: number;
  readonly totalCostUsd: number;
}

/** Options for creating an LLMRouter */
export interface LLMRouterOptions {
  readonly primary: LLMAdapter;
  readonly fallback?: LLMAdapter;
}

/**
 * Mutable metrics state for internal tracking.
 * A new readonly snapshot is created via getMetrics().
 */
interface MetricsState {
  primaryAttempts: number;
  primarySuccesses: number;
  fallbackAttempts: number;
  fallbackSuccesses: number;
  totalCalls: number;
  totalCostUsd: number;
}

/**
 * Smart router that tries a primary LLM adapter and falls back to a secondary
 * adapter when the primary fails with a non-retryable error or exhausts retries.
 *
 * Tracks success rates and cost for observability.
 *
 * @example
 * ```typescript
 * const router = new LLMRouter({
 *   primary: new ClaudeAdapter(),
 *   fallback: new OpenAIAdapter(),
 * });
 * const result = await router.complete({
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 * console.log(router.getMetrics());
 * ```
 */
export class LLMRouter implements LLMAdapter {
  readonly provider = 'router';
  private readonly primary: LLMAdapter;
  private readonly fallback?: LLMAdapter;
  private readonly metrics: MetricsState;

  constructor(options: LLMRouterOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback;
    this.metrics = {
      primaryAttempts: 0,
      primarySuccesses: 0,
      fallbackAttempts: 0,
      fallbackSuccesses: 0,
      totalCalls: 0,
      totalCostUsd: 0,
    };
  }

  /**
   * Complete a request, trying primary first and falling back if needed.
   *
   * Falls back when the primary throws an LLMError that is not retryable,
   * or any non-LLMError exception. The primary adapter handles its own retries.
   *
   * @example
   * ```typescript
   * const result = await router.complete({
   *   messages: [{ role: 'user', content: 'Hello' }],
   * });
   * ```
   */
  async complete(params: CompletionParams): Promise<CompletionResult> {
    this.metrics.totalCalls += 1;
    this.metrics.primaryAttempts += 1;

    try {
      logger.info({ action: 'primary', reason: 'initial_attempt', provider: this.primary.provider }, 'Routing to primary');
      const result = await this.primary.complete(params);
      this.metrics.primarySuccesses += 1;
      this.metrics.totalCostUsd += result.costUsd;
      return result;
    } catch (error) {
      logger.warn({
        action: 'primary',
        reason: 'failed',
        provider: this.primary.provider,
        error: error instanceof Error ? error.message : String(error),
      }, 'Primary adapter failed');

      if (!this.fallback) {
        throw error;
      }

      this.metrics.fallbackAttempts += 1;

      try {
        logger.info({
          action: 'fallback',
          reason: 'primary_failed',
          provider: this.fallback.provider,
        }, 'Routing to fallback');
        const result = await this.fallback.complete(params);
        this.metrics.fallbackSuccesses += 1;
        this.metrics.totalCostUsd += result.costUsd;
        return result;
      } catch (fallbackError) {
        logger.error({
          action: 'fallback',
          reason: 'failed',
          provider: this.fallback.provider,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        }, 'Fallback adapter also failed');
        throw fallbackError;
      }
    }
  }

  /**
   * Stream a response from the primary adapter (no fallback for streaming).
   *
   * @example
   * ```typescript
   * for await (const chunk of router.stream({ messages: [{ role: 'user', content: 'Hi' }] })) {
   *   if (chunk.type === 'text') process.stdout.write(chunk.content!);
   * }
   * ```
   */
  async *stream(params: CompletionParams): AsyncGenerator<StreamChunk> {
    yield* this.primary.stream(params);
  }

  /**
   * Estimate cost using the primary adapter's pricing.
   *
   * @example
   * ```typescript
   * const estimate = router.estimateCost({
   *   messages: [{ role: 'user', content: 'Hello' }],
   * });
   * ```
   */
  estimateCost(params: CompletionParams): CostEstimate {
    return this.primary.estimateCost(params);
  }

  /**
   * Get a snapshot of routing metrics.
   *
   * @example
   * ```typescript
   * const metrics = router.getMetrics();
   * console.log(metrics.primarySuccessRate); // 0.95
   * ```
   */
  getMetrics(): RouterMetrics {
    return {
      primarySuccessRate: this.metrics.primaryAttempts > 0
        ? this.metrics.primarySuccesses / this.metrics.primaryAttempts
        : 0,
      fallbackSuccessRate: this.metrics.fallbackAttempts > 0
        ? this.metrics.fallbackSuccesses / this.metrics.fallbackAttempts
        : 0,
      totalCalls: this.metrics.totalCalls,
      totalCostUsd: this.metrics.totalCostUsd,
    };
  }
}
