import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => import('../__mocks__/vscode'));

import * as vscode from 'vscode';
import { parseIssueInput, resolveIssue } from '../../commands/resolve-issue';
import type { CodePilotApiClient } from '../../api/client';

function createMockClient(overrides: Partial<CodePilotApiClient> = {}): CodePilotApiClient {
  return {
    checkHealth: vi.fn(),
    getQueueStats: vi.fn(),
    getRecentJobs: vi.fn(),
    getJobStatus: vi.fn(),
    enqueueIssue: vi.fn(),
    listRepos: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getRepo: vi.fn(),
    updateServerUrl: vi.fn(),
    ...overrides,
  } as unknown as CodePilotApiClient;
}

describe('parseIssueInput', () => {
  it('should parse a full GitHub URL', () => {
    const result = parseIssueInput('https://github.com/owner/repo/issues/123');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', issueNumber: 123 });
  });

  it('should parse shorthand format', () => {
    const result = parseIssueInput('owner/repo#42');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', issueNumber: 42 });
  });

  it('should return null for invalid input', () => {
    expect(parseIssueInput('invalid')).toBeNull();
    expect(parseIssueInput('')).toBeNull();
    expect(parseIssueInput('owner/repo')).toBeNull();
    expect(parseIssueInput('just some text')).toBeNull();
  });
});

describe('resolveIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do nothing when user cancels input', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);
    const client = createMockClient();

    await resolveIssue(client);

    expect(client.listRepos).not.toHaveBeenCalled();
  });

  it('should show error for invalid input format', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('invalid-input');
    const client = createMockClient();

    await resolveIssue(client);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Invalid issue format'),
    );
  });

  it('should show error when repo is not found', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('owner/repo#5');
    const client = createMockClient({
      listRepos: vi.fn().mockResolvedValue({ success: true, data: [] }),
    });

    await resolveIssue(client);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
    );
  });

  it('should enqueue issue when repo is found', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('owner/repo#5');
    const client = createMockClient({
      listRepos: vi.fn().mockResolvedValue({
        success: true,
        data: [{ owner: 'owner', repo: 'repo', installationId: 42 }],
      }),
      enqueueIssue: vi.fn().mockResolvedValue({
        success: true,
        data: { jobId: 'job-1' },
      }),
    });

    await resolveIssue(client);

    expect(client.enqueueIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        repoOwner: 'owner',
        repoName: 'repo',
        issueNumber: 5,
        installationId: 42,
        triggeredBy: 'api',
      }),
    );
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('enqueued successfully'),
    );
  });

  it('should show error when enqueue fails', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('owner/repo#5');
    const client = createMockClient({
      listRepos: vi.fn().mockResolvedValue({
        success: true,
        data: [{ owner: 'owner', repo: 'repo', installationId: 42 }],
      }),
      enqueueIssue: vi.fn().mockResolvedValue({
        success: false,
        error: 'Queue is full',
      }),
    });

    await resolveIssue(client);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Queue is full'),
    );
  });

  it('should show error when listRepos fails', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('owner/repo#5');
    const client = createMockClient({
      listRepos: vi.fn().mockResolvedValue({
        success: false,
        error: 'Connection refused',
      }),
    });

    await resolveIssue(client);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Connection refused'),
    );
  });

  it('should parse URL format and enqueue', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValue(
      'https://github.com/myorg/myrepo/issues/99',
    );
    const client = createMockClient({
      listRepos: vi.fn().mockResolvedValue({
        success: true,
        data: [{ owner: 'myorg', repo: 'myrepo', installationId: 7 }],
      }),
      enqueueIssue: vi.fn().mockResolvedValue({
        success: true,
        data: { jobId: 'job-99' },
      }),
    });

    await resolveIssue(client);

    expect(client.enqueueIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        repoOwner: 'myorg',
        repoName: 'myrepo',
        issueNumber: 99,
      }),
    );
  });
});
