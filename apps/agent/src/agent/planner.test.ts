import { describe, it, expect, vi } from 'vitest';
import type { ParsedIssue, LLMAdapter, CompletionResult } from '@codepilot/shared';
import { createPlan, PlannerError } from './planner.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

function createMockIssue(overrides: Partial<ParsedIssue> = {}): ParsedIssue {
  return {
    number: 42,
    title: 'Fix login redirect bug',
    body: 'When clicking login, user is not redirected.',
    labels: ['bug'],
    repoOwner: 'acme',
    repoName: 'webapp',
    fileMentions: ['src/auth/login.ts'],
    stepsToReproduce: '1. Go to /login\n2. Click submit',
    expectedBehavior: 'Redirect to /dashboard',
    ...overrides,
  };
}

function createMockLLM(response: string): LLMAdapter {
  return {
    provider: 'mock',
    complete: vi.fn(async (): Promise<CompletionResult> => ({
      content: response,
      model: 'mock-model',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.001,
      latencyMs: 100,
      finishReason: 'stop',
    })),
    stream: vi.fn(),
    estimateCost: vi.fn(() => ({ estimatedInputTokens: 100, estimatedOutputTokens: 200, estimatedCostUsd: 0.001 })),
  };
}

const VALID_PLAN_JSON = JSON.stringify({
  summary: 'Fix redirect after login',
  steps: [
    { description: 'Update login handler to redirect', files: ['src/auth/login.ts'], action: 'modify' },
  ],
  estimatedFiles: ['src/auth/login.ts'],
  approach: 'Modify the login handler to redirect to /dashboard after successful authentication',
});

describe('planner', () => {
  describe('createPlan', () => {
    it('should create a valid plan from LLM response', async () => {
      const llm = createMockLLM(VALID_PLAN_JSON);
      const issue = createMockIssue();

      const plan = await createPlan(issue, 'some code context', llm);

      expect(plan.summary).toBe('Fix redirect after login');
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].action).toBe('modify');
      expect(plan.estimatedFiles).toContain('src/auth/login.ts');
      expect(plan.approach).toContain('redirect');
    });

    it('should handle JSON wrapped in code fences', async () => {
      const response = '```json\n' + VALID_PLAN_JSON + '\n```';
      const llm = createMockLLM(response);
      const issue = createMockIssue();

      const plan = await createPlan(issue, '', llm);
      expect(plan.summary).toBe('Fix redirect after login');
    });

    it('should retry on invalid JSON and succeed on second attempt', async () => {
      const completeFn = vi.fn()
        .mockResolvedValueOnce({
          content: 'This is not valid JSON',
          model: 'mock', inputTokens: 100, outputTokens: 100,
          costUsd: 0.001, latencyMs: 100, finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          content: VALID_PLAN_JSON,
          model: 'mock', inputTokens: 100, outputTokens: 200,
          costUsd: 0.001, latencyMs: 100, finishReason: 'stop',
        });

      const llm: LLMAdapter = {
        provider: 'mock',
        complete: completeFn,
        stream: vi.fn(),
        estimateCost: vi.fn(() => ({ estimatedInputTokens: 100, estimatedOutputTokens: 200, estimatedCostUsd: 0.001 })),
      };

      const plan = await createPlan(createMockIssue(), '', llm);
      expect(plan.summary).toBe('Fix redirect after login');
      expect(completeFn).toHaveBeenCalledTimes(2);
    });

    it('should throw PlannerError after max retries with invalid responses', async () => {
      const llm = createMockLLM('not valid json at all');

      await expect(createPlan(createMockIssue(), '', llm))
        .rejects.toThrow(PlannerError);
    });

    it('should throw on LLM error', async () => {
      const llm: LLMAdapter = {
        provider: 'mock',
        complete: vi.fn(async () => { throw new Error('API timeout'); }),
        stream: vi.fn(),
        estimateCost: vi.fn(() => ({ estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0 })),
      };

      await expect(createPlan(createMockIssue(), '', llm))
        .rejects.toThrow('API timeout');
    });

    it('should include file mentions and labels in the prompt', async () => {
      const llm = createMockLLM(VALID_PLAN_JSON);
      const issue = createMockIssue({ fileMentions: ['src/a.ts', 'src/b.ts'], labels: ['bug', 'critical'] });

      await createPlan(issue, '', llm);

      const callArgs = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('src/a.ts');
      expect(callArgs.messages[0].content).toContain('critical');
    });
  });
});
