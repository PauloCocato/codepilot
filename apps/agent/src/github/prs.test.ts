import { describe, it, expect, vi } from 'vitest';
import { createPR, commentOnIssue, generatePRTitle, generatePRBody } from './prs.js';
import { GitHubApiError } from './issues.js';

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

function createMockOctokit(prData?: Partial<{ number: number; html_url: string }>) {
  return {
    rest: {
      pulls: {
        create: vi.fn().mockResolvedValue({
          data: {
            number: prData?.number ?? 101,
            html_url: prData?.html_url ?? 'https://github.com/testorg/my-app/pull/101',
          },
        }),
      },
      issues: {
        addLabels: vi.fn().mockResolvedValue({}),
        createComment: vi.fn().mockResolvedValue({}),
      },
    },
  } as unknown as Parameters<typeof createPR>[0];
}

describe('prs', () => {
  describe('generatePRTitle', () => {
    it('should generate correct PR title', () => {
      const result = generatePRTitle(42, 'Login form crashes');
      expect(result).toBe('fix(codepilot): resolve #42 — Login form crashes');
    });

    it('should truncate long titles', () => {
      const longTitle = 'This is a very long issue title that should be truncated because it exceeds the maximum length';
      const result = generatePRTitle(42, longTitle);
      expect(result.length).toBeLessThanOrEqual(72);
      expect(result).toContain('...');
    });
  });

  describe('generatePRBody', () => {
    it('should include all sections in markdown', () => {
      const body = generatePRBody({
        summary: 'Fixed the login crash by properly validating emails.',
        filesChanged: ['src/auth/login-handler.ts', 'src/utils/validator.ts'],
        issueNumber: 42,
      });

      expect(body).toContain('## Summary');
      expect(body).toContain('Fixed the login crash');
      expect(body).toContain('## Changes');
      expect(body).toContain('`src/auth/login-handler.ts`');
      expect(body).toContain('Resolves #42');
      expect(body).toContain('## Agent Metadata');
      expect(body).toContain('CodePilot');
    });

    it('should handle empty files list', () => {
      const body = generatePRBody({
        summary: 'No files changed.',
        filesChanged: [],
        issueNumber: 1,
      });

      expect(body).toContain('_No files changed._');
    });
  });

  describe('createPR', () => {
    it('should create a PR and add labels', async () => {
      const octokit = createMockOctokit();
      const result = await createPR(octokit, {
        owner: 'testorg',
        repo: 'my-app',
        branch: 'codepilot/issue-42-fix-login',
        issueNumber: 42,
        issueTitle: 'Login form crashes',
        summary: 'Fixed login validation.',
        filesChanged: ['src/auth/login-handler.ts'],
      });

      expect(result.prNumber).toBe(101);
      expect(result.prUrl).toBe('https://github.com/testorg/my-app/pull/101');

      const pullsCreate = octokit.rest.pulls.create as unknown as ReturnType<typeof vi.fn>;
      expect(pullsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'testorg',
          repo: 'my-app',
          head: 'codepilot/issue-42-fix-login',
          base: 'main',
        }),
      );

      const addLabels = octokit.rest.issues.addLabels as unknown as ReturnType<typeof vi.fn>;
      expect(addLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['codepilot'],
          issue_number: 101,
        }),
      );
    });

    it('should not fail if adding labels fails', async () => {
      const octokit = createMockOctokit();
      const addLabels = octokit.rest.issues.addLabels as unknown as ReturnType<typeof vi.fn>;
      addLabels.mockRejectedValueOnce(new Error('Label not found'));

      const result = await createPR(octokit, {
        owner: 'testorg',
        repo: 'my-app',
        branch: 'codepilot/issue-42-fix-login',
        issueNumber: 42,
        issueTitle: 'Login form crashes',
        summary: 'Fixed login validation.',
        filesChanged: [],
      });

      expect(result.prNumber).toBe(101);
    });

    it('should throw GitHubApiError on API failure', async () => {
      const octokit = createMockOctokit();
      const pullsCreate = octokit.rest.pulls.create as unknown as ReturnType<typeof vi.fn>;
      pullsCreate.mockRejectedValueOnce({
        status: 404,
        message: 'Not Found',
      });

      await expect(
        createPR(octokit, {
          owner: 'testorg',
          repo: 'nonexistent',
          branch: 'codepilot/issue-1',
          issueNumber: 1,
          issueTitle: 'Test',
          summary: 'Test',
          filesChanged: [],
        }),
      ).rejects.toThrow(GitHubApiError);
    });
  });

  describe('commentOnIssue', () => {
    it('should create a comment on the issue', async () => {
      const octokit = createMockOctokit();
      await commentOnIssue(octokit, 'testorg', 'my-app', 42, 'CodePilot is working on this!');

      const createComment = octokit.rest.issues.createComment as unknown as ReturnType<typeof vi.fn>;
      expect(createComment).toHaveBeenCalledWith({
        owner: 'testorg',
        repo: 'my-app',
        issue_number: 42,
        body: 'CodePilot is working on this!',
      });
    });
  });
});
