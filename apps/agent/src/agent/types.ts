import type { AgentResult } from '@codepilot/shared';

/** Configuration for an agent run */
export interface AgentConfig {
  readonly maxRetries: number;
  readonly maxContextTokens: number;
}

/** A single step in the agent execution */
export interface AgentStep {
  readonly name: string;
  readonly status: 'running' | 'success' | 'failed';
  readonly durationMs: number;
  readonly details?: string;
}

/** Full record of an agent run */
export interface AgentRun {
  readonly id: string;
  readonly issueNumber: number;
  readonly steps: readonly AgentStep[];
  readonly result: AgentResult;
  readonly startedAt: Date;
  readonly completedAt?: Date;
}

export type { AgentResult };
