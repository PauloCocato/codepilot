export type { LLMAdapter, CompletionParams, CompletionResult, StreamChunk, CostEstimate } from '@codepilot/shared';

/** Custom error class for LLM errors */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: 'rate_limit' | 'context_too_long' | 'api_error' | 'timeout',
    public readonly provider: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}
