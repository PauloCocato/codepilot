import Anthropic from '@anthropic-ai/sdk';
import type { CompletionParams, CompletionResult, StreamChunk, CostEstimate, LLMAdapter, ModelPricing } from './adapter.js';
import {
  LLMError,
  AnthropicResponseSchema,
  calculateCost,
  estimateTokens,
  backoffDelay,
  sleep,
} from './adapter.js';
import { logger } from '../utils/logger.js';
import { MAX_RETRIES } from '@codepilot/shared';

/** Default Claude model */
export const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-20250514';

const PROVIDER = 'claude';

/** Pricing per million tokens for Claude models */
const CLAUDE_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-20250514': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-haiku-3-20250306': { inputPerMTok: 0.25, outputPerMTok: 1.25 },
};

const DEFAULT_PRICING: ModelPricing = { inputPerMTok: 3, outputPerMTok: 15 };

/**
 * Get pricing for a Claude model, falling back to Sonnet pricing for unknown models.
 *
 * @example
 * ```typescript
 * const pricing = getPricing('claude-sonnet-4-20250514');
 * // { inputPerMTok: 3, outputPerMTok: 15 }
 * ```
 */
function getPricing(model: string): ModelPricing {
  return CLAUDE_PRICING[model] ?? DEFAULT_PRICING;
}

/**
 * Convert Anthropic stop_reason to our standard finishReason.
 *
 * @example
 * ```typescript
 * const reason = mapFinishReason('end_turn'); // 'stop'
 * ```
 */
function mapFinishReason(stopReason: string | null): 'stop' | 'length' | 'error' {
  switch (stopReason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    default:
      return 'error';
  }
}

/**
 * Convert an Anthropic SDK error into an LLMError with appropriate retryable flag.
 *
 * @example
 * ```typescript
 * const llmError = toClaudeError(sdkError);
 * ```
 */
function toClaudeError(error: unknown): LLMError {
  if (error instanceof Anthropic.RateLimitError) {
    const retryAfter = (error as { headers?: Record<string, string> }).headers?.['retry-after'];
    return new LLMError(
      error.message,
      'rate_limit',
      PROVIDER,
      true,
      retryAfter ? Number(retryAfter) * 1000 : undefined,
    );
  }

  if (error instanceof Anthropic.APIError) {
    const status = error.status;
    if (status === 413 || error.message.includes('context')) {
      return new LLMError(error.message, 'context_too_long', PROVIDER, false);
    }
    if (status === 408 || status === 504) {
      return new LLMError(error.message, 'timeout', PROVIDER, true);
    }
    const retryable = status !== undefined && status >= 500;
    return new LLMError(error.message, 'api_error', PROVIDER, retryable);
  }

  const message = error instanceof Error ? error.message : String(error);
  return new LLMError(message, 'api_error', PROVIDER, false);
}

/** Options for creating a ClaudeAdapter */
export interface ClaudeAdapterOptions {
  readonly apiKey?: string;
  readonly maxRetries?: number;
  readonly client?: Anthropic;
}

/**
 * LLM adapter for Claude API via @anthropic-ai/sdk.
 *
 * Implements complete(), stream(), and estimateCost() with automatic retry
 * for rate limits using exponential backoff.
 *
 * @example
 * ```typescript
 * const adapter = new ClaudeAdapter({ apiKey: 'sk-ant-...' });
 * const result = await adapter.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * console.log(result.content);
 * ```
 */
export class ClaudeAdapter implements LLMAdapter {
  readonly provider = PROVIDER;
  private readonly client: Anthropic;
  private readonly maxRetries: number;

  constructor(options: ClaudeAdapterOptions = {}) {
    this.client = options.client ?? new Anthropic({
      apiKey: options.apiKey,
    });
    this.maxRetries = options.maxRetries ?? MAX_RETRIES;
  }

