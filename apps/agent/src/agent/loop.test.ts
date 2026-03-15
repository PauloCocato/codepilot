import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMAdapter, CompletionResult } from '@codepilot/shared';
import type { AgentConfig } from './types.js';
import { runAgent, AgentLoopError } from './loop.js';

// === MOCK ALL DEPENDENCIES ===

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

vi.mock('../utils/cost.js', () => ({
  CostTracker: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    totalCostUsd: 0,
    totalEntries: 0,
  })),
}));

const mockParseIssue = vi.fn();
vi.mock('../github/issues.js', () => ({
  parseIssue: (...args: unknown[]) => mockParseIssue(...args),
  GitHubApiError: class extends Error {
    code: string;
    statusCode: number;
    retryable: boolean;
    constructor(msg: string, code: string, statusCode: number, retryable: boolean) {
      super(msg);
      this.code = code;
      this.statusCode = statusCode;
      this.retryable = retryable;
    }
  },
}));

const mockCloneRepo = vi.fn();
const mockCreateBranch = vi.fn();
const mockApplyPatch = vi.fn();
const mockCommitAndPush = vi.fn();
const mockCleanup = vi.fn();
const mockGenerateBranchName = vi.fn();
vi.mock('../github/repos.js', () => ({
  cloneRepo: (...args: unknown[]) => mockCloneRepo(...args),
  createBranch: (...args: unknown[]) => mockCreateBranch(...args),
  applyPatch: (...args: unknown[]) => mockApplyPatch(...args),
  commitAndPush: (...args: unknown[]) => mockCommitAndPush(...args),
  cleanup: (...args: unknown[]) => mockCleanup(...args),
  generateBranchName: (...args: unknown[]) => mockGenerateBranchName(...args),
}));

const mockCreatePR = vi.fn();
const mockCommentOnIssue = vi.fn();
vi.mock('../github/prs.js', () => ({
  createPR: (...args: unknown[]) => mockCreatePR(...args),
  commentOnIssue: (...args: unknown[]) => mockCommentOnIssue(...args),
}));

const mockChunkCodebase = vi.fn();
vi.mock('../indexer/chunker.js', () => ({
  chunkCodebase: (...args: unknown[]) => mockChunkCodebase(...args),
}));

const mockGenerateEmbeddings = vi.fn();
const mockCreateEmbeddingAdapter = vi.fn();
vi.mock('../indexer/embeddings.js', () => ({
  generateEmbeddings: (...args: unknown[]) => mockGenerateEmbeddings(...args),
  createEmbeddingAdapter: (...args: unknown[]) => mockCreateEmbeddingAdapter(...args),
}));

const mockChromaStoreUpsert = vi.fn();
vi.mock('../indexer/store.js', () => ({
  ChromaStore: vi.fn().mockImplementation(() => ({
    upsert: mockChromaStoreUpsert,
    search: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    stats: vi.fn(async () => ({ totalChunks: 0, totalFiles: 0, languages: [] })),
  })),
}));

const mockSearchForIssue = vi.fn();
vi.mock('./searcher.js', () => ({
  searchForIssue: (...args: unknown[]) => mockSearchForIssue(...args),
}));

const mockCreatePlan = vi.fn();
vi.mock('./planner.js', () => ({
  createPlan: (...args: unknown[]) => mockCreatePlan(...args),
  PlannerError: class extends Error {
    code: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.code = code;
    }
  },
}));

const mockGeneratePatchFn = vi.fn();
vi.mock('./generator.js', () => ({
  generatePatch: (...args: unknown[]) => mockGeneratePatchFn(...args),
  GeneratorError: class extends Error {
    code: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.code = code;
    }
  },
}));

const mockRunInSandbox = vi.fn();
vi.mock('./runner.js', () => ({
  runInSandbox: (...args: unknown[]) => mockRunInSandbox(...args),
}));

const mockReviewPatch = vi.fn();
vi.mock('./critic.js', () => ({
  reviewPatch: (...args: unknown[]) => mockReviewPatch(...args),
}));

// === HELPERS ===

function createMockLLM(): LLMAdapter {
  return {
    provider: 'mock',
    complete: vi.fn(async (): Promise<CompletionResult> => ({
      content: 'mock response',
      model: 'mock-model',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.001,
      latencyMs: 50,
      finishReason: 'stop',
    })),
    stream: vi.fn(),
    estimateCost: vi.fn(() => ({ estimatedInputTokens: 100, estimatedOutputTokens: 200, estimatedCostUsd: 0.001 })),
  };
}

