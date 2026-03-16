/** Parameters for LLM completion requests */
export interface CompletionParams {
  readonly model?: string;
  readonly messages: readonly Message[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly systemPrompt?: string;
  readonly stop?: readonly string[];
}

/** A message in the conversation */
export interface Message {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/** Result from an LLM completion */
export interface CompletionResult {
  readonly content: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly latencyMs: number;
  readonly finishReason: 'stop' | 'length' | 'error';
}

/** Chunk emitted during LLM streaming */
export interface StreamChunk {
  readonly type: 'text' | 'done';
  readonly content?: string;
}

/** Cost estimate for an LLM call */
export interface CostEstimate {
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
  readonly estimatedCostUsd: number;
}

/** LLM Adapter interface — all providers implement this */
export interface LLMAdapter {
  readonly provider: string;
  complete(params: CompletionParams): Promise<CompletionResult>;
  stream(params: CompletionParams): AsyncGenerator<StreamChunk>;
  estimateCost(params: CompletionParams): CostEstimate;
}

/** Result of a full agent run */
export interface AgentResult {
  readonly success: boolean;
  readonly issueNumber: number;
  readonly patch?: string;
  readonly explanation?: string;
  readonly prUrl?: string;
  readonly attempts: number;
  readonly totalCostUsd: number;
  readonly totalLatencyMs: number;
  readonly safetyScore?: number;
  readonly error?: string;
}

/** Structured representation of a GitHub issue */
export interface ParsedIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
  readonly repoOwner: string;
  readonly repoName: string;
  readonly fileMentions: readonly string[];
  readonly stepsToReproduce?: string;
  readonly expectedBehavior?: string;
}
