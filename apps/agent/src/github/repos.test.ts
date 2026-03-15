import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateBranchName, GitOperationError } from './repos.js';

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

const mockGit = {
  clone: vi.fn().mockResolvedValue(undefined),
  branch: vi.fn().mockResolvedValue({ current: 'main' }),
  checkoutLocalBranch: vi.fn().mockResolvedValue(undefined),
  applyPatch: vi.fn().mockResolvedValue(undefined),
  status: vi.fn().mockResolvedValue({
    modified: ['src/index.ts'],
    created: ['src/new-file.ts'],
    deleted: [],
    not_added: [],
  }),
  add: vi.fn().mockResolvedValue(undefined),
  commit: vi.fn().mockResolvedValue({ commit: 'abc1234' }),
  push: vi.fn().mockResolvedValue(undefined),
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

describe('repos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateBranchName', () => {
    it('should generate correct branch name from issue number and title', () => {
      const result = generateBranchName(42, 'Login form crashes on submit');
      expect(result).toBe('codepilot/issue-42-login-form-crashes-on-submit');
    });

    it('should limit to 5 words in slug', () => {
      const result = generateBranchName(1, 'This is a very long title with many extra words');
      expect(result).toBe('codepilot/issue-1-this-is-a-very-long');
    });

    it('should strip special characters from title', () => {
      const result = generateBranchName(5, "Fix bug: can't login with email!");
      expect(result).toBe('codepilot/issue-5-fix-bug-cant-login-with');
    });

    it('should handle empty title', () => {
      const result = generateBranchName(10, '');
      expect(result).toBe('codepilot/issue-10-');
    });
  });

  describe('cloneRepo', () => {
    it('should clone repository with shallow clone', async () => {
      const { cloneRepo } = await import('./repos.js');
      const result = await cloneRepo('testorg', 'my-app', '/tmp/codepilot/test-clone');

      expect(result.path).toBe('/tmp/codepilot/test-clone');
      expect(result.defaultBranch).toBe('main');
      expect(mockGit.clone).toHaveBeenCalledWith(
        'https://github.com/testorg/my-app.git',
        '/tmp/codepilot/test-clone',
        ['--depth', '1'],
      );
    });

    it('should throw GitOperationError on clone failure', async () => {
      mockGit.clone.mockRejectedValueOnce(new Error('Authentication failed'));
      const { cloneRepo } = await import('./repos.js');

      await expect(cloneRepo('testorg', 'private-repo', '/tmp/test')).rejects.toThrow(GitOperationError);
    });
  });

  describe('createBranch', () => {
    it('should create a local branch', async () => {
      const { createBranch } = await import('./repos.js');
      await createBranch('/tmp/repo', 'codepilot/issue-42-fix-login');

      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith('codepilot/issue-42-fix-login');
    });

    it('should throw GitOperationError on failure', async () => {
      mockGit.checkoutLocalBranch.mockRejectedValueOnce(new Error('Branch already exists'));
      const { createBranch } = await import('./repos.js');

      await expect(createBranch('/tmp/repo', 'existing-branch')).rejects.toThrow(GitOperationError);
    });
  });

  describe('applyPatch', () => {
    it('should apply patch and return changed files', async () => {
      const { applyPatch } = await import('./repos.js');
      const result = await applyPatch('/tmp/repo', 'diff --git a/src/index.ts...');

      expect(result.success).toBe(true);
      expect(result.filesChanged).toContain('src/index.ts');
      expect(result.filesChanged).toContain('src/new-file.ts');
    });

    it('should return failure result on bad patch', async () => {
      mockGit.applyPatch.mockRejectedValueOnce(new Error('patch does not apply'));
      const { applyPatch } = await import('./repos.js');

      const result = await applyPatch('/tmp/repo', 'invalid-patch');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('commitAndPush', () => {
    it('should commit and push changes', async () => {
      const { commitAndPush } = await import('./repos.js');
      const result = await commitAndPush('/tmp/repo', 'fix: resolve login issue', 'codepilot/issue-42');

      expect(result.sha).toBe('abc1234');
      expect(mockGit.add).toHaveBeenCalledWith('.');
      expect(mockGit.commit).toHaveBeenCalledWith('fix: resolve login issue');
      expect(mockGit.push).toHaveBeenCalledWith('origin', 'codepilot/issue-42', ['--set-upstream']);
    });
  });

  describe('cleanup', () => {
    it('should remove the repository directory', async () => {
      const { cleanup } = await import('./repos.js');
      const { rm } = await import('node:fs/promises');
      await cleanup('/tmp/codepilot/test-clone');

      expect(rm).toHaveBeenCalledWith('/tmp/codepilot/test-clone', { recursive: true, force: true });
    });
  });
});