  /**
   * Send a completion request to Claude with automatic retry on rate limits.
   *
   * @example
   * ```typescript
   * const result = await adapter.complete({
   *   messages: [{ role: 'user', content: 'Explain TypeScript generics' }],
   *   maxTokens: 1024,
   * });
   * ```
   */
  async complete(params: CompletionParams): Promise<CompletionResult> {
    const model = params.model ?? CLAUDE_DEFAULT_MODEL;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model,
          max_tokens: params.maxTokens ?? 4096,
          temperature: params.temperature,
          system: params.systemPrompt,
          stop_sequences: params.stop ? [...params.stop] : undefined,
          messages: params.messages
            .filter(m => m.role !== 'system')
            .map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
        });

        const validated = AnthropicResponseSchema.parse(response);
        const latencyMs = Date.now() - startTime;
        const content = validated.content
          .filter(block => block.type === 'text' && block.text !== undefined)
          .map(block => block.text!)
          .join('');

        const pricing = getPricing(model);
        const costUsd = calculateCost(
          validated.usage.input_tokens,
          validated.usage.output_tokens,
          pricing,
        );

        const result: CompletionResult = {
          content,
          model: validated.model,
          inputTokens: validated.usage.input_tokens,
          outputTokens: validated.usage.output_tokens,
          costUsd,
          latencyMs,
          finishReason: mapFinishReason(validated.stop_reason),
        };

        logger.info({
          provider: PROVIDER,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          latencyMs: result.latencyMs,
        }, 'Claude completion finished');

        return result;
      } catch (error) {
        const llmError = toClaudeError(error);

        if (llmError.retryable && attempt < this.maxRetries) {
          const delay = llmError.retryAfterMs ?? backoffDelay(attempt);
          logger.warn({
            provider: PROVIDER,
            model,
            attempt: attempt + 1,
            maxRetries: this.maxRetries,
            delayMs: delay,
            errorCode: llmError.code,
          }, 'Retrying Claude request');
          await sleep(delay);
          continue;
        }

        throw llmError;
      }
    }

    throw new LLMError('Max retries exceeded', 'api_error', PROVIDER, false);
  }

  /**
   * Stream a completion response from Claude, yielding text chunks.
   *
   * @example
   * ```typescript
   * for await (const chunk of adapter.stream({ messages: [{ role: 'user', content: 'Hi' }] })) {
   *   if (chunk.type === 'text') process.stdout.write(chunk.content!);
   * }
   * ```
   */
  async *stream(params: CompletionParams): AsyncGenerator<StreamChunk> {
    const model = params.model ?? CLAUDE_DEFAULT_MODEL;

    try {
      const stream = this.client.messages.stream({
        model,
        max_tokens: params.maxTokens ?? 4096,
        temperature: params.temperature,
        system: params.systemPrompt,
        stop_sequences: params.stop ? [...params.stop] : undefined,
        messages: params.messages
          .filter(m => m.role !== 'system')
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta as { type: string; text?: string };
          if (delta.type === 'text_delta' && delta.text !== undefined) {
            yield { type: 'text', content: delta.text };
          }
        }
      }

      yield { type: 'done' };
    } catch (error) {
      throw toClaudeError(error);
    }
  }

  /**
   * Estimate the cost of a completion request without calling the API.
   *
   * @example
   * ```typescript
   * const estimate = adapter.estimateCost({
   *   messages: [{ role: 'user', content: 'Hello world' }],
   *   maxTokens: 1024,
   * });
   * console.log(estimate.estimatedCostUsd);
   * ```
   */
  estimateCost(params: CompletionParams): CostEstimate {
    const model = params.model ?? CLAUDE_DEFAULT_MODEL;
    const pricing = getPricing(model);

    const inputText = params.messages.map(m => m.content).join('');
    const systemText = params.systemPrompt ?? '';
    const estimatedInputTokens = estimateTokens(inputText + systemText);
    const estimatedOutputTokens = params.maxTokens ?? 4096;

    return {
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostUsd: calculateCost(estimatedInputTokens, estimatedOutputTokens, pricing),
    };
  }
}
