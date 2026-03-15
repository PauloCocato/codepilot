import { z } from 'zod';

export type {
  LLMAdapter,
  CompletionParams,
  CompletionResult,
  StreamChunk,
  CostEstimate,
  Message,
} from '@codepilot/shared';

/** Error codes for LLM operations */
export type LLMErrorCode = 'rate_limit' | 'context_too_long' | 'api_error' | 'timeout';

/** Custom error class for LLM errors */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: LLMErrorCode,
    public readonly provider: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * Zod schema to validate Anthropic API response structure.
 *
 * @example
 * ```typescript
 * const validated = AnthropicResponseSchema.parse(apiResponse);
 * ```
 */
export const AnthropicResponseSchema = z.object({
  id: z.string(),
  type: z.literal('message'),
  role: z.literal('assistant'),
  content: z.array(z.object({
    type: z.string(),
    text: z.string().optional(),
  })),
  model: z.string(),
  stop_reason: z.enum(['end_turn', 'max_tokens', 'stop_sequence']).nullable(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }),
});

export type AnthropicResponse = z.infer<typeof AnthropicResponseSchema>;

/**
 * Zod schema to validate OpenAI API response structure.
 *
 * @example
 * ```typescript
 * const validated = OpenAIResponseSchema.parse(apiResponse);
 * ```
 */
export const OpenAIResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number(),
    message: z.object({
      role: z.string(),
      content: z.string().nullable(),
    }),
    finish_reason: z.enum(['stop', 'length', 'content_filter', 'function_call']).nullable(),
  })),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }).optional(),
});

export type OpenAIResponse = z.infer<typeof OpenAIResponseSchema>;

/** Pricing per million tokens (USD) */
export interface ModelPricing {
  readonly inputPerMTok: number;
  readonly outputPerMTok: number;
}

/**
 * Calculate cost in USD based on token usage and pricing.
 *
 * @example
 * ```typescript
 * const cost = calculateCost(1000, 500, { inputPerMTok: 3, outputPerMTok: 15 });
 * // cost === 0.0105
 * ```
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing,
): number {
  return (inputTokens * pricing.inputPerMTok + outputTokens * pricing.outputPerMTok) / 1_000_000;
}

/**
 * Estimate token count from text using a simple heuristic (4 chars per token).
 *
 * @example
 * ```typescript
 * const tokens = estimateTokens("Hello world");
 * // tokens === 3
 * ```
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate delay for exponential backoff with jitter.
 *
 * @example
 * ```typescript
 * const delay = backoffDelay(1); // ~2000ms
 * const delay2 = backoffDelay(2); // ~4000ms
 * ```
 */
export function backoffDelay(attempt: number, baseMs: number = 1000): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseMs;
  return exponential + jitter;
}

/**
 * Sleep for the specified duration in milliseconds.
 *
 * @example
 * ```typescript
 * await sleep(1000); // waits 1 second
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
