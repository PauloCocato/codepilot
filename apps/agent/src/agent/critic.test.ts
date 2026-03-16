import { describe, it, expect, vi } from 'vitest';
import type { ParsedIssue, LLMAdapter, CompletionResult } from '@codepilot/shared';
import { reviewPatch } from './critic.js';

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

function createMockIssue(): ParsedIssue {
  return {
    number: 42,
    title: 'Fix login redirect',
    body: 'User is not redirected after login.',
    labels: ['bug'],
    repoOwner: 'acme',
    repoName: 'webapp',
    fileMentions: [],
  };
}

function createMockLLM(response: string): LLMAdapter {
  return {
    provider: 'mock',
    complete: vi.fn(async (): Promise<CompletionResult> => ({
      content: response,
      model: 'mock-model',
      inputTokens: 200,
      outputTokens: 300,
      costUsd: 0.002,
      latencyMs: 150,
      finishReason: 'stop',
    })),
    stream: vi.fn(),
    estimateCost: vi.fn(() => ({ estimatedInputTokens: 200, estimatedOutputTokens: 300, estimatedCostUsd: 0.002 })),
  };
}

const PASSING_REVIEW = JSON.stringify({
  correctness: 18,
  security: 16,
  style: 15,
  completeness: 17,
  simplicity: 14,
  feedback: 'Good solution, minor style nits.',
  issues: [
    { severity: 'info', description: 'Consider adding a comment', file: 'src/auth/login.ts', line: 15 },
  ],
});

const FAILING_REVIEW = JSON.stringify({
  correctness: 5,
  security: 10,
  style: 10,
  completeness: 5,
  simplicity: 10,
  feedback: 'The patch does not actually fix the redirect issue.',
  issues: [
    { severity: 'error', description: 'Missing redirect call', file: 'src/auth/login.ts', line: 12 },
    { severity: 'warning', description: 'Unused import', file: 'src/auth/login.ts' },
  ],
});

describe('critic', () => {
  describe('reviewPatch', () => {
    it('should return passing result when score >= 60', async () => {
      const llm = createMockLLM(PASSING_REVIEW);
      const result = await reviewPatch('diff content', createMockIssue(), 'code context', llm);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(80);
      expect(result.feedback).toContain('Good solution');
      expect(result.issues).toHaveLength(1);
    });

    it('should return failing result when score < 60', async () => {
      const llm = createMockLLM(FAILING_REVIEW);
      const result = await reviewPatch('diff content', createMockIssue(), '', llm);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(40);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].severity).toBe('error');
    });

    it('should handle invalid JSON response gracefully', async () => {
      const llm = createMockLLM('This is not JSON at all');
      const result = await reviewPatch('diff', createMockIssue(), '', llm);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.issues).toHaveLength(1);
    });

    it('should handle JSON with missing required fields', async () => {
      const partial = JSON.stringify({ correctness: 15, feedback: 'partial' });
      const llm = createMockLLM(partial);
      const result = await reviewPatch('diff', createMockIssue(), '', llm);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should handle JSON wrapped in code fences', async () => {
      const fenced = '```json\n' + PASSING_REVIEW + '\n```';
      const llm = createMockLLM(fenced);
      const result = await reviewPatch('diff', createMockIssue(), '', llm);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(80);
    });

    it('should propagate LLM errors', async () => {
      const llm: LLMAdapter = {
        provider: 'mock',
        complete: vi.fn(async () => { throw new Error('Rate limited'); }),
        stream: vi.fn(),
        estimateCost: vi.fn(() => ({ estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0 })),
      };

      await expect(reviewPatch('diff', createMockIssue(), '', llm))
        .rejects.toThrow('Rate limited');
    });

    it('should correctly calculate score at boundary (exactly 60)', async () => {
      const boundaryReview = JSON.stringify({
        correctness: 12,
        security: 12,
        style: 12,
        completeness: 12,
        simplicity: 12,
        feedback: 'Borderline acceptable.',
        issues: [],
      });
      const llm = createMockLLM(boundaryReview);
      const result = await reviewPatch('diff', createMockIssue(), '', llm);

      expect(result.score).toBe(60);
      expect(result.passed).toBe(true);
    });
  });
});
