import OpenAI from 'openai';
import type { CompletionParams, CompletionResult, StreamChunk, CostEstimate, LLMAdapter, ModelPricing } from './adapter.js';
import {
  LLMError,
  OpenAIResponseSchema,
  calculateCost,
  estimateTokens,
  backoffDelay,
  sleep,
} from './adapter.js';
import { logger } from '../utils/logger.js';
import { MAX_RETRIES } from '@codepilot/shared';

/** Default OpenAI model */
export const OPENAI_DEFAULT_MODEL = 'gpt-4o';

const PROVIDER = 'openai';

/** Pricing per million tokens for OpenAI models */
const OPENAI_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { inputPerMTok: 2.5, outputPerMTok: 10 },
  'gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.6 },
};

const DEFAULT_PRICING: ModelPricing = { inputPerMTok: 2.5, outputPerMTok: 10 };

/**
 * Get pricing for an OpenAI model, falling back to gpt-4o pricing for unknown models.
 *
 * @example
 * ```typescript
 * const pricing = getPricing('gpt-4o');
 * // { inputPerMTok: 2.5, outputPerMTok: 10 }
 * ```
 */
function getPricing(model: string): ModelPricing {
  return OPENAI_PRICING[model] ?? DEFAULT_PRICING;
}

/**
 * Convert OpenAI finish_reason to our standard finishReason.
 *
 * @example
 * ```typescript
 * const reason = mapFinishReason('stop'); // 'stop'
 * ```
 */
function mapFinishReason(finishReason: string | null): 'stop' | 'length' | 'error' {
  switch (finishReason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    default:
      return 'error';
  }
}

/**
 * Convert an OpenAI SDK error into an LLMError with appropriate retryable flag.
 *
 * @example
 * ```typescript
 * const llmError = toOpenAIError(sdkError);
 * ```
 */
function toOpenAIError(error: unknown): LLMError {
  if (error instanceof OpenAI.RateLimitError) {
    const retryAfter = (error as { headers?: Record<string, string> }).headers?.['retry-after'];
    return new LLMError(
      error.message,
      'rate_limit',
      PROVIDER,
      true,
      retryAfter ? Number(retryAfter) * 1000 : undefined,
    );
  }

  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    if (status === 413) {
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

/** Options for creating an OpenAIAdapter */
export interface OpenAIAdapterOptions {
  readonly apiKey?: string;
  readonly maxRetries?: number;
  readonly client?: OpenAI;
}

/**
 * LLM adapter for OpenAI API via the openai package.
 *
 * Implements complete(), stream(), and estimateCost() with automatic retry
 * for rate limits using exponential backoff.
 *
 * @example
 * ```typescript
 * const adapter = new OpenAIAdapter({ apiKey: 'sk-...' });
 * const result = await adapter.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * console.log(result.content);
 * ```
 */
export class OpenAIAdapter implements LLMAdapter {
  readonly provider = PROVIDER;
  private readonly client: OpenAI;
  private readonly maxRetries: number;

  constructor(options: OpenAIAdapterOptions = {}) {
    this.client = options.client ?? new OpenAI({
      apiKey: options.apiKey,
    });
    this.maxRetries = options.maxRetries ?? MAX_RETRIES;
  }

  /**
   * Send a completion request to OpenAI with automatic retry on rate limits.
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
    const model = params.model ?? OPENAI_DEFAULT_MODEL;
    const startTime = Date.now();

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }

    for (const msg of params.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model,
          messages,
          max_tokens: params.maxTokens ?? 4096,
          temperature: params.temperature,
          stop: params.stop ? [...params.stop] : undefined,
        });

        const validated = OpenAIResponseSchema.parse(response);
        const latencyMs = Date.now() - startTime;
        const choice = validated.choices[0];

        if (!choice) {
          throw new LLMError('No choices returned from OpenAI', 'api_error', PROVIDER, false);
        }

        const content = choice.message.content ?? '';
        const inputTokens = validated.usage?.prompt_tokens ?? 0;
        const outputTokens = validated.usage?.completion_tokens ?? 0;
        const pricing = getPricing(model);
        const costUsd = calculateCost(inputTokens, outputTokens, pricing);

        const result: CompletionResult = {
          content,
          model: validated.model,
          inputTokens,
          outputTokens,
          costUsd,
          latencyMs,
          finishReason: mapFinishReason(choice.finish_reason),
        };

        logger.info({
          provider: PROVIDER,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          latencyMs: result.latencyMs,
        }, 'OpenAI completion finished');

        return result;
      } catch (error) {
        if (error instanceof LLMError) {
          throw error;
        }

        const llmError = toOpenAIError(error);

        if (llmError.retryable && attempt < this.maxRetries) {
          const delay = llmError.retryAfterMs ?? backoffDelay(attempt);
          logger.warn({
            provider: PROVIDER,
            model,
            attempt: attempt + 1,
            maxRetries: this.maxRetries,
            delayMs: delay,
            errorCode: llmError.code,
          }, 'Retrying OpenAI request');
          await sleep(delay);
          continue;
        }

        throw llmError;
      }
    }

    throw new LLMError('Max retries exceeded', 'api_error', PROVIDER, false);
  }

  /**
   * Stream a completion response from OpenAI, yielding text chunks.
   *
   * @example
   * ```typescript
   * for await (const chunk of adapter.stream({ messages: [{ role: 'user', content: 'Hi' }] })) {
   *   if (chunk.type === 'text') process.stdout.write(chunk.content!);
   * }
   * ```
   */
  async *stream(params: CompletionParams): AsyncGenerator<StreamChunk> {
    const model = params.model ?? OPENAI_DEFAULT_MODEL;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }

    for (const msg of params.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: params.maxTokens ?? 4096,
        temperature: params.temperature,
        stop: params.stop ? [...params.stop] : undefined,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          yield { type: 'text', content: delta.content };
        }
      }

      yield { type: 'done' };
    } catch (error) {
      throw toOpenAIError(error);
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
    const model = params.model ?? OPENAI_DEFAULT_MODEL;
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