function createMockConfig(): AgentConfig {
  return {
    llm: createMockLLM(),
    vectorStore: {
      upsert: vi.fn(async () => undefined),
      search: vi.fn(async () => []),
      delete: vi.fn(async () => undefined),
      stats: vi.fn(async () => ({ totalChunks: 0, totalFiles: 0, languages: [] })),
    },
    sandboxManager: {
      createSandbox: vi.fn(async () => ({
        id: 'sb-1',
        containerId: 'c-1',
        status: 'running' as const,
        createdAt: new Date(),
        repoPath: '/tmp/repo',
        runtimeConfig: { language: 'node', dockerfile: 'Dockerfile', installCmd: 'npm i', testCmd: 'npm test', buildCmd: 'npm run build' },
      })),
      destroySandbox: vi.fn(async () => undefined),
      listActiveSandboxes: vi.fn(() => []),
      cleanupStale: vi.fn(async () => 0),
    } as unknown as AgentConfig['sandboxManager'],
    octokit: {} as AgentConfig['octokit'],
    maxRetries: 3,
    maxContextTokens: 30_000,
  };
}

const ISSUE_URL = 'https://github.com/acme/webapp/issues/42';

function setupHappyPath(): void {
  mockParseIssue.mockResolvedValue({
    number: 42,
    title: 'Fix login redirect',
    body: 'User not redirected.',
    labels: ['bug'],
    repoOwner: 'acme',
    repoName: 'webapp',
    fileMentions: [],
  });
  mockCloneRepo.mockResolvedValue({ path: '/tmp/codepilot/acme-webapp-abc', defaultBranch: 'main' });
  mockChunkCodebase.mockResolvedValue([]);
  mockCreateEmbeddingAdapter.mockReturnValue({});
  mockGenerateEmbeddings.mockResolvedValue({ chunks: [], totalTokens: 0, totalCostUsd: 0 });
  mockChromaStoreUpsert.mockResolvedValue(undefined);
  mockSearchForIssue.mockResolvedValue('relevant code here');
  mockCreatePlan.mockResolvedValue({
    summary: 'Fix redirect',
    steps: [{ description: 'Update login', files: ['src/auth/login.ts'], action: 'modify' }],
    estimatedFiles: ['src/auth/login.ts'],
    approach: 'Add redirect call',
  });
  mockGeneratePatchFn.mockResolvedValue({
    patch: '--- a/src/auth/login.ts\n+++ b/src/auth/login.ts\n@@ -1 +1,2 @@\n+redirect()',
    explanation: 'Added redirect call',
    filesChanged: ['src/auth/login.ts'],
  });
  mockRunInSandbox.mockResolvedValue({
    patchApplied: true,
    testsRan: true,
    testsPassed: true,
    output: '10 passing',
  });
  mockReviewPatch.mockResolvedValue({
    score: 85,
    passed: true,
    feedback: 'Looks good',
    issues: [],
  });
  mockGenerateBranchName.mockReturnValue('codepilot/issue-42-fix-login-redirect');
  mockCreateBranch.mockResolvedValue(undefined);
  mockApplyPatch.mockResolvedValue({ success: true, filesChanged: ['src/auth/login.ts'] });
  mockCommitAndPush.mockResolvedValue({ sha: 'abc123' });
  mockCreatePR.mockResolvedValue({ prUrl: 'https://github.com/acme/webapp/pull/99', prNumber: 99 });
  mockCommentOnIssue.mockResolvedValue(undefined);
  mockCleanup.mockResolvedValue(undefined);
}

// === TESTS ===

