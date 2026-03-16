import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  readRepoConfig,
  clearConfigCache,
  DEFAULT_REPO_CONFIG,
  RepoConfigSchema,
} from './config-reader.js';

function createMockOctokit(getContentImpl: Mock) {
  return {
    rest: {
      repos: {
        getContent: getContentImpl,
      },
    },
  } as unknown as Parameters<typeof readRepoConfig>[0];
}

function encodeContent(content: string): string {
  return Buffer.from(content).toString('base64');
}

function fileResponse(content: string) {
  return {
    data: {
      type: 'file' as const,
      content: encodeContent(content),
      encoding: 'base64',
    },
  };
}

describe('config-reader', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it('should return defaults when file not found (404)', async () => {
    const getContent = vi.fn().mockRejectedValue({ status: 404 });
    const octokit = createMockOctokit(getContent);

    const config = await readRepoConfig(octokit, 'owner', 'repo');

    expect(config).toEqual(DEFAULT_REPO_CONFIG);
    expect(getContent).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      path: '.codepilot.yml',
    });
  });

  it('should parse valid YAML correctly', async () => {
    const yaml = `
trigger_label: autofix
max_cost_usd: 5.0
auto_merge: true
excluded_paths:
  - "docs/"
  - "test/"
`;
    const getContent = vi.fn().mockResolvedValue(fileResponse(yaml));
    const octokit = createMockOctokit(getContent);

    const config = await readRepoConfig(octokit, 'owner', 'repo');

    expect(config).toEqual({
      trigger_label: 'autofix',
      max_cost_usd: 5.0,
      auto_merge: true,
      excluded_paths: ['docs/', 'test/'],
    });
  });

  it('should use defaults for missing fields', async () => {
    const yaml = `trigger_label: custom-label`;
    const getContent = vi.fn().mockResolvedValue(fileResponse(yaml));
    const octokit = createMockOctokit(getContent);

    const config = await readRepoConfig(octokit, 'owner', 'repo');

    expect(config).toEqual({
      trigger_label: 'custom-label',
      max_cost_usd: 1.0,
      auto_merge: false,
      excluded_paths: [],
    });
  });

  it('should handle invalid YAML gracefully and return defaults', async () => {
    const invalidYaml = `
trigger_label: [[[invalid yaml
  broken: {{{
`;
    const getContent = vi.fn().mockResolvedValue(fileResponse(invalidYaml));
    const octokit = createMockOctokit(getContent);

    const config = await readRepoConfig(octokit, 'owner', 'repo');

    expect(config).toEqual(DEFAULT_REPO_CONFIG);
  });

  it('should reject max_cost_usd greater than 10 and return defaults', async () => {
    const yaml = `max_cost_usd: 50`;
    const getContent = vi.fn().mockResolvedValue(fileResponse(yaml));
    const octokit = createMockOctokit(getContent);

    const config = await readRepoConfig(octokit, 'owner', 'repo');

    expect(config).toEqual(DEFAULT_REPO_CONFIG);
  });

  it('should reject max_cost_usd less than 0.01 and return defaults', async () => {
    const yaml = `max_cost_usd: 0.001`;
    const getContent = vi.fn().mockResolvedValue(fileResponse(yaml));
    const octokit = createMockOctokit(getContent);

    const config = await readRepoConfig(octokit, 'owner', 'repo');

    expect(config).toEqual(DEFAULT_REPO_CONFIG);
  });

  it('should return cached result on second call', async () => {
    const yaml = `trigger_label: cached`;
    const getContent = vi.fn().mockResolvedValue(fileResponse(yaml));
    const octokit = createMockOctokit(getContent);

    const first = await readRepoConfig(octokit, 'owner', 'repo');
    const second = await readRepoConfig(octokit, 'owner', 'repo');

    expect(first).toEqual(second);
    expect(getContent).toHaveBeenCalledTimes(1);
  });

  it('should expire cache after TTL', async () => {
    const yaml = `trigger_label: expires`;
    const getContent = vi.fn().mockResolvedValue(fileResponse(yaml));
    const octokit = createMockOctokit(getContent);

    await readRepoConfig(octokit, 'owner', 'repo');

    // Advance time past TTL (5 minutes)
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);

    await readRepoConfig(octokit, 'owner', 'repo');

    expect(getContent).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('should handle network errors gracefully and return defaults', async () => {
    const getContent = vi
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED'));
    const octokit = createMockOctokit(getContent);

    const config = await readRepoConfig(octokit, 'owner', 'repo');

    expect(config).toEqual(DEFAULT_REPO_CONFIG);
  });

  it('should handle non-file content (directory) gracefully and return defaults', async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: [
        { type: 'file', name: 'something.yml' },
      ],
    });
    const octokit = createMockOctokit(getContent);

    const config = await readRepoConfig(octokit, 'owner', 'repo');

    expect(config).toEqual(DEFAULT_REPO_CONFIG);
  });

  it('should return defaults for empty file', async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: {
        type: 'file',
        content: '',
        encoding: 'base64',
      },
    });
    const octokit = createMockOctokit(getContent);

    const config = await readRepoConfig(octokit, 'owner', 'repo');

    expect(config).toEqual(DEFAULT_REPO_CONFIG);
  });

  it('should merge partial config with defaults', async () => {
    const yaml = `
auto_merge: true
excluded_paths:
  - "vendor/"
`;
    const getContent = vi.fn().mockResolvedValue(fileResponse(yaml));
    const octokit = createMockOctokit(getContent);

    const config = await readRepoConfig(octokit, 'owner', 'repo');

    expect(config).toEqual({
      trigger_label: 'codepilot',
      max_cost_usd: 1.0,
      auto_merge: true,
      excluded_paths: ['vendor/'],
    });
  });

  it('should validate schema defaults correctly', () => {
    const result = RepoConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(DEFAULT_REPO_CONFIG);
    }
  });
});
