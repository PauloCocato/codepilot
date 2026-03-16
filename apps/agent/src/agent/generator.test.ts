import { describe, it, expect, vi } from 'vitest';
import type { ParsedIssue, LLMAdapter, CompletionResult } from '@codepilot/shared';
import { generatePatch, GeneratorError } from './generator.js';
import type { Plan } from './types.js';

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
    title: 'Fix login redirect bug',
    body: 'When clicking login, user is not redirected.',
    labels: ['bug'],
    repoOwner: 'acme',
    repoName: 'webapp',
    fileMentions: ['src/auth/login.ts'],
  };
}

function createMockPlan(): Plan {
  return {
    summary: 'Fix redirect after login',
    steps: [
      { description: 'Update login handler', files: ['src/auth/login.ts'], action: 'modify' },
    ],
    estimatedFiles: ['src/auth/login.ts'],
    approach: 'Add redirect after auth',
  };
}

function createMockLLM(response: string): LLMAdapter {
  return {
    provider: 'mock',
    complete: vi.fn(async (): Promise<CompletionResult> => ({
      content: response,
      model: 'mock-model',
      inputTokens: 100,
      outputTokens: 500,
      costUsd: 0.002,
      latencyMs: 200,
      finishReason: 'stop',
    })),
    stream: vi.fn(),
    estimateCost: vi.fn(() => ({ estimatedInputTokens: 100, estimatedOutputTokens: 500, estimatedCostUsd: 0.002 })),
  };
}

const VALID_DIFF = `--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -10,3 +10,5 @@ async function login(user: string) {
   const token = await authenticate(user);
   return token;
+
+  redirect('/dashboard');
 }
---EXPLANATION---
Added redirect call after authentication.
---FILES---
src/auth/login.ts`;

describe('generator', () => {
  describe('generatePatch', () => {
    it('should generate a valid patch from LLM response', async () => {
      const llm = createMockLLM(VALID_DIFF);
      const result = await generatePatch(createMockIssue(), 'code context', createMockPlan(), llm);

      expect(result.patch).toContain('--- a/src/auth/login.ts');
      expect(result.patch).toContain('+++ b/src/auth/login.ts');
      expect(result.explanation).toContain('redirect');
      expect(result.filesChanged).toContain('src/auth/login.ts');
    });

    it('should extract diff from code fences', async () => {
      const fencedDiff = '```diff\n' + VALID_DIFF.split('---EXPLANATION---')[0].trim() + '\n```\n---EXPLANATION---\nFixed it.\n---FILES---\nsrc/auth/login.ts';
      const llm = createMockLLM(fencedDiff);
      const result = await generatePatch(createMockIssue(), '', createMockPlan(), llm);

      expect(result.patch).toContain('--- a/src/auth/login.ts');
    });

    it('should use plan estimated files as fallback when no files marker', async () => {
      const diffNoFiles = `--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;`;
      const llm = createMockLLM(diffNoFiles);
      const result = await generatePatch(createMockIssue(), '', createMockPlan(), llm);

      expect(result.filesChanged).toContain('src/auth/login.ts');
    });

    it('should retry on invalid diff and succeed on second attempt', async () => {
      const completeFn = vi.fn()
        .mockResolvedValueOnce({
          content: 'Here is my analysis of the issue...',
          model: 'mock', inputTokens: 100, outputTokens: 100,
          costUsd: 0.001, latencyMs: 100, finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          content: VALID_DIFF,
          model: 'mock', inputTokens: 100, outputTokens: 500,
          costUsd: 0.002, latencyMs: 200, finishReason: 'stop',
        });

      const llm: LLMAdapter = {
        provider: 'mock',
        complete: completeFn,
        stream: vi.fn(),
        estimateCost: vi.fn(() => ({ estimatedInputTokens: 100, estimatedOutputTokens: 500, estimatedCostUsd: 0.002 })),
      };

      const result = await generatePatch(createMockIssue(), '', createMockPlan(), llm);
      expect(result.patch).toContain('--- a/');
      expect(completeFn).toHaveBeenCalledTimes(2);
    });

    it('should throw GeneratorError after max retries with no valid diff', async () => {
      const llm = createMockLLM('no diff content here at all');

      await expect(generatePatch(createMockIssue(), '', createMockPlan(), llm))
        .rejects.toThrow(GeneratorError);
    });

    it('should include previous error in prompt when provided', async () => {
      const llm = createMockLLM(VALID_DIFF);
      await generatePatch(createMockIssue(), '', createMockPlan(), llm, 'Tests failed: 3 failures');

      const callArgs = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('Tests failed: 3 failures');
    });
  });
});