describe('loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runAgent', () => {
    it('should complete happy path: issue → PR in 1 attempt', async () => {
      setupHappyPath();
      const config = createMockConfig();

      const run = await runAgent(ISSUE_URL, config);

      expect(run.result.success).toBe(true);
      expect(run.result.prUrl).toBe('https://github.com/acme/webapp/pull/99');
      expect(run.result.issueNumber).toBe(42);
      expect(run.issueNumber).toBe(42);
      expect(run.completedAt).toBeDefined();
      expect(run.steps.length).toBeGreaterThan(0);
    });

    it('should retry when tests fail and succeed on second attempt', async () => {
      setupHappyPath();
      mockRunInSandbox
        .mockResolvedValueOnce({
          patchApplied: true,
          testsRan: true,
          testsPassed: false,
          output: '2 failing',
          error: 'Tests failed: 2 failures',
        })
        .mockResolvedValueOnce({
          patchApplied: true,
          testsRan: true,
          testsPassed: true,
          output: '10 passing',
        });

      const config = createMockConfig();
      const run = await runAgent(ISSUE_URL, config);

      expect(run.result.success).toBe(true);
      expect(run.result.attempts).toBe(2);
      expect(mockGeneratePatchFn).toHaveBeenCalledTimes(2);
    });

    it('should fail after max test retries exhausted', async () => {
      setupHappyPath();
      mockRunInSandbox.mockResolvedValue({
        patchApplied: true,
        testsRan: true,
        testsPassed: false,
        output: 'failing',
        error: 'Tests always fail',
      });

      const config = createMockConfig();
      const run = await runAgent(ISSUE_URL, config);

      expect(run.result.success).toBe(false);
      expect(run.result.error).toContain('Max retries exhausted');
      expect(mockCommentOnIssue).toHaveBeenCalled();
    });

    it('should retry when critic rejects and succeed on second attempt', async () => {
      setupHappyPath();
      mockReviewPatch
        .mockResolvedValueOnce({
          score: 40,
          passed: false,
          feedback: 'Missing edge case handling',
          issues: [{ severity: 'error', description: 'No edge case' }],
        })
        .mockResolvedValueOnce({
          score: 80,
          passed: true,
          feedback: 'Looks good now',
          issues: [],
        });

      // Need sandbox to pass both times
      mockRunInSandbox.mockResolvedValue({
        patchApplied: true,
        testsRan: true,
        testsPassed: true,
        output: '10 passing',
      });

      const config = createMockConfig();
      const run = await runAgent(ISSUE_URL, config);

      expect(run.result.success).toBe(true);
      expect(mockGeneratePatchFn).toHaveBeenCalledTimes(2);
    });

    it('should handle invalid issue URL', async () => {
      const config = createMockConfig();
      const run = await runAgent('not-a-valid-url', config);

      expect(run.result.success).toBe(false);
      expect(run.result.error).toContain('Invalid issue URL');
    });

    it('should handle parse issue failure', async () => {
      mockParseIssue.mockRejectedValue(new Error('Issue not found'));
      mockCloneRepo.mockResolvedValue({ path: '/tmp/repo', defaultBranch: 'main' });
      mockCleanup.mockResolvedValue(undefined);
      mockCommentOnIssue.mockResolvedValue(undefined);

      const config = createMockConfig();
      const run = await runAgent(ISSUE_URL, config);

      expect(run.result.success).toBe(false);
      expect(run.result.error).toContain('Issue not found');
    });

    it('should always cleanup repo even on failure', async () => {
      setupHappyPath();
      mockCreatePlan.mockRejectedValue(new Error('LLM down'));
      mockCommentOnIssue.mockResolvedValue(undefined);

      const config = createMockConfig();
      await runAgent(ISSUE_URL, config);

      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should never crash — returns failed result on any exception', async () => {
      setupHappyPath();
      mockParseIssue.mockRejectedValue(new Error('Unexpected'));
      mockCommentOnIssue.mockResolvedValue(undefined);
      mockCleanup.mockResolvedValue(undefined);

      const config = createMockConfig();
      const run = await runAgent(ISSUE_URL, config);

      // Should not throw, should return a result
      expect(run).toBeDefined();
      expect(run.result.success).toBe(false);
    });

    it('should comment on issue when agent fails', async () => {
      setupHappyPath();
      mockCreatePlan.mockRejectedValue(new Error('Planning failed'));
      mockCommentOnIssue.mockResolvedValue(undefined);

      const config = createMockConfig();
      await runAgent(ISSUE_URL, config);

      expect(mockCommentOnIssue).toHaveBeenCalledWith(
        expect.anything(),
        'acme',
        'webapp',
        42,
        expect.stringContaining('Planning failed'),
      );
    });

    it('should include step timing information', async () => {
      setupHappyPath();
      const config = createMockConfig();
      const run = await runAgent(ISSUE_URL, config);

      for (const step of run.steps) {
        expect(step.durationMs).toBeGreaterThanOrEqual(0);
        expect(['running', 'success', 'failed']).toContain(step.status);
      }
    });

    it('should handle cleanup failure gracefully', async () => {
      setupHappyPath();
      mockCleanup.mockRejectedValue(new Error('Permission denied'));

      const config = createMockConfig();
      // Should not throw even if cleanup fails
      const run = await runAgent(ISSUE_URL, config);
      expect(run.result.success).toBe(true);
    });
  });
});
